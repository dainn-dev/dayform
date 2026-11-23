import React, { useEffect, useRef, useState } from "react";
import { Animated, BackHandler, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardInset } from "../../hooks/use-keyboard-inset";
import { useTheme, useThemedStyles, type Theme } from "../../hooks/use-theme";
import { Button } from "../ui/Button";
import { fill } from "../../lib/assistant-answers";
import { useLanguage } from "../../lib/language";
import type { ChatEntry } from "./use-ai-chat";
import type { AiReadiness } from "../../lib/ai-config";

type Props = {
  visible: boolean;
  name: string;
  entries: ChatEntry[];
  busy: boolean;
  readiness: AiReadiness;
  onSend: (text: string) => void;
  onAnswer: (id: string, yes: boolean) => void;
  onClose: () => void;
  onClear: () => void;
  /** The microphone: listening now, what it has heard so far, and the button that starts it. */
  listening?: boolean;
  heard?: string;
  onMic?: () => void;
  /** A clip is being recorded for the provider, or sent to it. */
  recording?: boolean;
  transcribing?: boolean;
  /** Where the sheet's top edge is (dp from the top of the screen), so the assistant can stand above it. */
  onSheetTop?: (y: number) => void;
};

const MISSING: Record<Exclude<AiReadiness, "ready">, string> = {
  off: "The AI chat is off.",
  "no-url": "Add the provider's base URL.",
  "no-model": "Add the model name.",
  "no-key": "Add your API key.",
};

/** The AI chat with the assistant: messages, a confirmation card for every change, and the input. */
export function ChatSheet({ visible, name, entries, busy, readiness, onSend, onAnswer, onClose, onClear, listening, heard, onMic, recording, transcribing, onSheetTop }: Props) {
  const { t } = useLanguage();
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardInset();
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const scroll = useRef<ScrollView>(null);

  useEffect(() => { scroll.current?.scrollToEnd({ animated: true }); }, [entries]);

  // Not a Modal: a Modal is a window of its own above the whole app, which hid the assistant and took every touch, so it
  // could not be dragged while the chat was open. The sheet is now a layer drawn under the assistant, which slides it in
  // and closes it on the Back button itself (the Modal did both before).
  const slide = useRef(new Animated.Value(SLIDE_FROM)).current;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!visible) return;
    slide.setValue(SLIDE_FROM);
    Animated.timing(slide, { toValue: 0, duration: SLIDE_MS, useNativeDriver: true }).start();
    const sub = BackHandler.addEventListener("hardwareBackPress", () => { closeRef.current(); return true; });
    return () => sub.remove();
  }, [visible, slide]);

  const submit = () => {
    if (!draft.trim() || busy) return;
    onSend(draft);
    setDraft("");
  };

  const openSettings = () => {
    onClose();
    router.push("/settings/assistant");
  };

  if (!visible) return null;
  return <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
    {/* iOS lifts the sheet with the KeyboardAvoidingView; on Android the screen is edge-to-edge and not resized, so the
        backdrop is padded by the keyboard. The padding goes on the backdrop, not the sheet: inside the sheet it counted
        against the sheet's maximum height and pushed the input row under the keyboard. */}
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[s.backdrop, Platform.OS === "android" && keyboard.height > 0 && { paddingBottom: keyboard.height }]}>
      <Pressable style={s.dismiss} onPress={onClose} accessibilityRole="button" accessibilityLabel={t("Close")} />
      <Animated.View accessibilityViewIsModal onLayout={e => onSheetTop?.(e.nativeEvent.layout.y)}
        style={[s.sheet, { paddingBottom: (Platform.OS === "android" && keyboard.height > 0 ? 0 : insets.bottom) + 8, transform: [{ translateY: slide }] }]}>
        <View style={s.header}>
          <Text style={s.title} accessibilityRole="header">{name}</Text>
          <Pressable onPress={onClear} accessibilityRole="button" accessibilityLabel={t("New chat")} hitSlop={8} style={s.iconButton}>
            <Ionicons name="refresh" size={20} color={colors.mutedForeground} />
          </Pressable>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t("Close")} hitSlop={8} style={s.iconButton}>
            <Ionicons name="close" size={22} color={colors.foreground} />
          </Pressable>
        </View>

        <ScrollView ref={scroll} style={s.list} contentContainerStyle={s.listBody} keyboardShouldPersistTaps="handled">
          {readiness !== "ready" && <View style={s.setup}>
            <Text style={s.setupText}>{t(MISSING[readiness])}</Text>
            <Button label={t("Open assistant settings")} onPress={openSettings} block />
          </View>}
          {entries.length === 0 && readiness === "ready" && <Text style={s.hint}>{t("Ask about your day, or ask me to add, move or finish a task. I will ask before changing anything.")}</Text>}
          {entries.map(entry => <EntryView key={entry.id} entry={entry} s={s} onAnswer={onAnswer} />)}
          {transcribing && <Text style={s.typing} accessibilityLiveRegion="polite">{t("Turning your voice into text…")}</Text>}
          {(listening || recording) && !transcribing && <Text style={s.typing} accessibilityLiveRegion="polite">
            {heard ? `“${heard}”` : t(recording ? "Listening… tap the microphone again to send." : "Listening…")}
          </Text>}
          {busy && <Text style={s.typing} accessibilityLiveRegion="polite">{t("Thinking…")}</Text>}
        </ScrollView>

        <View style={s.inputRow}>
          {onMic && <Pressable onPress={onMic} disabled={busy || transcribing} accessibilityRole="button"
            accessibilityLabel={t(recording ? "Stop and send" : listening ? "Stop listening" : "Speak")}
            style={[s.mic, (listening || recording) && s.micOn, (busy || transcribing) && s.disabled]}>
            <Ionicons name={recording ? "stop" : listening ? "mic" : "mic-outline"} size={20} color={listening || recording ? colors.onPrimary : colors.primary} />
          </Pressable>}
          <TextInput value={draft} onChangeText={setDraft} placeholder={t("Message {name}").replace("{name}", name)}
            placeholderTextColor={colors.mutedForeground} style={s.input} multiline maxLength={1000}
            editable={readiness === "ready"} onSubmitEditing={submit} accessibilityLabel={t("Message")} />
          <Pressable onPress={submit} disabled={busy || !draft.trim()} accessibilityRole="button" accessibilityLabel={t("Send")}
            style={[s.send, (busy || !draft.trim()) && s.disabled]}>
            <Ionicons name="arrow-up" size={20} color={colors.onPrimary} />
          </Pressable>
        </View>
      </Animated.View>
    </KeyboardAvoidingView>
  </View>;
}

/** The sheet slides up from this far below (dp) when it opens. */
const SLIDE_FROM = 360;
const SLIDE_MS = 220;

function EntryView({ entry, s, onAnswer }: { entry: ChatEntry; s: ReturnType<typeof makeStyles>; onAnswer: (id: string, yes: boolean) => void }) {
  const { t } = useLanguage();
  switch (entry.kind) {
    case "user":
      return <View style={[s.bubble, s.mine]}><Text style={s.mineText}>{entry.text}</Text></View>;
    case "assistant":
      return entry.text.trim() ? <View style={[s.bubble, s.theirs]}><Text style={s.theirsText}>{entry.text}</Text></View> : null;
    case "error":
      return <View style={[s.bubble, s.errorBubble]} accessibilityRole="alert"><Text style={s.errorText}>{entry.text}</Text></View>;
    case "output":
      return <View style={[s.output, entry.bad && s.outputBad]}><Text selectable style={s.outputText}>{entry.text}</Text></View>;
    case "confirm": {
      const pending = entry.state === "pending";
      return <View style={[s.card, entry.risky && s.cardRisky]}>
        {entry.lines.map((line, index) => <Text key={index} style={index === 0 ? s.cardTitle : s.cardLine}>{fill(t(line.text), line.vars)}</Text>)}
        {pending
          ? <View style={s.cardButtons}>
            <Button label={t("No")} variant="secondary" onPress={() => onAnswer(entry.id, false)} style={s.cardButton} />
            <Button label={t("Agree")} onPress={() => onAnswer(entry.id, true)} style={s.cardButton} />
          </View>
          : <Text style={s.cardState}>{t(entry.state === "approved" ? "Done" : entry.state === "failed" ? "Could not save" : "Declined")}</Text>}
      </View>;
    }
  }
}

/** The send and microphone buttons are round 44 px touch targets. */
const ROUND_BUTTON = 44;

const makeStyles = ({ colors: c, type, font, radius, space, elevation }: Theme) => StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end" },
  dismiss: { flex: 1 },
  sheet: {
    maxHeight: "78%", minHeight: "45%", backgroundColor: c.background, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    // The line keeps the sheet's edge visible over the screen behind it (same colour in the bordered styles, which draw it anyway).
    paddingTop: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: c.inputBorder, ...elevation.overlay,
  },
  header: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingBottom: 6 },
  title: { ...type.title, flex: 1, color: c.foreground },
  iconButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  list: { flexGrow: 0, flexShrink: 1 },
  listBody: { gap: space.sm, paddingVertical: 6 },
  hint: { ...type.body, color: c.mutedForeground },
  typing: { ...type.meta, color: c.mutedForeground, fontStyle: "italic" },
  bubble: { maxWidth: "85%", paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.lg },
  mine: { alignSelf: "flex-end", backgroundColor: c.primary },
  mineText: { ...type.body, color: c.onPrimary },
  theirs: { alignSelf: "flex-start", backgroundColor: c.card, borderWidth: 1, borderColor: c.inputBorder },
  theirsText: { ...type.body, color: c.foreground },
  errorBubble: { alignSelf: "flex-start", backgroundColor: c.card, borderWidth: 1, borderColor: c.destructive },
  errorText: { ...type.body, color: c.foreground },
  card: { alignSelf: "stretch", padding: space.md, gap: space.xs, borderRadius: radius.md, backgroundColor: c.card, borderWidth: 1, borderColor: c.primary },
  cardRisky: { borderColor: c.destructive, borderWidth: 2 },
  output: { alignSelf: "stretch", padding: 10, borderRadius: radius.md, backgroundColor: c.card, borderWidth: 1, borderColor: c.inputBorder },
  outputBad: { borderColor: c.destructive },
  outputText: { ...type.mono, color: c.foreground },
  cardTitle: { ...type.body, ...font.heavy, color: c.foreground },
  cardLine: { ...type.body, color: c.foreground },
  cardButtons: { flexDirection: "row", gap: space.sm, marginTop: space.sm },
  cardButton: { flex: 1 },
  cardState: { ...type.meta, ...font.bold, color: c.mutedForeground, marginTop: space.xs },
  setup: { padding: space.md, gap: space.sm, borderRadius: radius.md, backgroundColor: c.card, borderWidth: 1, borderColor: c.inputBorder },
  setupText: { ...type.body, color: c.foreground },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: space.sm, paddingTop: space.sm },
  input: {
    ...type.body, flex: 1, minHeight: ROUND_BUTTON, maxHeight: 120, paddingHorizontal: space.md, paddingVertical: 10, borderRadius: radius.md,
    backgroundColor: c.card, borderWidth: 1, borderColor: c.inputBorder, color: c.foreground,
  },
  send: { width: ROUND_BUTTON, height: ROUND_BUTTON, borderRadius: ROUND_BUTTON / 2, alignItems: "center", justifyContent: "center", backgroundColor: c.primary },
  mic: { width: ROUND_BUTTON, height: ROUND_BUTTON, borderRadius: ROUND_BUTTON / 2, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.primary },
  micOn: { backgroundColor: c.primary },
  disabled: { opacity: 0.4 },
});
