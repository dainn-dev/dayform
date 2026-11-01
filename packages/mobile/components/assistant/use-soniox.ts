import { useCallback, useEffect, useRef, useState } from "react";
import { requestRecordingPermissionsAsync, setAudioModeAsync, useAudioStream } from "expo-audio";
import { readSonioxKey } from "../../lib/ai-key-expo";
import { applyRt, emptyRt, liveText, MAX_ONCE_MS, rtConfig, SONIOX_RT_URL, type RtState } from "../../lib/soniox-rt";

export type SonioxMode = "off" | "listen" | "once";
export type SonioxProblem = "no-key" | "mic" | "network" | "rejected";

type Params = {
  language: "vi" | "en";
  /** What is being said right now (provisional words included), for the bubble or the chat. */
  onLive: (text: string) => void;
  /** A finished sentence: in "listen" every utterance, in "once" the one sentence ("" when nothing was said). */
  onUtterance: (text: string, mode: "listen" | "once") => void;
  onProblem: (problem: SonioxProblem, message: string | null) => void;
};

const SAMPLE_RATE = 16000;

type NativeWebSocketConstructor = new (url: string, protocols: string | string[] | null, options: { headers: Record<string, string> }) => WebSocket;
const NativeWebSocket = WebSocket as unknown as NativeWebSocketConstructor;

/**
 * The assistant's microphone through Soniox's real-time API: raw 16-bit PCM from `useAudioStream` goes to Soniox over
 * a WebSocket as it is spoken, and the words come back while the user talks. "listen" streams until stopped (the call
 * by name); "once" takes one sentence and ends at Soniox's `<end>`, when `finish()` is called, or after MAX_ONCE_MS.
 */
export function useSoniox({ language, onLive, onUtterance, onProblem }: Params) {
  const [mode, setModeState] = useState<SonioxMode>("off");
  const modeRef = useRef<SonioxMode>("off");
  const ws = useRef<WebSocket | null>(null);
  const configured = useRef(false);
  const queue = useRef<ArrayBuffer[]>([]);
  const rt = useRef<RtState>(emptyRt());
  const finishing = useRef(false);
  const limit = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ language, onLive, onUtterance, onProblem });
  latest.current = { language, onLive, onUtterance, onProblem };

  const onBuffer = useRef<(data: ArrayBuffer) => void>(() => {});
  const { stream } = useAudioStream({
    sampleRate: SAMPLE_RATE,
    channels: 1,
    encoding: "int16",
    onBuffer: buffer => onBuffer.current(buffer.data),
  });

  const setMode = (next: SonioxMode) => {
    modeRef.current = next;
    setModeState(next);
  };

  /** Closes everything without reporting anything. */
  const teardown = useCallback(() => {
    if (limit.current) clearTimeout(limit.current);
    limit.current = null;
    onBuffer.current = () => {};
    try {
      if (stream.isStreaming) stream.stop();
    } catch {
      // Already stopped.
    }
    const socket = ws.current;
    ws.current = null;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      try {
        socket.close();
      } catch {
        // Already closed.
      }
    }
    configured.current = false;
    queue.current = [];
    finishing.current = false;
    rt.current = emptyRt();
    setMode("off");
  }, [stream]);

  /** Ends a "once" session and hands over what was said (final words, and the provisional rest). */
  const deliverOnce = useCallback(() => {
    const said = liveText(rt.current);
    teardown();
    latest.current.onLive("");
    latest.current.onUtterance(said, "once");
  }, [teardown]);

  const begin = useCallback(async (next: "listen" | "once") => {
    teardown();
    const key = await readSonioxKey();
    if (!key) {
      latest.current.onProblem("no-key", null);
      return;
    }
    const permission = await requestRecordingPermissionsAsync().catch(() => ({ granted: false }));
    if (!permission.granted) {
      latest.current.onProblem("mic", null);
      return;
    }
    setMode(next);
    rt.current = emptyRt();
    // React Native's WebSocket takes headers as a third argument (the web typings know only two); Soniox reads the key
    // from the Authorization header.
    const socket = new NativeWebSocket(SONIOX_RT_URL, null, { headers: { Authorization: `Bearer ${key}` } });
    socket.binaryType = "arraybuffer";
    ws.current = socket;

    onBuffer.current = data => {
      if (ws.current !== socket || socket.readyState !== WebSocket.OPEN) return;
      if (configured.current) socket.send(data);
      else queue.current.push(data);
    };

    socket.onopen = () => {
      void (async () => {
        try {
          await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
          await stream.start();
        } catch {
          teardown();
          latest.current.onProblem("mic", null);
          return;
        }
        if (ws.current !== socket) return;
        socket.send(JSON.stringify(rtConfig(latest.current.language, stream.sampleRate || SAMPLE_RATE)));
        configured.current = true;
        for (const data of queue.current) socket.send(data);
        queue.current = [];
      })();
    };

    socket.onmessage = event => {
      if (ws.current !== socket) return;
      let payload: unknown;
      try {
        payload = JSON.parse(String(event.data));
      } catch {
        return;
      }
      const update = applyRt(rt.current, payload);
      rt.current = update.state;
      if (update.error) {
        teardown();
        latest.current.onLive("");
        latest.current.onProblem("rejected", update.error);
        return;
      }
      for (const said of update.utterances) {
        if (modeRef.current === "once") {
          // One sentence: the first one that ends is the answer.
          rt.current = { finalText: said, partial: "" };
          deliverOnce();
          return;
        }
        latest.current.onUtterance(said, "listen");
      }
      latest.current.onLive(liveText(rt.current));
      if (update.finished && modeRef.current === "once") deliverOnce();
    };

    socket.onerror = () => {
      if (ws.current !== socket) return;
      const wasOnce = modeRef.current === "once";
      teardown();
      latest.current.onLive("");
      latest.current.onProblem("network", null);
      if (wasOnce) latest.current.onUtterance("", "once");
    };
    socket.onclose = () => {
      if (ws.current !== socket) return;
      if (modeRef.current === "once" && finishing.current) {
        deliverOnce();
        return;
      }
      // Closed by Soniox (idle, session limit): a "listen" session simply stops; the caller starts a new one.
      const wasOnce = modeRef.current === "once";
      teardown();
      if (wasOnce) latest.current.onUtterance("", "once");
    };

    if (next === "once") {
      limit.current = setTimeout(() => { limit.current = null; finish(); }, MAX_ONCE_MS);
    }
  }, [stream, teardown, deliverOnce]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Ends a "once" session now: the microphone stops and Soniox sends the last words. */
  const finish = useCallback(() => {
    const socket = ws.current;
    if (modeRef.current !== "once" || !socket) return;
    finishing.current = true;
    onBuffer.current = () => {};
    try {
      if (stream.isStreaming) stream.stop();
    } catch {
      // Already stopped.
    }
    try {
      // An empty text frame ends the stream; Soniox answers with the remaining words and `finished`.
      if (socket.readyState === WebSocket.OPEN && configured.current) socket.send("");
      else deliverOnce();
    } catch {
      deliverOnce();
    }
  }, [stream, deliverOnce]);

  useEffect(() => () => teardown(), [teardown]);

  return {
    mode,
    listen: useCallback(() => { void begin("listen"); }, [begin]),
    once: useCallback(() => { void begin("once"); }, [begin]),
    finish,
    stop: teardown,
  };
}
