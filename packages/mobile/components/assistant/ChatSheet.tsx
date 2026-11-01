import React, { useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
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
};

const MISSING: Record<Exclude<AiReadiness, "ready">, string> = {
  off: "The AI chat is off.",
  "no-url": "Add the provider's base URL.",
  "no-model": "Add the model name.",
  "no-key": "Add your API key.",
};

/** The AI chat with the assistant: messages, a confirmation card for every change, and the input. */
export function ChatSheet({ visible, name, entries, busy, readiness, onSend, onAnswer, onClose, onClear, listening, heard, onMic, recording, transcribing }: Props) {
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const scroll = useRef<ScrollView>(null);

  useEffect(() => { scroll.current?.scrollToEnd({ animated: true }); }, [entries]);

  const submit = () => {
    if (!draft.trim() || busy) return;
    onSend(draft);
    setDraft("");
  };

  const openSettings = () => {
    onClose();
    router.push("/settings/assistant");
  };

  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.backdrop}>
      <Pressable style={s.dismiss} onPress={onClose} accessibilityRole="button" accessibilityLabel={t("Close")} />
      <View style={[s.sheet, { paddingBottom: insets.bottom + 8 }]}>
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
            <Pressable onPress={openSettings} accessibilityRole="button" style={s.setupButton}>
              <Text style={s.setupButtonText}>{t("Open assistant settings")}</Text>
            </Pressable>
          </View>}
          {entries.length === 0 && readiness === "ready" && <Text style={s.hint}>{t("Ask about your day, or ask me to add, move or finish a task. I will ask before changing anything.")}</Text>}
          {entries.map(entry => <EntryView key={entry.id} entry={entry} s={s} onAnswer={onAnswer} />)}
          {recording && <Text style={s.typing} accessibilityLiveRegion="polite">{t("Recording… tap the microphone again to send.")}</Text>}
          {transcribing && <Text style={s.typing} accessibilityLiveRegion="polite">{t("Turning your voice into text…")}</Text>}
          {listening && <Text style={s.typing} accessibilityLiveRegion="polite">{heard ? `“${heard}”` : t("Listening…")}</Text>}
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
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

function EntryView({ entry, s, onAnswer }: { entry: ChatEntry; s: ReturnType<typeof makeStyles>; onAnswer: (id: string, yes: boolean) => void }) {
  const { t } = useLanguage();
  switch (entry.kind) {
    case "user":
      return <View style={[s.bubble, s.mine]}><Text style={s.mineText}>{entry.text}</Text></View>;
    case "assistant":
      return entry.text.trim() ? <View style={[s.bubble, s.theirs]}><Text style={s.theirsText}>{entry.text}</Text></View> : null;
    case "error":
      return <View style={[s.bubble, s.errorBubble]} accessibilityRole="alert"><Text style={s.errorText}>{entry.text}</Text></View>;
    case "confirm": {
      const pending = entry.state === "pending";
      return <View style={s.card}>
        {entry.lines.map((line, index) => <Text key={index} style={index === 0 ? s.cardTitle : s.cardLine}>{fill(t(line.text), line.vars)}</Text>)}
        {pending
          ? <View style={s.cardButtons}>
            <Pressable onPress={() => onAnswer(entry.id, false)} accessibilityRole="button" style={[s.cardButton, s.cardNo]}>
              <Text style={s.cardNoText}>{t("No")}</Text>
            </Pressable>
            <Pressable onPress={() => onAnswer(entry.id, true)} accessibilityRole="button" style={[s.cardButton, s.cardYes]}>
              <Text style={s.cardYesText}>{t("Agree")}</Text>
            </Pressable>
          </View>
          : <Text style={s.cardState}>{t(entry.state === "approved" ? "Done" : entry.state === "failed" ? "Could not save" : "Declined")}</Text>}
      </View>;
    }
  }
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end" },
  dismiss: { flex: 1 },
  sheet: {
    maxHeight: "78%", minHeight: "45%", backgroundColor: c.background, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingTop: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: c.inputBorder,
    shadowColor: c.shadowPanel, shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: -4 }, elevation: 12,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 4, paddingBottom: 6 },
  title: { flex: 1, color: c.foreground, fontSize: 16, fontWeight: "800" },
  iconButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  list: { flexGrow: 0 },
  listBody: { gap: 8, paddingVertical: 6 },
  hint: { color: c.mutedForeground, fontSize: 13, lineHeight: 19 },
  typing: { color: c.mutedForeground, fontSize: 12, fontStyle: "italic" },
  bubble: { maxWidth: "85%", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16 },
  mine: { alignSelf: "flex-end", backgroundColor: c.primary },
  mineText: { color: c.onPrimary, fontSize: 14, lineHeight: 20 },
  theirs: { alignSelf: "flex-start", backgroundColor: c.card, borderWidth: 1, borderColor: c.inputBorder },
  theirsText: { color: c.foreground, fontSize: 14, lineHeight: 20 },
  errorBubble: { alignSelf: "flex-start", backgroundColor: c.card, borderWidth: 1, borderColor: c.destructive },
  errorText: { color: c.foreground, fontSize: 13, lineHeight: 18 },
  card: { alignSelf: "stretch", padding: 12, gap: 4, borderRadius: 14, backgroundColor: c.card, borderWidth: 1, borderColor: c.primary },
  cardTitle: { color: c.foreground, fontSize: 14, fontWeight: "800" },
  cardLine: { color: c.foreground, fontSize: 13 },
  cardButtons: { flexDirection: "row", gap: 8, marginTop: 8 },
  cardButton: { flex: 1, minHeight: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cardNo: { borderWidth: 1, borderColor: c.inputBorder },
  cardNoText: { color: c.foreground, fontSize: 14, fontWeight: "700" },
  cardYes: { backgroundColor: c.primary },
  cardYesText: { color: c.onPrimary, fontSize: 14, fontWeight: "800" },
  cardState: { color: c.mutedForeground, fontSize: 12, fontWeight: "700", marginTop: 4 },
  setup: { padding: 12, gap: 8, borderRadius: 14, backgroundColor: c.card, borderWidth: 1, borderColor: c.inputBorder },
  setupText: { color: c.foreground, fontSize: 13, lineHeight: 18 },
  setupButton: { minHeight: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: c.primary },
  setupButtonText: { color: c.onPrimary, fontSize: 13, fontWeight: "800" },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingTop: 8 },
  input: {
    flex: 1, minHeight: 44, maxHeight: 120, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14,
    backgroundColor: c.card, borderWidth: 1, borderColor: c.inputBorder, color: c.foreground, fontSize: 14,
  },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: c.primary },
  mic: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.primary },
  micOn: { backgroundColor: c.primary },
  disabled: { opacity: 0.4 },
});
