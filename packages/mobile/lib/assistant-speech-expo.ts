import * as Speech from "expo-speech";
import { pickVoice, speechLocale, type SpeechLanguage } from "./assistant-speech";

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

export type SpeakHandlers = { onStart: () => void; onDone: () => void };

/**
 * Reads `text` aloud, cutting off anything Leo was still saying. Resolves false (and calls nothing) when there is no
 * voice for the language or the engine fails, so the caller falls back to its own timing.
 */
export async function speakLine(text: string, language: SpeechLanguage, handlers: SpeakHandlers): Promise<boolean> {
  const voice = pickVoice(await voicesNow(), language);
  if (!voice) return false;
  try {
    Speech.stop();
    let ended = false;
    const end = () => {
      if (ended) return;
      ended = true;
      handlers.onDone();
    };
    Speech.speak(text, {
      language: speechLocale(language),
      voice,
      pitch: 1.25,
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
