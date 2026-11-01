/**
 * Automatic gain for the microphone stream (framework-free, tested). expo-audio records from Android's raw `MIC` source,
 * which has no automatic gain, so a voice outdoors or a little way from the phone arrives very quiet. The gain follows
 * the recent peak: it drops at once when the sound gets loud (never clips) and rises slowly when it gets quiet.
 * Samples are 16-bit little-endian PCM and are changed in place.
 */
export type GainState = { peak: number; gain: number };

export const MAX_GAIN = 6;
/** The peak the gain aims for, below the 32767 ceiling. */
const TARGET_PEAK = 22000;
/** Below this peak it is silence or the microphone's own noise: not amplified. */
const NOISE_FLOOR = 250;
/** The peak memory halves every this many seconds. */
const PEAK_HALF_LIFE_S = 1.5;
/** The gain can rise by at most this factor per buffer. */
const RISE = 1.25;

export const initialGain = (): GainState => ({ peak: 0, gain: 1 });

export function applyGain(samples: Int16Array, sampleRate: number, state: GainState): GainState {
  if (samples.length === 0) return state;
  let bufferPeak = 0;
  for (let i = 0; i < samples.length; i++) {
    const level = Math.abs(samples[i]);
    if (level > bufferPeak) bufferPeak = level;
  }
  const seconds = samples.length / Math.max(1, sampleRate);
  const peak = Math.max(bufferPeak, state.peak * Math.pow(0.5, seconds / PEAK_HALF_LIFE_S));
  const target = peak < NOISE_FLOOR ? 1 : Math.min(MAX_GAIN, Math.max(1, TARGET_PEAK / peak));
  // Down at once, up slowly.
  const gain = target < state.gain ? target : Math.min(target, state.gain * RISE);
  // Never clips, even on the buffer that made the gain drop.
  const safe = bufferPeak > 0 ? Math.min(gain, 32767 / bufferPeak) : gain;
  if (safe > 1.001) {
    for (let i = 0; i < samples.length; i++) {
      const value = Math.round(samples[i] * safe);
      samples[i] = value > 32767 ? 32767 : value < -32768 ? -32768 : value;
    }
  }
  return { peak, gain };
}
