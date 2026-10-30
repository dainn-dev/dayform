import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import { formatNotice, planImport, type ImportPlan } from "../../lib/backup-flow";
import { useLanguage } from "../../lib/language";
import type { RecoveryItem } from "../../lib/recovery";
import {
  isPersonalDataOnly,
  itemActionLabel,
  itemLine,
  kindLabel,
  previewSummaryParts,
  replaceCopyQuestion,
  restoreErrorMessage,
  summaryLine,
} from "../../lib/recovery-messages";
import { useTasks } from "../../lib/tasks-context";
import type { ThemeColors } from "../../constants/theme";
import { RecoveryConfirm } from "./RecoveryConfirm";
import type { RecoveryActions } from "./use-recovery-actions";

type Props = { item: RecoveryItem; actions: RecoveryActions };
type Translate = (text: string) => string;

function planText(plan: ImportPlan | null, t: Translate): string {
  if (plan === null) return "";
  return plan.ok ? summaryLine(plan.summary, t) : t(restoreErrorMessage(plan.reason));
}

/** One recovery copy: description, Preview, Restore (merge / confirmed replace) and Delete (confirmed). */
export function RecoveryItemRow({ item, actions }: Props) {
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { tasks } = useTasks();
  const { busy, canRestore, pending, preview, togglePreview, restore, ask, cancel, confirmDelete } = actions;
  const mine = pending !== null && pending.kind !== "delete-all" && pending.key === item.key ? pending : null;
  const previewHere = preview !== null && preview.key === item.key ? preview.result : null;
  const restorable = canRestore && !busy && !item.unreadable;
  const parsed = previewHere !== null && previewHere.ok ? previewHere.parsed : null;
  // A copy of the tracker alone changes no task, so there is no task plan to show.
  const planned = parsed !== null && !isPersonalDataOnly(parsed);
  const mergePlan = planned ? planImport(tasks, parsed, "merge") : null;
  const replacePlan = planned ? planImport(tasks, parsed, "replace") : null;

  const button = (label: string, onPress: () => void, enabled: boolean, destructive = false) =>
    <Pressable disabled={!enabled} onPress={onPress} accessibilityRole="button" accessibilityLabel={itemActionLabel(label, item, t)}
      accessibilityState={{ disabled: !enabled }} style={[s.button, !enabled && s.disabled]}>
      <Text style={destructive ? s.destructiveText : s.buttonText}>{t(label)}</Text>
    </Pressable>;

  return <View style={s.row}>
    <Text style={s.title}>{t(kindLabel(item.kind))}</Text>
    <Text style={s.meta}>{item.label}</Text>
    <Text style={s.meta}>{itemLine(item, t)}</Text>
    {previewHere !== null && <View style={s.preview}>
      {previewHere.ok ? <>
        <Text style={s.meta}>{formatNotice(previewSummaryParts(previewHere.parsed), t)}</Text>
        {planned && <Text style={s.meta}>{t("Restore (merge)")}: {planText(mergePlan, t)}</Text>}
        {planned && <Text style={s.meta}>{t("Restore (replace)")}: {planText(replacePlan, t)}</Text>}
      </> : <Text accessibilityRole="alert" style={s.error}>{t(restoreErrorMessage(previewHere.reason))}</Text>}
    </View>}
    {mine !== null && mine.kind === "replace" && <RecoveryConfirm question={replaceCopyQuestion(item.kind, parsed)}
      yes="Yes, replace" busy={busy} onYes={() => { void restore(item.key, "replace"); }} onCancel={cancel} />}
    {mine !== null && mine.kind === "delete" && <RecoveryConfirm question="Delete this copy for good?"
      yes="Yes, delete" busy={busy} onYes={() => { void confirmDelete(); }} onCancel={cancel} />}
    {mine === null && <View style={s.actions}>
      {button(previewHere === null ? "Preview" : "Hide preview", () => { void togglePreview(item.key); }, !busy && !item.unreadable)}
      {button("Restore (merge)", () => { void restore(item.key, "merge"); }, restorable)}
      {button("Restore (replace)", () => { void ask({ kind: "replace", key: item.key }); }, restorable)}
      {button("Delete", () => { void ask({ kind: "delete", key: item.key }); }, !busy, true)}
    </View>}
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  row: { marginTop: 10, padding: 12, borderRadius: 14, backgroundColor: c.primarySoft, borderWidth: 1, borderColor: c.primaryBorder },
  title: { color: c.foreground, fontSize: 13, fontWeight: "800" },
  meta: { color: c.mutedForeground, fontSize: 12, lineHeight: 18, marginTop: 2 },
  preview: { marginTop: 8 },
  error: { color: c.errorMessage, fontSize: 12, marginTop: 4 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  button: { minHeight: 44, paddingHorizontal: 14, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: c.card, borderWidth: 1, borderColor: c.primaryBorder },
  buttonText: { color: c.foreground, fontSize: 12, fontWeight: "800" },
  destructiveText: { color: c.errorMessage, fontSize: 12, fontWeight: "800" },
  disabled: { opacity: 0.45 },
});
