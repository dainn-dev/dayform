import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import { planImport, TOO_MANY_TASKS_MESSAGE, type ImportSummary } from "../../lib/backup-flow";
import { useLanguage } from "../../lib/language";
import { useTasks } from "../../lib/tasks-context";
import type { ThemeColors } from "../../constants/theme";
import type { BackupActions } from "./use-backup-actions";

type Translate = (text: string) => string;
const SEPARATOR = "  ·  ";

function countsLine(summary: ImportSummary, t: Translate): string {
  const parts = [
    `${summary.found} ${t("tasks found")}`,
    ...(summary.skipped > 0 ? [`${summary.skipped} ${t("tasks skipped")}`] : []),
  ];
  return parts.join(SEPARATOR);
}

function detailLine(summary: ImportSummary, t: Translate): string {
  const parts = [
    `${summary.added} ${t("added")}`,
    `${summary.updated} ${t("updated")}`,
    `${summary.unchanged} ${t("unchanged")}`,
    ...(summary.removed > 0 ? [`${summary.removed} ${t("removed")}`] : []),
  ];
  return parts.join(SEPARATOR);
}

type Props = Pick<BackupActions, "stage" | "busy" | "importWith" | "askToReplace" | "cancel">;

/** Shown after a backup file was read: summary, then Merge / Replace (Replace asks to confirm). */
export function ImportPanel({ stage, busy, importWith, askToReplace, cancel }: Props) {
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { tasks } = useTasks();
  if (stage.kind === "idle") return null;

  const merge = planImport(tasks, stage.parsed, "merge");
  const replace = planImport(tasks, stage.parsed, "replace");
  const headline = merge.ok ? merge.summary : replace.ok ? replace.summary : null;
  const mergeBlocked = busy || !merge.ok;
  const replaceBlocked = busy || !replace.ok;

  return <View style={s.panel}>
    {headline && <Text style={s.headline}>{countsLine(headline, t)}</Text>}
    {stage.kind === "confirm-replace" ? <>
      <Text style={s.question}>{t("Replace all your current tasks?")}</Text>
      {replace.ok && <Text style={s.detail}>{detailLine(replace.summary, t)}</Text>}
      <View style={s.row}>
        <Pressable disabled={replaceBlocked} onPress={() => { void importWith("replace"); }} accessibilityRole="button"
          style={[s.button, s.danger, replaceBlocked && s.disabled]}><Text style={s.dangerText}>{t("Yes, replace")}</Text></Pressable>
        <Pressable onPress={cancel} accessibilityRole="button" style={[s.button, s.secondary]}><Text style={s.secondaryText}>{t("Cancel")}</Text></Pressable>
      </View>
    </> : <>
      <Text style={s.question}>{t("How do you want to import them?")}</Text>
      {merge.ok ? <Text style={s.detail}>{detailLine(merge.summary, t)}</Text>
        : <Text accessibilityRole="alert" style={s.error}>{t(TOO_MANY_TASKS_MESSAGE)}</Text>}
      <View style={s.row}>
        <Pressable disabled={mergeBlocked} onPress={() => { void importWith("merge"); }} accessibilityRole="button"
          style={[s.button, s.primary, mergeBlocked && s.disabled]}><Text style={s.primaryText}>{t("Merge with current tasks")}</Text></Pressable>
        <Pressable disabled={replaceBlocked} onPress={askToReplace} accessibilityRole="button"
          style={[s.button, s.secondary, replaceBlocked && s.disabled]}><Text style={s.secondaryText}>{t("Replace current tasks")}</Text></Pressable>
      </View>
      <Pressable onPress={cancel} accessibilityRole="button" style={s.cancel}><Text style={s.cancelText}>{t("Cancel")}</Text></Pressable>
    </>}
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  panel: { marginTop: 12, padding: 14, borderRadius: 14, backgroundColor: c.primarySoft, borderWidth: 1, borderColor: c.primaryBorder },
  headline: { color: c.foreground, fontSize: 13, fontWeight: "800" },
  question: { color: c.foreground, fontSize: 13, fontWeight: "700", marginTop: 10 },
  detail: { color: c.mutedForeground, fontSize: 12, marginTop: 6 },
  error: { color: c.errorMessage, fontSize: 12, marginTop: 6 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  button: { minHeight: 44, paddingHorizontal: 14, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  primary: { backgroundColor: c.primary }, primaryText: { color: c.onPrimary, fontSize: 12, fontWeight: "800" },
  secondary: { backgroundColor: c.card, borderWidth: 1, borderColor: c.primaryBorder }, secondaryText: { color: c.foreground, fontSize: 12, fontWeight: "800" },
  danger: { backgroundColor: c.destructive }, dangerText: { color: c.onPrimary, fontSize: 12, fontWeight: "800" },
  disabled: { opacity: 0.45 },
  cancel: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" }, cancelText: { color: c.accentForeground, fontSize: 12, fontWeight: "700" },
});
