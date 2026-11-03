import React, { useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColors } from "../../hooks/use-colors";
import { useKeyboardInset } from "../../hooks/use-keyboard-inset";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";
import { MAX_SSH_COMMAND, SSH_ERROR_TEXTS, type SshResult } from "../../lib/ssh";
import { readSshCredentials } from "../../lib/ssh-credentials-expo";
import { useSshHistory } from "../../lib/ssh-history-context";
import { hostAddress, type SshHost } from "../../lib/ssh-hosts";
import { TERMINAL_MAX_BYTES, TERMINAL_TIMEOUT_MS, formatDuration, runOnHost } from "../../lib/ssh-run";
import { fillPlaceholders } from "../../lib/text-template";
import { runSshCommand } from "../../modules/dayform-ssh";

type Props = { visible: boolean; host: SshHost | null; onClose: () => void };

/** One line of the transcript: the command and what came back (or why nothing did). */
type Run = { key: number; command: string; result: SshResult | null; ms: number; error: string | null };

const RECENT_COMMANDS = 8;
const MAX_RUNS_SHOWN = 20;
const SECONDS = 1000;
const BYTES_PER_KB = 1024;

/** Run commands one at a time on a server and read the output. Each command opens its own connection (no shell session yet), so `cd` does not carry over. */
export function SshTerminal({ visible, host, onClose }: Props) {
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const keyboard = useKeyboardInset();
  const history = useSshHistory();
  const [command, setCommand] = useState("");
  const [runs, setRuns] = useState<Run[]>([]);
  const [busy, setBusy] = useState(false);
  const counter = useRef(0);
  const scroller = useRef<ScrollView>(null);

  // A different server starts a clean transcript.
  const [shownHost, setShownHost] = useState<string | null>(null);
  if ((host?.id ?? null) !== shownHost) {
    setShownHost(host?.id ?? null);
    setRuns([]);
    setCommand("");
  }

  const recent = useMemo(() => (host === null ? [] : history.items.filter(item => item.hostId === host.id).slice(0, RECENT_COMMANDS)), [history.items, host]);

  const run = async (): Promise<void> => {
    if (host === null || busy) return;
    const text = command.trim();
    if (text === "") return;
    setBusy(true);
    const key = (counter.current += 1);
    try {
      const outcome = await runOnHost(host, text, { readCredentials: readSshCredentials, run: (target, options) => runSshCommand(target, options), now: Date.now });
      if (outcome.entry !== null) void history.record(outcome.entry);
      const next: Run = outcome.ok
        ? { key, command: text, result: outcome.result, ms: outcome.ms, error: null }
        : { key, command: text, result: null, ms: 0, error: t(SSH_ERROR_TEXTS[outcome.code]) };
      setRuns(list => [...list, next].slice(-MAX_RUNS_SHOWN));
      if (outcome.ok) setCommand("");
    } finally {
      setBusy(false);
    }
  };

  if (host === null) return null;
  const cannotRun = busy || command.trim() === "";
  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
    <SafeAreaView style={s.root} edges={["top", "bottom", "left", "right"]}>
      <View style={s.top}>
        <View style={s.topText}>
          <Text accessibilityRole="header" numberOfLines={1} style={s.heading}>{host.name}</Text>
          <Text numberOfLines={1} style={s.meta}>{`${host.user}@${hostAddress(host)}`}</Text>
        </View>
        <Pressable onPress={onClose} accessibilityLabel={t("Close")} accessibilityRole="button" style={s.close}><Ionicons name="close" size={22} color={colors.foreground} /></Pressable>
      </View>

      <ScrollView ref={scroller} style={s.log} contentContainerStyle={s.logContent} keyboardShouldPersistTaps="handled" onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })}>
        {runs.length === 0 && <Text style={s.hint}>{t("Type a command and press Run. Each command is run on its own, so a cd does not carry over to the next one.")}</Text>}
        {runs.map(item => <View key={item.key} style={s.runBox}>
          <Text selectable style={s.prompt}>{`$ ${item.command}`}</Text>
          {item.error !== null && <Text selectable style={s.stderr}>{item.error}</Text>}
          {item.result !== null && <>
            {item.result.stdout !== "" && <Text selectable style={s.stdout}>{item.result.stdout}</Text>}
            {item.result.stderr !== "" && <Text selectable style={s.stderr}>{item.result.stderr}</Text>}
            {item.result.truncated && <Text style={s.note}>{fillPlaceholders(t("The output was longer than {size} KB; the end was cut."), { size: String(TERMINAL_MAX_BYTES / BYTES_PER_KB) })}</Text>}
            <Text style={item.result.timedOut || item.result.exitCode !== 0 ? s.footBad : s.foot}>
              {item.result.timedOut
                ? fillPlaceholders(t("Stopped after {seconds} seconds."), { seconds: String(TERMINAL_TIMEOUT_MS / SECONDS) })
                : `${t("Exit code")} ${item.result.exitCode} · ${formatDuration(item.ms)}`}
            </Text>
          </>}
        </View>)}
      </ScrollView>

      <View style={[s.footer, { marginBottom: keyboard.height }]}>
        {recent.length > 0 && <View style={s.recentRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.recent} style={s.grow}>
            {recent.map(item => <Pressable key={item.id} onPress={() => setCommand(item.command)} accessibilityRole="button" accessibilityLabel={`${t("Use this command")}: ${item.command}`} style={s.chip}>
              <Text numberOfLines={1} style={s.chipText}>{item.command}</Text>
            </Pressable>)}
          </ScrollView>
          <Pressable onPress={() => void history.clear(host.id)} accessibilityRole="button" accessibilityLabel={t("Clear the command history")} style={s.clear}>
            <Ionicons name="trash-outline" size={18} color={colors.mutedForeground} />
          </Pressable>
        </View>}
        <View style={s.inputRow}>
          <TextInput value={command} onChangeText={setCommand} maxLength={MAX_SSH_COMMAND} autoCapitalize="none" autoCorrect={false} spellCheck={false} multiline
            placeholder="uptime" placeholderTextColor={colors.placeholder} accessibilityLabel={t("Command")} style={s.input} />
          <Pressable onPress={() => void run()} disabled={cannotRun} accessibilityRole="button" accessibilityState={{ disabled: cannotRun, busy }} style={[s.runButton, cannotRun && s.off]}>
            <Text style={s.runText}>{busy ? t("Running…") : t("Run")}</Text>
          </Pressable>
        </View>
        <Text style={s.fine}>{t("The history keeps the commands, not their output. Do not type a password into a command: it would be kept.")}</Text>
      </View>
    </SafeAreaView>
  </Modal>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  top: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  topText: { flex: 1, minWidth: 0 },
  heading: { fontSize: 24, fontWeight: "800", color: c.foreground, letterSpacing: -0.6 },
  meta: { color: c.mutedForeground, fontSize: 12, marginTop: 2 },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.card, alignItems: "center", justifyContent: "center" },
  log: { flex: 1, marginHorizontal: 16, borderRadius: 16, backgroundColor: c.card },
  logContent: { padding: 14, gap: 14 },
  hint: { color: c.mutedForeground, fontSize: 12, lineHeight: 17 },
  runBox: { gap: 4 },
  prompt: { color: c.primary, fontFamily: "monospace", fontSize: 12, fontWeight: "700" },
  stdout: { color: c.foreground, fontFamily: "monospace", fontSize: 12, lineHeight: 17 },
  stderr: { color: c.errorMessage, fontFamily: "monospace", fontSize: 12, lineHeight: 17 },
  note: { color: c.mutedForeground, fontSize: 11 },
  foot: { color: c.mutedForeground, fontSize: 11, fontWeight: "700" },
  footBad: { color: c.errorMessage, fontSize: 11, fontWeight: "700" },
  footer: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8, gap: 8 },
  recentRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  grow: { flex: 1 },
  recent: { gap: 6, paddingRight: 6 },
  chip: { maxWidth: 220, minHeight: 36, justifyContent: "center", paddingHorizontal: 12, borderRadius: 12, backgroundColor: c.primarySoft },
  chipText: { color: c.accentForeground, fontFamily: "monospace", fontSize: 12 },
  clear: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  input: { flex: 1, minHeight: 48, maxHeight: 120, backgroundColor: c.card, borderRadius: 14, paddingHorizontal: 14, paddingTop: 12, color: c.foreground, fontFamily: "monospace", fontSize: 14, borderWidth: 1, borderColor: c.inputBorder },
  runButton: { minHeight: 48, paddingHorizontal: 18, borderRadius: 14, backgroundColor: c.primary, alignItems: "center", justifyContent: "center" },
  runText: { color: c.onPrimary, fontSize: 14, fontWeight: "800" },
  off: { opacity: 0.45 },
  fine: { color: c.mutedForeground, fontSize: 10, lineHeight: 14 },
});
