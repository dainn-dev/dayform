import React, { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { AccessibilityInfo, Animated, AppState, Pressable, StyleSheet, Text, useWindowDimensions, View, PanResponder } from "react-native";
import { usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { answer, fill, greetingLine, LINES, QUESTION_IDS, QUESTIONS, talkMs, type Line, type QuestionId } from "../../lib/assistant-answers";
import { poseAt } from "../../lib/assistant-pose";
import { mouthAt, speechLocale, speechMs, speechTimeline, type Span, type SpeechLanguage } from "../../lib/assistant-speech";
import { matchPreset, parseYesNo, saysGoodbye } from "../../lib/voice-command";
import { Ionicons } from "@expo/vector-icons";
import { useVoice } from "./use-voice";
import { speakLine, stopSpeaking } from "../../lib/assistant-speech-expo";
import { INACTIVE_AFTER_MS, INITIAL_MACHINE, nextState, ONE_SHOT_MS, registerTap, THINKING_MS, type AssistantState } from "../../lib/assistant-state";
import { useLanguage } from "../../lib/language";
import { useSettings } from "../../lib/settings-context";
import { tabBarHeight } from "../../lib/shell-layout";
import { useTasks } from "../../lib/tasks-context";
import { ChatSheet } from "./ChatSheet";
import { useAiChat } from "./use-ai-chat";

// The flat picture of Leo stands in until the Live2D model is rigged (see the assistant notes in CLAUDE.md).
const LEO = require("../../assets/assistant/leo.png");
const HEIGHT = 112;
const WIDTH = Math.round(HEIGHT * 0.714);
const EDGE = 8;
const BUBBLE_WIDTH = 220;
/** Below this many dp from the top the bubble opens under Leo instead of above. */
const BUBBLE_FLIP_Y = 190;
const REDUCED_MOTION = 0.3;

// Kept for the app session: Leo greets once per start and stays where the user put it.
let greetedThisSession = false;
let savedPosition: { x: number; y: number } | null = null;

/** The assistant in the corner of the app. Hidden while it is switched off and on the private period-tracker screen. */
export function AssistantOverlay() {
  const { settings, ready } = useSettings();
  const pathname = usePathname();
  if (!ready || !settings.assistant.enabled || pathname.startsWith("/cycle")) return null;
  return <Assistant name={settings.profile.name} voice={settings.assistant.voice} voiceId={settings.assistant.voiceId}
    assistantName={settings.assistant.name} aiEnabled={settings.ai.enabled} wakeWord={settings.assistant.wakeWord} />;
}

type AssistantProps = { name: string; voice: boolean; voiceId: string; assistantName: string; aiEnabled: boolean; wakeWord: boolean };

function Assistant({ name, voice, voiceId, assistantName, aiEnabled, wakeWord }: AssistantProps) {
  const { t, time, language } = useLanguage();
  const speechLanguage: SpeechLanguage = language === "vi" ? "vi" : "en";
  const { tasks, loading } = useTasks();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();

  const [machine, dispatch] = useReducer(nextState, INITIAL_MACHINE);
  const [spoken, setSpoken] = useState<Line | null>(null);
  const [activity, setActivity] = useState(0);
  const touched = () => setActivity(value => value + 1);

  // The AI chat: while a question is out, "thinking" waits for the answer instead of its own timer.
  const [chatOpen, setChatOpen] = useState(false);
  const awaitingAi = useRef(false);
  const chat = useAiChat({
    onStart: () => {
      awaitingAi.current = true;
      // From wherever Leo is (talking, idle, sleepy or already listening) to thinking; events that do not apply are ignored.
      dispatch({ type: "answerDone" });
      dispatch({ type: "asked" });
      dispatch({ type: "questionChosen" });
    },
    onReply: text => {
      awaitingAi.current = false;
      // The AI's words are not a dictionary key: they go in as a value, so they are never "translated".
      setSpoken({ text: "{reply}", vars: { reply: text } });
      dispatch({ type: "answerStarted" });
    },
  });
  const openChat = () => {
    setChatOpen(true);
    dispatch({ type: machine.state === "sleepy" ? "poked" : "asked" });
  };
  const closeChat = () => {
    setChatOpen(false);
    chat.stop();
    stopSpeaking();
    if (awaitingAi.current) {
      awaitingAi.current = false;
      dispatch({ type: "answerStarted" });
      dispatch({ type: "answerDone" });
    }
    dispatch({ type: "cancelled" });
  };

  const minY = insets.top + EDGE;
  const maxY = screenH - tabBarHeight(insets.bottom) - HEIGHT - EDGE;
  const clampPosition = (x: number, y: number) => ({
    x: Math.min(Math.max(EDGE, x), Math.max(EDGE, screenW - WIDTH - EDGE)),
    y: Math.min(Math.max(minY, y), Math.max(minY, maxY)),
  });
  const [place, setPlace] = useState(() => savedPosition ?? clampPosition(EDGE, maxY - 64));
  const position = useRef(new Animated.ValueXY(place)).current;
  const current = useRef(place);

  // Pose inputs read by the animation loop without re-rendering.
  const stateRef = useRef<AssistantState>(machine.state);
  const stateStart = useRef(Date.now());
  const dragVx = useRef(0);
  const droppedAt = useRef<number | null>(null);
  const motion = useRef(1);
  const screenReader = useRef(false);
  // The line being said: its estimated syllables, and when the engine started saying it (null until it does).
  const speech = useRef<{ spans: Span[]; start: number | null } | null>(null);

  /**
   * Shows the line's syllable beat and reads it aloud when the voice is on. Resolves true once the engine has taken it;
   * `onDone` then runs when it has finished. With the voice off, a screen reader on or no voice for the language, it
   * resolves false and the beat simply starts now.
   */
  const say = (text: string, onDone?: () => void): Promise<boolean> => {
    const current = { spans: speechTimeline(text, speechLanguage), start: null as number | null };
    speech.current = current;
    if (!voice || screenReader.current) {
      current.start = Date.now();
      return Promise.resolve(false);
    }
    return speakLine(text, speechLanguage, {
      onStart: () => { current.start = Date.now(); },
      onDone: () => onDone?.(),
    }, voiceId).then(started => {
      if (!started) current.start = Date.now();
      return started;
    });
  };
  const anim = useRef({
    dx: new Animated.Value(0), dy: new Animated.Value(0), rotate: new Animated.Value(0),
    scaleX: new Animated.Value(1), scaleY: new Animated.Value(1),
  }).current;

  // Timers of each state: one-shot reactions end, thinking turns into the answer, a quiet idle gets sleepy.
  useEffect(() => {
    stateRef.current = machine.state;
    stateStart.current = Date.now();
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (ms: number, type: Parameters<typeof nextState>[1]["type"]) => timers.push(setTimeout(() => dispatch({ type } as Parameters<typeof nextState>[1]), ms));
    const oneShot = ONE_SHOT_MS[machine.state];
    if (oneShot) later(oneShot, "done");
    if (machine.state === "thinking" && !awaitingAi.current) later(THINKING_MS, "answerStarted");
    let cancelled = false;
    if (machine.state === "talking") {
      // The answer ends when the voice has finished it; without a voice, after a time that fits its length.
      const text = spoken ? fill(t(spoken.text), spoken.vars) : "";
      const finish = () => { if (!cancelled) dispatch({ type: "answerDone" }); };
      const fallback = setTimeout(finish, talkMs(text));
      timers.push(fallback);
      void say(text, finish).then(started => {
        if (cancelled || !started) return;
        clearTimeout(fallback);
        // In case the engine never reports the end.
        timers.push(setTimeout(finish, speechMs(speechTimeline(text, speechLanguage)) * 2 + 3000));
      });
    }
    // Greetings and reactions are said too, but they never wait for the voice: their state ends on its own timer.
    const reaction = machine.state === "greeting" || machine.state === "happy" || machine.state === "angry" ? lineFor(machine.state, name, null) : null;
    if (reaction) void say(fill(t(reaction.text), reaction.vars));
    if (machine.state === "idle") later(INACTIVE_AFTER_MS, "inactive");
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
    // `activity` restarts the idle countdown after every touch.
  }, [machine.state, activity]); // eslint-disable-line react-hooks/exhaustive-deps

  // Greets once the tasks are loaded, once per app start.
  useEffect(() => {
    if (loading || greetedThisSession) return;
    greetedThisSession = true;
    dispatch({ type: "appOpened" });
  }, [loading]);

  // Cheers when a task gets done (not for the tasks that were already done when the app opened).
  const doneCount = useMemo(() => tasks.filter(task => task.status === "done").length, [tasks]);
  const lastDone = useRef<number | null>(null);
  useEffect(() => {
    if (loading) return;
    if (lastDone.current !== null && doneCount > lastDone.current) dispatch({ type: "positive" });
    lastDone.current = doneCount;
  }, [doneCount, loading]);

  // With a screen reader on, the bubble is read by it, so Leo does not speak over it.
  useEffect(() => {
    void AccessibilityInfo.isScreenReaderEnabled().then(on => { screenReader.current = on; });
    const sub = AccessibilityInfo.addEventListener("screenReaderChanged", on => { screenReader.current = on; if (on) stopSpeaking(); });
    return () => sub.remove();
  }, []);

  // Switching the voice off, or Leo going away, stops what it was saying.
  useEffect(() => { if (!voice) stopSpeaking(); }, [voice]);
  useEffect(() => () => stopSpeaking(), []);

  // Smaller movements when the system asks to reduce motion.
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(on => { motion.current = on ? REDUCED_MOTION : 1; });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", on => { motion.current = on ? REDUCED_MOTION : 1; });
    return () => sub.remove();
  }, []);

  // The animation loop runs only while the app is in front.
  useEffect(() => {
    let frame: number | null = null;
    const tick = () => {
      const now = Date.now();
      const said = speech.current;
      const talk = stateRef.current === "talking" && said && said.start !== null ? mouthAt(said.spans, now - said.start) : undefined;
      const pose = poseAt({
        state: stateRef.current, t: now - stateStart.current, now, dragVx: dragVx.current,
        sinceDrop: droppedAt.current === null ? null : now - droppedAt.current, motion: motion.current, talk,
      });
      anim.dx.setValue(pose.dx);
      anim.dy.setValue(pose.dy);
      anim.rotate.setValue(pose.rotate);
      anim.scaleX.setValue(pose.scaleX * (pose.flip ? -1 : 1));
      anim.scaleY.setValue(pose.scaleY);
      frame = requestAnimationFrame(tick);
    };
    const start = () => { if (frame === null) frame = requestAnimationFrame(tick); };
    const stop = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      // Leaving the app also silences Leo.
      stopSpeaking();
    };
    if (AppState.currentState === "active") start();
    const sub = AppState.addEventListener("change", next => (next === "active" ? start() : stop()));
    return () => { stop(); sub.remove(); };
  }, [anim]);

  const drag = useRef({ x: 0, y: 0 });
  const pan = useMemo(() => PanResponder.create({
    // Capture once the finger really moves, so a tap still reaches the picture.
    onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) + Math.abs(g.dy) > 6,
    onPanResponderGrant: () => {
      stopSpeaking();
      drag.current = { ...current.current };
      droppedAt.current = null;
      dispatch({ type: "dragStarted" });
    },
    onPanResponderMove: (_, g) => {
      const next = clampPosition(drag.current.x + g.dx, drag.current.y + g.dy);
      current.current = next;
      position.setValue(next);
      dragVx.current = g.vx * 1000;
    },
    onPanResponderRelease: () => finishDrag(),
    onPanResponderTerminate: () => finishDrag(),
  }), [screenW, screenH, insets.top, insets.bottom]); // eslint-disable-line react-hooks/exhaustive-deps

  function finishDrag() {
    dragVx.current = 0;
    droppedAt.current = Date.now();
    savedPosition = current.current;
    setPlace(current.current);
    dispatch({ type: "dragEnded" });
    touched();
  }

  const tap = useRef<number[]>([]);
  const onPress = () => {
    touched();
    const { recent, teased } = registerTap(tap.current, Date.now());
    tap.current = recent;
    if (teased) {
      dispatch({ type: "teased" });
      return;
    }
    if (aiEnabled && (machine.state === "idle" || machine.state === "sleepy")) openChat();
    else if (machine.state === "idle") dispatch({ type: "asked" });
    else if (machine.state === "sleepy") dispatch({ type: "poked" });
    else if (machine.state === "listening") dispatch({ type: "cancelled" });
    else stopSpeaking();
  };

  const ask = (id: QuestionId) => {
    touched();
    setSpoken(answer(id, tasks, new Date(), time));
    dispatch({ type: "questionChosen" });
  };

  // ---- Voice: the call by name, one spoken sentence, a spoken yes/no, and a conversation that goes on by voice ----
  const [heard, setHeard] = useState("");
  // The current exchange started by voice: after the answer the assistant listens again, until silence or "thank you".
  const voiceTurn = useRef(false);
  const sayThen = (text: string, then: () => void) => { void say(text, then).then(started => { if (!started) then(); }); };
  const voiceInput = useVoice({
    wakeEnabled: wakeWord,
    name: assistantName,
    locale: speechLocale(speechLanguage),
    // Listening for the name pauses whenever the assistant talks or works, so it never hears itself.
    paused: chatOpen || !(machine.state === "idle" || machine.state === "sleepy"),
    onWake: () => {
      touched();
      voiceTurn.current = true;
      setHeard("");
      dispatch({ type: stateRef.current === "sleepy" ? "poked" : "asked" });
    },
    onInterim: text => setHeard(text),
    onHeard: text => handleHeard(text),
    onError: code => {
      setHeard("");
      voiceTurn.current = false;
      dispatch({ type: "cancelled" });
      setSpoken(code === "language-not-supported" ? LINES.noLanguage : LINES.noMic);
    },
  });

  function handleHeard(text: string) {
    setHeard("");
    touched();
    if (!text) {
      // Silence: the conversation is over.
      voiceTurn.current = false;
      dispatch({ type: "cancelled" });
      return;
    }
    const pending = chat.pendingConfirm;
    if (pending) {
      const answerWord = parseYesNo(text);
      if (answerWord) chat.answer(pending.id, answerWord === "yes");
      return;
    }
    if (saysGoodbye(text)) {
      voiceTurn.current = false;
      dispatch({ type: "cancelled" });
      void say(t(LINES.goodbye.text));
      return;
    }
    if (chat.readiness === "ready") {
      void chat.send(text);
      return;
    }
    // Without the AI chat: a preset question if the words match one, otherwise say how to ask anything.
    dispatch({ type: "asked" });
    const preset = matchPreset(text);
    if (preset) {
      ask(preset);
      return;
    }
    setSpoken(LINES.notUnderstood);
    dispatch({ type: "questionChosen" });
  }

  /** Takes one spoken sentence now (hold the assistant, or the chat's microphone). */
  const listenOnce = () => {
    touched();
    stopSpeaking();
    if (voiceInput.mode === "question") {
      voiceInput.cancel();
      return;
    }
    voiceTurn.current = !chatOpen;
    if (!chatOpen) dispatch({ type: stateRef.current === "sleepy" ? "poked" : "asked" });
    void voiceInput.capture().then(ok => {
      if (ok) return;
      voiceTurn.current = false;
      dispatch({ type: "cancelled" });
      setSpoken(LINES.noMic);
    });
  };

  // After a spoken answer, listen again: the user can go on without calling the name.
  const previousState = useRef<AssistantState>(machine.state);
  useEffect(() => {
    const before = previousState.current;
    previousState.current = machine.state;
    if (before === "talking" && machine.state === "idle" && voiceTurn.current && !chatOpen && !chat.busy) {
      dispatch({ type: "asked" });
      void voiceInput.capture().then(ok => { if (!ok) voiceTurn.current = false; });
    }
  }, [machine.state]); // eslint-disable-line react-hooks/exhaustive-deps

  // A change the AI wants to make, during a spoken exchange: read it out and listen for yes or no (the card can be tapped too).
  const spokenCard = useRef<string | null>(null);
  useEffect(() => {
    const pending = chat.pendingConfirm;
    if (!pending || !voiceTurn.current || spokenCard.current === pending.id) return;
    spokenCard.current = pending.id;
    const first = pending.lines[0];
    sayThen(`${fill(t(first.text), first.vars)}. ${t("Shall I?")}`, () => { void voiceInput.capture(); });
  }, [chat.pendingConfirm]); // eslint-disable-line react-hooks/exhaustive-deps

  const line = lineFor(machine.state, name, spoken);
  const below = place.y < minY + BUBBLE_FLIP_Y;
  const rightSide = place.x + WIDTH / 2 > screenW / 2;
  const bubblePlace = [below ? { top: HEIGHT + 4 } : { bottom: HEIGHT + 4 }, rightSide ? { right: 0 } : { left: 0 }];
  const rotate = anim.rotate.interpolate({ inputRange: [-360, 360], outputRange: ["-360deg", "360deg"] });

  return <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
    <Animated.View style={[s.holder, { transform: position.getTranslateTransform() }]} {...pan.panHandlers}>
      {chatOpen ? null : machine.state === "listening" && (voiceTurn.current || voiceInput.mode === "question")
        ? <View style={[s.bubble, ...bubblePlace]} pointerEvents="none" accessibilityLiveRegion="polite">
          <Text style={s.bubbleText}>{heard ? `“${heard}”` : t(LINES.listening.text)}</Text>
        </View>
        : machine.state === "listening"
        ? <View style={[s.bubble, ...bubblePlace]} accessibilityLiveRegion="polite">
          <Text style={s.bubbleText}>{t(LINES.listening.text)}</Text>
          {QUESTION_IDS.map(id => <Pressable key={id} onPress={() => ask(id)} accessibilityRole="button" style={s.question}>
            <Text style={s.questionText}>{t(QUESTIONS[id])}</Text>
          </Pressable>)}
          <Pressable onPress={() => { touched(); dispatch({ type: "cancelled" }); }} accessibilityRole="button" style={s.close}>
            <Text style={s.closeText}>{t("Close")}</Text>
          </Pressable>
        </View>
        : line && <View style={[s.bubble, ...bubblePlace]} pointerEvents="none" accessibilityLiveRegion="polite">
          <Text style={s.bubbleText}>{fill(t(line.text), line.vars)}</Text>
        </View>}
      <View style={s.shadow} pointerEvents="none" />
      <Pressable onPress={onPress} onLongPress={listenOnce} delayLongPress={350} accessibilityRole="button" accessibilityLabel={t("{name}, your assistant").replace("{name}", assistantName)}
        accessibilityHint={`${t("Tap to ask a question. Drag to move.")} ${t("Hold the assistant, or tap the microphone in the chat, to say one thing without calling it.")}`} hitSlop={6}>
        <Animated.Image source={LEO} resizeMode="contain" style={[s.leo, {
          transform: [{ translateX: anim.dx }, { translateY: anim.dy }, { rotate }, { scaleX: anim.scaleX }, { scaleY: anim.scaleY }],
        }]} />
      </Pressable>
      {voiceInput.mode !== "off" && <View style={s.micBadge} pointerEvents="none" accessibilityLabel={t("Listening…")}>
        <Ionicons name="mic" size={12} color={colors.onPrimary} />
      </View>}
    </Animated.View>
    <ChatSheet visible={chatOpen} name={assistantName} entries={chat.entries} busy={chat.busy} readiness={chat.readiness}
      onSend={text => { touched(); void chat.send(text); }} onAnswer={chat.answer} onClose={closeChat} onClear={chat.clear}
      listening={voiceInput.mode === "question"} heard={heard} onMic={listenOnce} />
  </View>;
}

/** What the bubble says in each state; null shows no bubble. */
function lineFor(state: AssistantState, name: string, spoken: Line | null): Line | null {
  switch (state) {
    case "greeting": return greetingLine(name);
    case "thinking": return LINES.thinking;
    case "talking": return spoken;
    case "angry": return LINES.angry;
    case "happy": return LINES.happy;
    case "sleepy": return LINES.sleepy;
    default: return null;
  }
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  holder: { position: "absolute", left: 0, top: 0, width: WIDTH, height: HEIGHT },
  leo: { width: WIDTH, height: HEIGHT },
  micBadge: {
    position: "absolute", top: 2, right: 2, width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center",
    backgroundColor: c.primary,
  },
  shadow: {
    position: "absolute", bottom: -2, left: WIDTH * 0.2, width: WIDTH * 0.6, height: 8, borderRadius: 8,
    backgroundColor: c.shadowSoft, opacity: 0.18,
  },
  bubble: {
    position: "absolute", width: BUBBLE_WIDTH, padding: 10, gap: 6, borderRadius: 16,
    backgroundColor: c.card, borderWidth: 1, borderColor: c.inputBorder,
    shadowColor: c.shadowPanel, shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  bubbleText: { color: c.foreground, fontSize: 13, lineHeight: 18, fontWeight: "600" },
  question: { minHeight: 40, paddingHorizontal: 12, borderRadius: 12, justifyContent: "center", backgroundColor: c.primary },
  questionText: { color: c.onPrimary, fontSize: 13, fontWeight: "700" },
  close: { minHeight: 36, alignItems: "center", justifyContent: "center" },
  closeText: { color: c.mutedForeground, fontSize: 12, fontWeight: "700" },
});
