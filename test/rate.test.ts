import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { freshRate, sampleRate } from "../extensions/rate.ts";

describe("sampleRate", () => {
  it("uses the cumulative rate for the first sample", () => {
    const state = freshRate();
    // 100 uncached tokens read in 250 ms
    assert.equal(sampleRate(state, { computed: 100, timeMs: 250 }), 400);
  });

  it("updates the rate when tokens and time advance", () => {
    const state = freshRate();
    sampleRate(state, { computed: 100, timeMs: 250 });
    // 50 more tokens in 100 ms
    assert.equal(sampleRate(state, { computed: 150, timeMs: 350 }), 500);
  });

  it("keeps the last rate on a repeated chunk", () => {
    const state = freshRate();
    sampleRate(state, { computed: 100, timeMs: 250 });
    // maya heartbeat: same processed, later time
    assert.equal(sampleRate(state, { computed: 100, timeMs: 400 }), 400);
  });

  it("keeps the last rate when the time clock does not advance", () => {
    const state = freshRate();
    sampleRate(state, { computed: 100, timeMs: 250 });
    // rounded time_ms equal to the previous value
    assert.equal(sampleRate(state, { computed: 120, timeMs: 250 }), 400);
  });

  it("spans skipped chunks in the next rate", () => {
    const state = freshRate();
    sampleRate(state, { computed: 100, timeMs: 250 });
    sampleRate(state, { computed: 100, timeMs: 400 }); // repeated chunk
    // 50 tokens over the 250 ms since the last real sample
    assert.equal(sampleRate(state, { computed: 150, timeMs: 500 }), 200);
  });

  it("returns null until a rate exists", () => {
    const state = freshRate();
    assert.equal(sampleRate(state, { computed: 0, timeMs: 0 }), null);
    assert.equal(sampleRate(state, { computed: 0, timeMs: 120 }), null);
  });
});
