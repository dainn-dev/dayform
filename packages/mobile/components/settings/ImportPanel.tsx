import { StyleSheet, Text, View } from "react-native";
import { useThemedStyles, type Theme } from "../../hooks/use-theme";
import {
  IMPORT_HAS_TRACKER_NOTE, countItem, formatNotice, importErrorMessage, planImport, replaceImportQuestion, type ImportSummary,
} from "../../lib/backup-flow";
import { isPersonalDataOnly } from "../../lib/recovery-messages";
import { useLanguage } from "../../lib/language";
import { useTasks } from "../../lib/tasks-context";
import { Button } from "../ui/Button";
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
  const s = useThemedStyles(makeStyles);
  const { tasks } = useTasks();
  if (stage.kind === "idle") return null;

  // A file with the tracker alone changes no task, so there is no task plan to show or to be blocked by.
  const trackerOnly = isPersonalDataOnly(stage.parsed);
  const merge = trackerOnly ? null : planImport(tasks, stage.parsed, "merge");
  const replace = trackerOnly ? null : planImport(tasks, stage.parsed, "replace");
  const mergeBlocked = busy || (merge !== null && !merge.ok);
  const replaceBlocked = busy || (replace !== null && !replace.ok);

  return <View style={s.panel}>
    {!trackerOnly && <Text style={s.headline}>{countsLine(stage.parsed.tasks.length, stage.parsed.rejected, t)}</Text>}
    {stage.parsed.cycle !== undefined && <Text style={trackerOnly ? s.headline : s.detail}>{t(IMPORT_HAS_TRACKER_NOTE)}</Text>}
    {stage.parsed.specialDays !== undefined && <Text style={trackerOnly && stage.parsed.cycle === undefined ? s.headline : s.detail}>{t("This file also has special days.")}</Text>}
    {stage.kind === "confirm-replace" ? <>
      <Text style={s.question}>{t(replaceImportQuestion(stage.parsed))}</Text>
      {replace === null ? null : replace.ok ? <Text style={s.detail}>{detailLine(replace.summary, t)}</Text>
        : <Text accessibilityRole="alert" style={s.error}>{t(importErrorMessage(replace.reason))}</Text>}
      <View style={s.row}>
        <Button variant="danger" label={t("Yes, replace")} disabled={replaceBlocked} onPress={() => { void importWith("replace"); }} />
        <Button variant="secondary" label={t("Cancel")} onPress={cancel} />
      </View>
    </> : <>
      <Text style={s.question}>{t("How do you want to import them?")}</Text>
      {merge === null ? null : merge.ok ? <Text style={s.detail}>{detailLine(merge.summary, t)}</Text>
        : <Text accessibilityRole="alert" style={s.error}>{t(importErrorMessage(merge.reason))}</Text>}
      <View style={s.row}>
        <Button label={t("Merge with current tasks")} disabled={mergeBlocked} onPress={() => { void importWith("merge"); }} />
        <Button variant="secondary" label={t("Replace current tasks")} disabled={replaceBlocked} onPress={askToReplace} />
      </View>
      <Button variant="ghost" label={t("Cancel")} onPress={cancel} style={s.cancel} />
    </>}
  </View>;
}

const makeStyles = (t: Theme) => {
  const c = t.colors;
  return StyleSheet.create({
    panel: { marginTop: 10, padding: t.space.md, borderRadius: t.radius.md, backgroundColor: c.primarySoft, borderWidth: 1, borderColor: c.primaryBorder },
    headline: { ...t.type.label, color: c.foreground },
    question: { ...t.type.label, color: c.foreground, marginTop: t.space.sm },
    detail: { ...t.type.meta, ...t.font.regular, color: c.mutedForeground, marginTop: t.space.xs },
    error: { ...t.type.meta, ...t.font.regular, color: c.errorMessage, marginTop: t.space.xs },
    row: { flexDirection: "row", flexWrap: "wrap", gap: t.space.sm, marginTop: 10 },
    cancel: { marginTop: t.space.xs },
  });
};
