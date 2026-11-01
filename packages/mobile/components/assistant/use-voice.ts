import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import type { ExpoSpeechRecognitionErrorCode } from "expo-speech-recognition";
import { detectWake, restartDelay } from "../../lib/voice-command";
import { askMic, languageMissing, listenToVoice, micAllowed, startListening, stopListening } from "../../lib/voice-expo";

export type VoiceMode = "off" | "wake" | "question";

type Params = {
  /** Listen for the call by name while the app is open (settings.assistant.wakeWord). */
  wakeEnabled: boolean;
  name: string;
  /** "vi-VN" or "en-US". */
  locale: string;
  /** True while the assistant is speaking or busy: the call-by-name listening pauses, so it never hears itself. */
  paused: boolean;
  /** The name was heard on its own: the assistant should look attentive while the question is taken. */
  onWake: () => void;
  /** What the user is saying, as it is recognised (for the bubble). */
  onInterim: (text: string) => void;
  /** The sentence that was said; "" when the user said nothing. */
  onHeard: (text: string) => void;
  onError: (code: ExpoSpeechRecognitionErrorCode) => void;
};

const RESTART_MS = 300;
/** A wake session shorter than this that heard nothing counts as a failure (see restartDelay). */
const QUICK_END_MS = 1500;
/** Errors after which the call-by-name listening stops until it is switched on again. */
const FATAL: ReadonlySet<ExpoSpeechRecognitionErrorCode> = new Set(["not-allowed", "service-not-allowed", "language-not-supported", "audio-capture"]);

/**
 * The assistant's microphone: listening for its name while the app is open, and taking one sentence on request (after
 * the name, from the chat's microphone button or a long press). The words are understood in lib/voice-command.ts.
 */
export function useVoice({ wakeEnabled, name, locale, paused, onWake, onInterim, onHeard, onError }: Params) {
  const [mode, setModeState] = useState<VoiceMode>("off");
  const modeRef = useRef<VoiceMode>("off");
  const [active, setActive] = useState(AppState.currentState === "active");
  const [allowed, setAllowed] = useState(false);
  const failed = useRef(false);
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A call with the question in the same breath ("Leo ơi hôm nay có gì") waits for the final words.
  const pendingRest = useRef(false);
  // Back-off for a recognizer that keeps ending at once: when the session started, whether it heard anything, and the run of failures.
  const sessionStart = useRef(0);
  const heardSomething = useRef(false);
  const quickFailures = useRef(0);

  const latest = useRef({ name, locale, onWake, onInterim, onHeard, onError, shouldWake: false });
  const shouldWake = wakeEnabled && !paused && active && allowed && !failed.current;
  latest.current = { name, locale, onWake, onInterim, onHeard, onError, shouldWake };

  const setMode = (next: VoiceMode) => {
    modeRef.current = next;
    setModeState(next);
  };

  const begin = useCallback((next: ListenModeOrOff) => {
    if (restartTimer.current) clearTimeout(restartTimer.current);
    restartTimer.current = null;
    if (next === "off") {
      setMode("off");
      stopListening();
      return;
    }
    setMode(next);
    pendingRest.current = false;
    sessionStart.current = Date.now();
    heardSomething.current = false;
    if (!startListening(latest.current.locale, next)) {
      setMode("off");
      failed.current = true;
      latest.current.onError("service-not-allowed");
    }
  }, []);

  useEffect(() => { void micAllowed().then(setAllowed); }, [wakeEnabled]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", state => setActive(state === "active"));
    return () => sub.remove();
  }, []);

  // A new switch-on gets a fresh chance after a fatal error.
  useEffect(() => {
    if (!wakeEnabled) return;
    failed.current = false;
    quickFailures.current = 0;
  }, [wakeEnabled]);

  useEffect(() => listenToVoice({
    onResult: (transcript, isFinal) => {
      const current = modeRef.current;
      if (transcript.trim()) {
        heardSomething.current = true;
        quickFailures.current = 0;
      }
      if (current === "wake") {
        const match = detectWake(transcript, latest.current.name);
        if (!match.heard) return;
        if (match.rest && !isFinal) {
          pendingRest.current = true;
          return;
        }
        modeRef.current = "off";
        stopListening();
        if (match.rest) {
          setMode("off");
          latest.current.onHeard(match.rest);
        } else {
          latest.current.onWake();
          restartTimer.current = setTimeout(() => begin("question"), RESTART_MS);
        }
        return;
      }
      if (current === "question") {
        latest.current.onInterim(transcript);
        if (isFinal) {
          setMode("off");
          stopListening();
          latest.current.onHeard(transcript.trim());
        }
      }
    },
    onEnd: () => {
      const current = modeRef.current;
      if (current === "question") {
        // Ended without a final sentence: the user said nothing.
        setMode("off");
        latest.current.onHeard("");
        return;
      }
      if (current === "wake") {
        // The recognizer stops after a while of silence; keep listening for the name, waiting longer after each
        // session that ended at once without hearing anything, and giving up after a run of them.
        setMode("off");
        const quick = !heardSomething.current && Date.now() - sessionStart.current < QUICK_END_MS;
        quickFailures.current = quick ? quickFailures.current + 1 : 0;
        const delay = restartDelay(quickFailures.current);
        if (delay === null) {
          failed.current = true;
          latest.current.onError("service-not-allowed");
          return;
        }
        if (latest.current.shouldWake) {
          restartTimer.current = setTimeout(() => {
            restartTimer.current = null;
            if (latest.current.shouldWake && modeRef.current === "off") begin("wake");
          }, delay);
        }
      }
    },
    onError: code => {
      // No pack for the language: the next session asks over the network, then another service (see languageMissing).
      if (code === "language-not-supported" && languageMissing(latest.current.locale)) {
        quickFailures.current = 0;
        if (modeRef.current === "question") {
          // A sentence was being taken: take it again at once with the new setting.
          restartTimer.current = setTimeout(() => { restartTimer.current = null; begin("question"); }, RESTART_MS);
        }
        return;
      }
      if (FATAL.has(code)) {
        failed.current = true;
        const wasQuestion = modeRef.current === "question";
        setMode("off");
        latest.current.onError(code);
        if (wasQuestion) latest.current.onHeard("");
      }
      // Other errors (no speech, timeouts, busy) end the session; "end" decides what comes next.
    },
  }), [begin]);

  // Start or stop listening for the name as the app, the switch and the assistant's state allow.
  useEffect(() => {
    if (shouldWake && modeRef.current === "off" && !restartTimer.current) begin("wake");
    else if (!shouldWake && modeRef.current === "wake") begin("off");
  }, [shouldWake, begin]);

  useEffect(() => () => {
    if (restartTimer.current) clearTimeout(restartTimer.current);
    stopListening();
  }, []);

  /** Takes one sentence now (asking for the microphone the first time). Resolves false when it cannot listen. */
  const capture = useCallback(async (): Promise<boolean> => {
    let ok = allowed || await micAllowed();
    if (!ok) ok = await askMic();
    setAllowed(ok);
    if (!ok) return false;
    if (modeRef.current !== "off") {
      modeRef.current = "off";
      stopListening();
      restartTimer.current = setTimeout(() => begin("question"), RESTART_MS);
    } else {
      begin("question");
    }
    return true;
  }, [allowed, begin]);

  /** Stops whatever it is listening to (the name listening resumes by itself when allowed). */
  const cancel = useCallback(() => begin("off"), [begin]);

  return { mode, capture, cancel, allowed };
}

type ListenModeOrOff = "wake" | "question" | "off";
