import { ExpoSpeechRecognitionModule, type ExpoSpeechRecognitionErrorCode } from "expo-speech-recognition";
import { chooseRecognizer } from "./voice-command";

/**
 * expo-speech-recognition glue for the assistant (untested): Android's own speech recognizer, which on the owner's
 * phone is Speech Services by Google. "wake" listens continuously for the call by name, "question" takes one sentence.
 * Offline recognition is preferred (`EXTRA_PREFER_OFFLINE`), so the audio stays on the phone when the language pack
 * is installed; without it the recognizer may send audio to its provider, which the Assistant page says.
 */
export type ListenMode = "wake" | "question";

export type VoiceHandlers = {
  onResult: (transcript: string, isFinal: boolean) => void;
  onEnd: () => void;
  onError: (code: ExpoSpeechRecognitionErrorCode) => void;
};

/** The recognition service to name in every session (see chooseRecognizer), or null when the phone has none. */
export function recognizer(): string | null {
  try {
    const installed = ExpoSpeechRecognitionModule.getSpeechRecognitionServices();
    let fallback: string | null = null;
    try {
      fallback = ExpoSpeechRecognitionModule.getDefaultRecognitionService().packageName || null;
    } catch {
      fallback = null;
    }
    return chooseRecognizer(installed, fallback);
  } catch {
    return null;
  }
}

export function voiceAvailable(): boolean {
  return recognizer() !== null;
}

export async function micAllowed(): Promise<boolean> {
  try {
    return (await ExpoSpeechRecognitionModule.getPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

export async function askMic(): Promise<boolean> {
  try {
    return (await ExpoSpeechRecognitionModule.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

export function startListening(locale: string, mode: ListenMode): boolean {
  const service = recognizer();
  if (!service) return false;
  try {
    ExpoSpeechRecognitionModule.start({
      androidRecognitionServicePackage: service,
      lang: locale,
      interimResults: true,
      maxAlternatives: 1,
      continuous: mode === "wake",
      androidIntentOptions: {
        EXTRA_PREFER_OFFLINE: true,
        ...(mode === "question" ? { EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 1500 } : {}),
      },
    });
    return true;
  } catch {
    return false;
  }
}

export function stopListening(): void {
  try {
    ExpoSpeechRecognitionModule.abort();
  } catch {
    // Not listening: nothing to stop.
  }
}

/** Subscribes to the recognizer; returns the unsubscribe. */
export function listenToVoice(handlers: VoiceHandlers): () => void {
  const subs = [
    ExpoSpeechRecognitionModule.addListener("result", event => handlers.onResult(event.results[0]?.transcript ?? "", event.isFinal)),
    ExpoSpeechRecognitionModule.addListener("end", () => handlers.onEnd()),
    ExpoSpeechRecognitionModule.addListener("error", event => handlers.onError(event.error)),
  ];
  return () => subs.forEach(sub => sub.remove());
}

/** Asks the recognizer to download its offline pack for the language (Android 13+); the result says what happened. */
export async function downloadOfflinePack(locale: string): Promise<"done" | "dialog" | "scheduled" | "failed"> {
  try {
    const result = await ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload({ locale });
    return result.status === "download_success" ? "done" : result.status === "opened_dialog" ? "dialog" : "scheduled";
  } catch {
    return "failed";
  }
}
