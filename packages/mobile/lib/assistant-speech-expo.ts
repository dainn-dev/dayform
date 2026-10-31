import * as Speech from "expo-speech";
import { pickVoice, speakableText, speechLocale, voicePitch, voicesFor, type SpeechLanguage, type VoiceInfo } from "./assistant-speech";

/** expo-speech glue for the assistant (untested); the choices are made in assistant-speech.ts. */

let voices: Speech.Voice[] | null = null;

async function voicesNow(): Promise<Speech.Voice[]> {
  // The Android engine can answer with an empty list until it has started; ask again next time in that case.
  if (voices && voices.length > 0) return voices;
  try {
    voices = await Speech.getAvailableVoicesAsync();
  } catch {
    voices = [];
  }
  return voices;
}

/** The phone's voices for the language, best first. Empty when there are none (or the engine is not ready). */
export async function listVoices(language: SpeechLanguage): Promise<VoiceInfo[]> {
  return voicesFor(await voicesNow(), language);
}

export type SpeakHandlers = { onStart: () => void; onDone: () => void };

/**
 * Reads `text` aloud with the chosen voice (`preferred`, "" = automatic), cutting off anything Leo was still saying.
 * Resolves false (and calls nothing) when there is no voice for the language or the engine fails, so the caller falls
 * back to its own timing.
 */
export async function speakLine(text: string, language: SpeechLanguage, handlers: SpeakHandlers, preferred = ""): Promise<boolean> {
  const voice = pickVoice(await voicesNow(), language, preferred);
  if (!voice) return false;
  try {
    Speech.stop();
    let ended = false;
    const end = () => {
      if (ended) return;
      ended = true;
      handlers.onDone();
    };
    Speech.speak(speakableText(text, language), {
      language: speechLocale(language),
      voice,
      pitch: voicePitch(language),
      rate: 1.0,
      onStart: handlers.onStart,
      onDone: end,
      onStopped: end,
      onError: end,
    });
    return true;
  } catch {
    return false;
  }
}

export function stopSpeaking(): void {
  try {
    Speech.stop();
  } catch {
    // Nothing is being said, or the engine is gone: either way there is nothing to stop.
  }
}
