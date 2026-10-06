# pi-prefill

[![npm version](https://img.shields.io/npm/v/pi-prefill.svg)](https://www.npmjs.com/package/pi-prefill) [![Download Stats](https://img.shields.io/npm/dm/pi-prefill.svg)](https://www.npmjs.com/package/pi-prefill) [![license](https://img.shields.io/npm/l/pi-prefill.svg)](LICENSE)

A [pi](https://pi.dev) extension that shows a live prefill progress bar in the loading line. It works with any server that reports prefill progress.

A long prefill can take many seconds. Without feedback, the loading line looks idle. You cannot tell a slow prefill from a hang. pi-prefill fills that gap with a real progress bar.

<img src="https://github.com/eliaskg/pi-prefill/raw/main/assets/prefill.svg" width="350" alt="pi-prefill loading line: prefill progress bar climbing to 100 percent">

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

| Engine | Status | Setup |
|---|---|---|
| **[llama.cpp](https://github.com/ggml-org/llama.cpp)** | &#x2714; supported | none. `llama.cpp` is in `providers` by default |
| **[ExLlamaV3](https://github.com/turboderp-org/exllamav3)** | &#x2714; supported via TabbyAPI | add your provider id to `providers` |
| **[Strata](https://github.com/Niko1221/Strata)** | &#x2714; supported | add your provider id to `providers` |
| **[vLLM](https://github.com/vllm-project/vllm)** | pending, [vllm#40371](https://github.com/vllm-project/vllm/pull/40371) | - |

All engines need `api: "openai-completions"` on the model. That is the API that defines `prompt_progress`.

pi-prefill sends `return_progress: true` for listed providers only. All engines default that flag to `false`. An unlisted provider gets no progress data and shows no bar. pi-prefill never guesses.

## Install

```bash
pi install npm:pi-prefill
```


## Configuration

Add a `prefill` key to `~/.pi/agent/settings.json`. It controls which parts the bar shows, in what order, and which providers are asked for progress.

```json
{
  "prefill": {
    "views": ["label", "bar", "percent", "tokens", "tps", "eta"],
    "providers": ["llama.cpp", "exllama"]
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

## License

MIT. See [LICENSE](LICENSE).
