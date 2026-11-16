/**
 * Prefill rate tracking.
 *
 * Some servers repeat a progress chunk unchanged. Maya sends a heartbeat that
 * carries the last `prompt_progress` value, so consecutive chunks can report the
 * same `processed`. A rate needs a positive token delta and a positive time
 * delta. Without both, keep the last known rate. The ETA then stays visible.
 *
 * The baseline moves only on a valid sample. The next rate spans the skipped
 * chunks instead of a zero-width window.
 */

export interface RateSample {
  computed: number;
  timeMs: number;
}

export interface RateState {
  prevComputed: number;
  prevTimeMs: number;
  rate: number | null;
}

export function freshRate(): RateState {
  return { prevComputed: 0, prevTimeMs: 0, rate: null };
}

export function sampleRate(state: RateState, sample: RateSample): number | null {
  const dComputed = sample.computed - state.prevComputed;
  const dTimeMs = sample.timeMs - state.prevTimeMs;
  if (dComputed > 0 && dTimeMs > 0) {
    state.rate = dComputed / (dTimeMs / 1000);
    state.prevComputed = sample.computed;
    state.prevTimeMs = sample.timeMs;
  }
  return state.rate;
}
