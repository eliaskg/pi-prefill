import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

/**
 * pi-prefill
 *
 * Shows a live prefill progress bar in the pi working (loading) line.
 *
 * Decision rule: show the bar only when the server sends prefill progress.
 * No host name, IP range, or address is inspected. The response decides.
 *
 *   - Pi forwards every parsed stream chunk to `provider_stream_event`.
 *   - A chunk with a top-level `prompt_progress` object drives the bar.
 *   - A chunk without it shows nothing. Cloud providers stay untouched.
 *   - llama.cpp and TabbyAPI emit progress only when the request asks for it.
 *     Pi adds `return_progress: true` for `openai-completions` models whose
 *     provider id is listed in `returnProgressProviders`. Default: `llama.cpp`.
 *
 * Config (settings.json, key "piPrefill"):
 *   {
 *     "piPrefill": {
 *       "views": ["label", "bar", "percent", "tokens", "eta"],
 *       "returnProgressProviders": ["llama.cpp"]
 *     }
 *   }
 *
 * Set `returnProgressProviders` to [] to never touch a request body. The bar
 * then appears only for a server that sends progress unprompted.
 *
 * Debug: set PI_PREFILL_DEBUG=1 to log to /tmp/pi-prefill-debug.log.
 */

const STATUS_KEY = "pi-prefill";

// The only API that defines return_progress and prompt_progress.
const OPENAI_COMPLETIONS_API = "openai-completions";
const DEFAULT_PROGRESS_PROVIDERS = ["llama.cpp"];

// Significance thresholds. They stop a bar flash on a short prefill.
const SIGNIFICANT_TOKENS = 1024;
const SIGNIFICANT_MS = 300;

// Display.
const BAR_WIDTH = 10;

const ALL_VIEWS = ["label", "bar", "percent", "tokens", "tps", "eta"] as const;
type View = (typeof ALL_VIEWS)[number];
const DEFAULT_VIEWS: View[] = ["label", "bar", "percent", "tokens", "eta"];
let views: View[] = DEFAULT_VIEWS;
let progressProviders = new Set<string>(DEFAULT_PROGRESS_PROVIDERS);

interface State {
  assessed: boolean;
  tracking: boolean;
  rendered: boolean;
  genStarted: boolean;
  firstTs: number;
  prevProcessed: number;
  prevTimeMs: number;
}

const freshState = (): State => ({
  assessed: false,
  tracking: false,
  rendered: false,
  genStarted: false,
  firstTs: 0,
  prevProcessed: 0,
  prevTimeMs: 0,
});

let ui: {
  setStatus: (key: string, text: string | undefined) => void;
  setWorkingMessage: (msg?: string) => void;
  theme: { fg: (color: string, text: string) => string };
} | undefined;
let hasUi = false;
let state = freshState();

// Optional troubleshooting. Set PI_PREFILL_DEBUG=1 to append a log line at each
// inject/progress/generation boundary. Inert unless the env var is set.
function dbg(msg: string): void {
  if (!process.env.PI_PREFILL_DEBUG) return;
  try {
    const path = process.env.PI_PREFILL_DEBUG_LOG || "/tmp/pi-prefill-debug.log";
    appendFileSync(path, `${new Date().toISOString()} ${msg}\n`);
  } catch {
    // debug is best-effort
  }
}

// --- config ------------------------------------------------------------------

function loadConfig(): void {
  try {
    const raw = readFileSync(join(getAgentDir(), "settings.json"), "utf8");
    const cfg = JSON.parse(raw);
    const v = cfg?.piPrefill?.views;
    if (Array.isArray(v)) {
      const picked = v.filter(
        (x: unknown): x is View =>
          typeof x === "string" && (ALL_VIEWS as readonly string[]).includes(x),
      );
      if (picked.length > 0) views = picked;
    }
    const p = cfg?.piPrefill?.returnProgressProviders;
    if (Array.isArray(p)) {
      // An empty list is a valid choice: never inject the flag.
      progressProviders = new Set(
        p
          .filter((x: unknown): x is string => typeof x === "string")
          .map((x) => x.trim().toLowerCase())
          .filter(Boolean),
      );
    }
  } catch {
    // keep defaults
  }
}

// --- stream chunks -----------------------------------------------------------

interface Progress {
  total: number;
  cache: number;
  processed: number;
  time_ms: number;
}

function readProgress(obj: any): Progress | undefined {
  const pp = obj?.prompt_progress;
  if (!pp || typeof pp !== "object") return undefined;
  if (typeof pp.total !== "number") return undefined;
  return {
    total: pp.total,
    cache: typeof pp.cache === "number" ? pp.cache : 0,
    processed: typeof pp.processed === "number" ? pp.processed : 0,
    time_ms: typeof pp.time_ms === "number" ? pp.time_ms : 0,
  };
}

function isGenerationStart(obj: any): boolean {
  const choice = obj?.choices?.[0];
  const delta = choice?.delta;
  const finish = choice?.finish_reason;
  if (finish != null) return true;
  if (delta == null) return false;
  return (
    (typeof delta.content === "string" && delta.content.length > 0) ||
    Array.isArray(delta.content) ||
    Array.isArray(delta.tool_calls) ||
    (typeof delta.reasoning_content === "string" && delta.reasoning_content.length > 0) ||
    (typeof delta.reasoning === "string" && delta.reasoning.length > 0)
  );
}

function handleChunk(obj: any): void {
  if (state.genStarted) return;
  if (isGenerationStart(obj)) {
    onGenerationStart();
    return;
  }
  const pp = readProgress(obj);
  if (pp) onProgress(pp);
}

// --- live bar ----------------------------------------------------------------

function onProgress(pp: Progress): void {
  const uncachedTotal = Math.max(0, pp.total - pp.cache);
  if (!state.assessed) {
    state.assessed = true;
    state.firstTs = Date.now();
    if (uncachedTotal > SIGNIFICANT_TOKENS) state.tracking = true;
  } else if (!state.tracking && Date.now() - state.firstTs > SIGNIFICANT_MS) {
    state.tracking = true;
  }
  dbg(
    `progress total=${pp.total} cache=${pp.cache} processed=${pp.processed} time_ms=${pp.time_ms} tracking=${state.tracking}`,
  );
  if (!state.tracking) return;
  // Instantaneous rate from the delta between consecutive chunks. More accurate
  // than a cumulative rate when prefill speed drops as context grows.
  let rate: number | null = null;
  const dProcessed = pp.processed - state.prevProcessed;
  const dTimeMs = pp.time_ms - state.prevTimeMs;
  if (dProcessed > 0 && dTimeMs > 0) rate = dProcessed / (dTimeMs / 1000);
  state.prevProcessed = pp.processed;
  state.prevTimeMs = pp.time_ms;
  updateBar(pp, rate);
}

function updateBar(pp: Progress, rate: number | null): void {
  const uncachedTotal = Math.max(0, pp.total - pp.cache);
  const computed = Math.max(0, pp.processed - pp.cache);
  const pct = uncachedTotal > 0 ? Math.min(1, computed / uncachedTotal) : 1;
  let etaSec: number | null = null;
  if (rate != null && rate > 0) {
    const remaining = Math.max(0, pp.total - pp.processed);
    if (remaining > 0) etaSec = remaining / rate;
  }
  renderBar(pct, etaSec, pp.processed, pp.total, rate);
}

function fmt(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

function etaText(sec: number): string {
  if (sec < 1) return "gen now";
  if (sec < 60) return `gen in ~${Math.ceil(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `gen in ~${m}m${s ? " " + s + "s" : ""}`;
}

function renderBar(
  pct: number,
  etaSec: number | null,
  processed: number,
  total: number,
  rate: number | null,
): void {
  if (!ui || !hasUi) return;
  const t = ui.theme;
  const parts: string[] = [];
  for (const v of views) {
    if (v === "label") parts.push(t.fg("muted", "prefill"));
    else if (v === "bar") {
      const filled = Math.round(pct * BAR_WIDTH);
      const empty = BAR_WIDTH - filled;
      parts.push("[" + t.fg("success", "█".repeat(filled)) + t.fg("dim", "░".repeat(empty)) + "]");
    } else if (v === "percent") parts.push(t.fg("text", Math.round(pct * 100) + "%"));
    else if (v === "tokens") parts.push(t.fg("muted", `${fmt(processed)}/${fmt(total)}`));
    else if (v === "tps") {
      if (rate != null && rate > 0) parts.push(t.fg("accent", `${fmt(Math.round(rate))} tok/s`));
    } else if (v === "eta") {
      if (etaSec != null) parts.push(t.fg("accent", etaText(etaSec)));
    }
  }
  const text = parts.join(" ").trim();
  if (!text) return;
  state.rendered = true;
  ui.setWorkingMessage(text);
}

// --- lifecycle ---------------------------------------------------------------

function onGenerationStart(): void {
  if (state.genStarted) return;
  state.genStarted = true;
  dbg("generation started");
  clearLine();
}

/**
 * Clear the line, but only if this extension wrote it. pi owns the working
 * message otherwise. Cloud requests never set it, so their loading line stays.
 */
function clearLine(): void {
  if (!state.rendered) return;
  state.rendered = false;
  if (ui && hasUi) {
    ui.setStatus(STATUS_KEY, undefined);
    ui.setWorkingMessage();
  }
}

// --- wiring ------------------------------------------------------------------

function captureCtx(ctx: ExtensionContext): void {
  hasUi = ctx.hasUI;
  ui = ctx.ui as unknown as typeof ui;
}

function shouldRequestProgress(ctx: ExtensionContext): boolean {
  const api = ctx.model?.api;
  const provider = ctx.model?.provider;
  if (api !== OPENAI_COMPLETIONS_API) return false;
  if (typeof provider !== "string") return false;
  return progressProviders.has(provider.toLowerCase());
}

export default function (pi: ExtensionAPI): void {
  pi.on("session_start", (_event, ctx) => {
    captureCtx(ctx);
    loadConfig();
    dbg(
      `start views=${views.join(",")} providers=${[...progressProviders].join(",") || "(none)"}`,
    );
  });

  pi.on("model_select", (_event, ctx) => {
    captureCtx(ctx);
  });

  pi.on("before_provider_request", (event, ctx) => {
    captureCtx(ctx);
    state = freshState();

    const payload = event.payload as Record<string, unknown> | undefined;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return;
    if (payload.stream === false) return;
    if (!shouldRequestProgress(ctx)) return;

    dbg(`inject return_progress provider=${ctx.model?.provider}`);
    return { ...payload, return_progress: true };
  });

  // The decision point. pi parses each stream chunk and forwards it here before
  // normalization. Nothing shows unless the chunk carries prompt_progress.
  pi.on("provider_stream_event", (event) => {
    handleChunk(event.data);
  });

  pi.on("agent_settled", () => {
    clearLine();
  });

  pi.on("session_shutdown", () => {
    clearLine();
  });
}