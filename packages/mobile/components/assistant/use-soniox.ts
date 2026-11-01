import { useCallback, useEffect, useRef, useState } from "react";
import { requestRecordingPermissionsAsync, setAudioModeAsync, useAudioStream } from "expo-audio";
import { readSonioxKey } from "../../lib/ai-key-expo";
import { applyGain, initialGain } from "../../lib/pcm-gain";
import { applyRt, CONNECT_TIMEOUT_MS, emptyRt, liveText, MAX_ONCE_MS, MAX_QUEUE_SECONDS, rtConfig, SONIOX_RT_URL, type RtState } from "../../lib/soniox-rt";

export type SonioxMode = "off" | "listen" | "once";
export type SonioxProblem = "no-key" | "mic" | "network" | "rejected";

type Params = {
  language: "vi" | "en";
  /** What is being said right now (provisional words included), for the bubble or the chat. */
  onLive: (text: string) => void;
  /** A finished sentence: in "listen" every utterance, in "once" the one sentence ("" when nothing was said). */
  onUtterance: (text: string, mode: "listen" | "once") => void;
  /** `during` is the mode that was running when the problem came up. */
  onProblem: (problem: SonioxProblem, message: string | null, during: SonioxMode) => void;
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
  const connectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    if (connectTimer.current) clearTimeout(connectTimer.current);
    connectTimer.current = null;
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
      latest.current.onProblem("no-key", null, "off");
      return;
    }
    const permission = await requestRecordingPermissionsAsync().catch(() => ({ granted: false }));
    if (!permission.granted) {
      latest.current.onProblem("mic", null, "off");
      return;
    }
    setMode(next);
    rt.current = emptyRt();
    // React Native's WebSocket takes headers as a third argument (the web typings know only two); Soniox reads the key
    // from the Authorization header.
    const socket = new NativeWebSocket(SONIOX_RT_URL, null, { headers: { Authorization: `Bearer ${key}` } });
    socket.binaryType = "arraybuffer";
    ws.current = socket;

    // The microphone starts now, in parallel with the connection: on a slow network the first words would otherwise be
    // lost. Audio is raised by an automatic gain (the raw microphone is quiet outdoors) and kept in a queue until the
    // connection is open and configured.
    let gain = initialGain();
    onBuffer.current = data => {
      if (ws.current !== socket) return;
      if (data.byteLength >= 2) gain = applyGain(new Int16Array(data, 0, data.byteLength >> 1), stream.sampleRate || SAMPLE_RATE, gain);
      if (configured.current && socket.readyState === WebSocket.OPEN) {
        socket.send(data);
        return;
      }
      if (socket.readyState !== WebSocket.CONNECTING && socket.readyState !== WebSocket.OPEN) return;
      queue.current.push(data);
      // Keep only the latest seconds, so a connection that never opens cannot fill the memory.
      let bytes = 0;
      for (const chunk of queue.current) bytes += chunk.byteLength;
      const cap = MAX_QUEUE_SECONDS * (stream.sampleRate || SAMPLE_RATE) * 2;
      while (bytes > cap && queue.current.length > 1) bytes -= (queue.current.shift() as ArrayBuffer).byteLength;
    };
    const microphone = (async () => {
      try {
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await stream.start();
        return true;
      } catch {
        return false;
      }
    })();
    void microphone.then(ok => {
      if (ok || ws.current !== socket) return;
      const during = modeRef.current;
      teardown();
      latest.current.onProblem("mic", null, during);
    });

    // A network too slow to connect in time is reported instead of leaving the assistant "listening" to nothing.
    connectTimer.current = setTimeout(() => {
      connectTimer.current = null;
      if (ws.current !== socket || configured.current) return;
      const during = modeRef.current;
      teardown();
      latest.current.onLive("");
      latest.current.onProblem("network", null, during);
    }, CONNECT_TIMEOUT_MS);

    socket.onopen = () => {
      void microphone.then(ok => {
        if (!ok || ws.current !== socket) return;
        socket.send(JSON.stringify(rtConfig(latest.current.language, stream.sampleRate || SAMPLE_RATE)));
        configured.current = true;
        if (connectTimer.current) clearTimeout(connectTimer.current);
        connectTimer.current = null;
        for (const data of queue.current) socket.send(data);
        queue.current = [];
        // The user already let go while it was connecting: now that the audio is sent, end the stream.
        if (finishing.current) socket.send("");
      });
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
        const during = modeRef.current;
        teardown();
        latest.current.onLive("");
        latest.current.onProblem("rejected", update.error, during);
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
      const during = modeRef.current;
      teardown();
      latest.current.onLive("");
      latest.current.onProblem("network", null, during);
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
      // Still connecting: the queued audio is sent and the stream ended as soon as the connection is configured.
      else if (socket.readyState !== WebSocket.CONNECTING && !(socket.readyState === WebSocket.OPEN && !configured.current)) deliverOnce();
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
