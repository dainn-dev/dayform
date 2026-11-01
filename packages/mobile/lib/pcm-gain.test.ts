import { describe, expect, test } from "bun:test";
import { applyGain, initialGain, MAX_GAIN } from "./pcm-gain";

const tone = (amplitude: number, length = 1600) => Int16Array.from({ length }, (_, i) => Math.round(amplitude * Math.sin(i / 5)));
const peakOf = (samples: Int16Array) => samples.reduce((max, value) => Math.max(max, Math.abs(value)), 0);

describe("automatic gain", () => {
  test("silence and the microphone's own noise are left alone", () => {
    const noise = tone(100);
    const before = Array.from(noise);
    const state = applyGain(noise, 16000, initialGain());
    expect(Array.from(noise)).toEqual(before);
    expect(state.gain).toBe(1);
  });

  test("a quiet voice is raised, slowly and never above the maximum", () => {
    let state = initialGain();
    let last = 0;
    for (let i = 0; i < 30; i++) {
      const buffer = tone(1500);
      state = applyGain(buffer, 16000, state);
      last = peakOf(buffer);
      expect(state.gain).toBeLessThanOrEqual(MAX_GAIN);
    }
    expect(last).toBeGreaterThan(1500 * 3);
    expect(state.gain).toBeCloseTo(MAX_GAIN, 5);
  });

  test("the gain rises step by step, not in one jump", () => {
    const first = applyGain(tone(1500), 16000, initialGain());
    expect(first.gain).toBeCloseTo(1.25, 5);
  });

  test("a loud burst after quiet drops the gain at once and never clips", () => {
    let state = initialGain();
    for (let i = 0; i < 30; i++) state = applyGain(tone(1500), 16000, state);
    const loud = tone(30000);
    state = applyGain(loud, 16000, state);
    expect(peakOf(loud)).toBeLessThanOrEqual(32767);
    expect(state.gain).toBeLessThan(1.1);
  });

  test("an empty buffer changes nothing", () => {
    const state = initialGain();
    expect(applyGain(new Int16Array(0), 16000, state)).toBe(state);
  });
});
