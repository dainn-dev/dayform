import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import { countItem, formatNotice, importErrorMessage, planImport, type ImportSummary } from "../../lib/backup-flow";
import { useLanguage } from "../../lib/language";
import { useTasks } from "../../lib/tasks-context";
import type { ThemeColors } from "../../constants/theme";
import type { BackupActions } from "./use-backup-actions";

type Translate = (text: string) => string;
const SEPARATOR = "  ·  ";

function countsLine(found: number, skipped: number, t: Translate): string {
  const items = [countItem(found, "task found", "tasks found")];
  if (skipped > 0) items.push(countItem(skipped, "task skipped", "tasks skipped"));
  return items.map(item => formatNotice([item], t)).join(SEPARATOR);
}

/** "Label: count" keeps a natural word order in every language. */
function labelled(label: string, count: number, t: Translate): string {
  return `${t(label)}: ${count}`;
}

function detailLine(summary: ImportSummary, t: Translate): string {
  const parts = [
    labelled("Added", summary.added, t),
    labelled("Updated", summary.updated, t),
    labelled("Unchanged", summary.unchanged, t),
    ...(summary.removed > 0 ? [labelled("Removed", summary.removed, t)] : []),
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
  const mergeBlocked = busy || !merge.ok;
  const replaceBlocked = busy || !replace.ok;

  return <View style={s.panel}>
    <Text style={s.headline}>{countsLine(stage.parsed.tasks.length, stage.parsed.rejected, t)}</Text>
    {stage.kind === "confirm-replace" ? <>
      <Text style={s.question}>{t("Replace all your current tasks?")}</Text>
      {replace.ok ? <Text style={s.detail}>{detailLine(replace.summary, t)}</Text>
        : <Text accessibilityRole="alert" style={s.error}>{t(importErrorMessage(replace.reason))}</Text>}
      <View style={s.row}>
        <Pressable disabled={replaceBlocked} onPress={() => { void importWith("replace"); }} accessibilityRole="button"
          style={[s.button, s.danger, replaceBlocked && s.disabled]}><Text style={s.dangerText}>{t("Yes, replace")}</Text></Pressable>
        <Pressable onPress={cancel} accessibilityRole="button" style={[s.button, s.secondary]}><Text style={s.secondaryText}>{t("Cancel")}</Text></Pressable>
      </View>
    </> : <>
      <Text style={s.question}>{t("How do you want to import them?")}</Text>
      {merge.ok ? <Text style={s.detail}>{detailLine(merge.summary, t)}</Text>
        : <Text accessibilityRole="alert" style={s.error}>{t(importErrorMessage(merge.reason))}</Text>}
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
