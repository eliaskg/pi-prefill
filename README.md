# pi-prefill

A [pi](https://pi.dev) extension that shows a live prefill progress bar in the loading line. It works with any server that reports prefill progress, including llama.cpp and TabbyAPI / ExLlamaV3.

A long prefill can take many seconds. Without feedback, the loading line looks idle. You cannot tell a slow prefill from a hang. pi-prefill fills that gap with a real progress bar.

```
prefill [██████░░░░░░] 52% gen in ~14s
```

## What it shows

The bar tracks non-cached work only. Cached prompt tokens do not count as progress.

| Part | Meaning |
|---|---|
| `prefill` | Label. |
| `[██████░░░░░░]` | Progress bar. |
| `52%` | Percent of uncached tokens processed. |
| `3.4k tok/s` | Instantaneous prefill rate. |
| `gen in ~4s` | Estimated time until the first token. |
| `14.1k/27.3k` | Processed / total prompt tokens. |

You choose which parts to show. See [Configuration](#configuration).

## Supported Engines

| Engine | Backend | Setup |
|---|---|---|
| **llama.cpp** | any build with router support | none. `llama.cpp` is in `providers` by default. |
| **TabbyAPI** | ExLlamaV3 | add your provider id to `providers`. |

All engines need `api: "openai-completions"` on the model. That is the API that defines `prompt_progress`.

pi-prefill sends `return_progress: true` for listed providers only. All engines default that flag to `false`. An unlisted provider gets no progress data and shows no bar. The same holds for a server without support, such as vLLM. pi-prefill never guesses.

## Install

```bash
pi install npm:pi-prefill
```


## Configuration

Add a `piPrefill` key to `~/.pi/agent/settings.json`. It controls which parts the bar shows, in what order, and which providers are asked for progress.

```json
{
  "piPrefill": {
    "views": ["label", "bar", "percent", "tokens", "tps", "eta"],
    "providers": ["llama.cpp"]
  }
}
```

Valid view names: `label`, `bar`, `percent`, `tokens`, `tps`, `eta`. Default when unset: `["label", "bar", "percent", "tokens", "eta"]`.

`providers` lists provider ids that receive `return_progress: true`. Default: `["llama.cpp"]`. Add your TabbyAPI or compatible-endpoint provider id to enable it there. Set it to `[]` to never modify a request. See [Enabling progress](#enabling-progress).

pi reads this file on `session_start`. Restart pi after you change it.

## How it decides

pi parses each stream chunk and forwards it to extensions through `provider_stream_event`. pi-prefill reads that event. It never inspects a host name, an IP address, or a `baseUrl`.

| Server behaviour | Result |
|---|---|
| Stream carries `prompt_progress` | bar is shown |
| Stream has no `prompt_progress` | nothing is shown, pi's own loading line stays |

The response decides. A cloud request, a proxy, or a server without progress support produces no output.

### Enabling progress

llama.cpp and TabbyAPI emit progress only when the request asks for it. `return_progress` defaults to `false` on both. pi-prefill adds the flag when both conditions hold:

- the model `api` is `openai-completions`;
- the model `provider` is listed in `providers`.

This is a protocol and provider check, not a host check. It also keeps strict gateways safe. Fireworks and Azure OpenAI reject unknown body fields with `400 Extra inputs are not permitted`.

### Short prefills

A bar that appears for 20 ms is noise. pi-prefill waits before it draws:

- uncached total above 1024 tokens: draw at once;
- otherwise: draw only if prefill runs longer than 300 ms.

Cached tokens never count as progress.

### Background cache warm

pi keeps provider prompt caches warm (`cacheWarming` setting, default `"streaming"`). A warm request is a real request, so it reaches the same hooks. With `cacheWarming: "idle"`, a long warm prefill can draw a bar between your messages. Set `cacheWarming` to `"off"` if you do not want that.

## Debug

Set `PI_PREFILL_DEBUG=1` to log each inject, progress, and generation boundary:

```bash
PI_PREFILL_DEBUG=1 pi
```

The log goes to `/tmp/pi-prefill-debug.log`. Set `PI_PREFILL_DEBUG_LOG` to change the path.

## How it works

1. On `session_start`, pi-prefill reads `piPrefill` from `~/.pi/agent/settings.json`.
2. On `before_provider_request`, it adds `return_progress: true` when the model `api` and `provider` both match. Every other payload stays unchanged.
3. On `provider_stream_event`, it reads the top-level `prompt_progress` field. If the field is absent, it does nothing.
4. It renders the bar with `setWorkingMessage`. Progress counts uncached tokens only. The rate comes from the delta between consecutive chunks.
5. The first content, tool-call, reasoning, or finish token clears the line. pi-prefill clears only text it wrote itself, so pi keeps its own loading line elsewhere. There is no post-prefill readout.

## License

MIT. See [LICENSE](LICENSE).
