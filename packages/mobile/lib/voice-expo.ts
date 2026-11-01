import { Linking } from "react-native";
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

/** Services that answered "language not downloaded" for a locale in this run of the app. */
const lacking = new Map<string, Set<string>>();

/** Remembers that the service last used for `locale` lacks it; true when another service is left to try. */
export function skipServiceFor(locale: string): boolean {
  const service = recognizer(locale);
  if (!service) return false;
  const set = lacking.get(locale) ?? new Set<string>();
  set.add(service);
  lacking.set(locale, set);
  return recognizer(locale) !== null;
}

/** The recognition service to name in every session (see chooseRecognizer), or null when the phone has none. */
export function recognizer(locale = ""): string | null {
  try {
    const installed = ExpoSpeechRecognitionModule.getSpeechRecognitionServices();
    let fallback: string | null = null;
    try {
      fallback = ExpoSpeechRecognitionModule.getDefaultRecognitionService().packageName || null;
    } catch {
      fallback = null;
    }
    return chooseRecognizer(installed, fallback, [...(lacking.get(locale) ?? [])]);
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
  const service = recognizer(locale);
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

/**
 * Gets the offline pack for the language. Only a phone with Android's on-device recognizer can download it from the
 * app: on others the library's call throws on the main thread and closes the app (seen on the owner's vivo), so
 * there it opens the phone's text-to-speech settings instead, where Speech Services by Google manages its languages.
 */
export async function downloadOfflinePack(locale: string): Promise<"done" | "dialog" | "scheduled" | "settings" | "failed"> {
  let onDevice = false;
  try {
    onDevice = ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
  } catch {
    onDevice = false;
  }
  if (!onDevice) {
    try {
      await Linking.sendIntent("com.android.settings.TTS_SETTINGS");
      return "settings";
    } catch {
      return "failed";
    }
  }
  try {
    const result = await ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload({ locale });
    return result.status === "download_success" ? "done" : result.status === "opened_dialog" ? "dialog" : "scheduled";
  } catch {
    return "failed";
  }
}
