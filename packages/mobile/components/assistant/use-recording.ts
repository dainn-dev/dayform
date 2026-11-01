import { useCallback, useEffect, useRef, useState } from "react";
import { requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, type RecordingOptions } from "expo-audio";
import { MAX_RECORD_MS, MIN_RECORD_MS } from "../../lib/soniox";

/** Small mono AAC: a spoken sentence is a few dozen kB, quick to upload. */
const SPEECH_CLIP: RecordingOptions = {
  extension: ".m4a",
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 32000,
  android: { outputFormat: "mpeg4", audioEncoder: "aac" },
  ios: { outputFormat: "aac ", audioQuality: 64 },
  web: { mimeType: "audio/webm", bitsPerSecond: 32000 },
};

/**
 * One spoken clip for Soniox's speech to text: start, then stop to get the file (null for a slip shorter than
 * MIN_RECORD_MS). Recording stops by itself after MAX_RECORD_MS and calls `onAutoStop` with the clip.
 */
export function useRecording(onAutoStop: (uri: string | null) => void) {
  const recorder = useAudioRecorder(SPEECH_CLIP);
  const [recording, setRecording] = useState(false);
  const startedAt = useRef(0);
  const limit = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoStop = useRef(onAutoStop);
  autoStop.current = onAutoStop;

  const stop = useCallback(async (): Promise<string | null> => {
    if (limit.current) clearTimeout(limit.current);
    limit.current = null;
    if (!recording && !recorder.isRecording) return null;
    setRecording(false);
    try {
      await recorder.stop();
    } catch {
      return null;
    }
    return Date.now() - startedAt.current < MIN_RECORD_MS ? null : recorder.uri;
  }, [recorder, recording]);

  /** Starts a clip (asking for the microphone the first time). False when it cannot record. */
  const start = useCallback(async (): Promise<boolean> => {
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) return false;
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      return false;
    }
    startedAt.current = Date.now();
    setRecording(true);
    limit.current = setTimeout(() => {
      limit.current = null;
      void stop().then(uri => autoStop.current(uri));
    }, MAX_RECORD_MS);
    return true;
  }, [recorder, stop]);

  useEffect(() => () => {
    if (limit.current) clearTimeout(limit.current);
  }, []);

  return { recording, start, stop };
}
