import { describe, expect, test } from "bun:test";
import { applyRt, emptyRt, liveText, rtConfig, SONIOX_RT_MODEL } from "./soniox-rt";

const tokens = (...list: [string, boolean][]) => ({ tokens: list.map(([text, is_final]) => ({ text, is_final })) });

describe("Soniox real time", () => {
  test("the config streams raw 16-bit mono PCM with the app's language and endpoint detection", () => {
    expect(rtConfig("vi", 16000.4)).toEqual({
      model: SONIOX_RT_MODEL, audio_format: "pcm_s16le", sample_rate: 16000, num_channels: 1,
      language_hints: ["vi"], enable_endpoint_detection: true, max_endpoint_delay_ms: 1000,
    });
  });

  test("provisional words show at once and are replaced by the next answer", () => {
    let state = emptyRt();
    state = applyRt(state, tokens(["Hôm", false], [" nay", false])).state;
    expect(liveText(state)).toBe("Hôm nay");
    state = applyRt(state, tokens(["Hôm nay", true], [" có", false])).state;
    expect(liveText(state)).toBe("Hôm nay có");
  });

  test("the <end> token closes an utterance and starts the next one", () => {
    let state = emptyRt();
    state = applyRt(state, tokens(["Leo", true], [" ơi", true])).state;
    const ended = applyRt(state, tokens(["<end>", true], ["hôm", false]));
    expect(ended.utterances).toEqual(["Leo ơi"]);
    expect(liveText(ended.state)).toBe("hôm");
    expect(ended.state.finalText).toBe("");
  });

  test("an <end> with nothing said gives no utterance", () => {
    expect(applyRt(emptyRt(), tokens(["<end>", true])).utterances).toEqual([]);
  });

  test("finished and errors are reported", () => {
    expect(applyRt(emptyRt(), { tokens: [], finished: true }).finished).toBe(true);
    const error = applyRt(emptyRt(), { error_code: 401, error_type: "unauthenticated", error_message: "Invalid API key" });
    expect(error).toMatchObject({ finished: true, error: "Invalid API key" });
  });

  test("odd answers change nothing", () => {
    const state = { finalText: "a", partial: "b" };
    expect(applyRt(state, "nope").state).toBe(state);
    expect(applyRt(state, { tokens: [{ text: 5 }] }).state).toEqual({ finalText: "a", partial: "" });
  });
});
