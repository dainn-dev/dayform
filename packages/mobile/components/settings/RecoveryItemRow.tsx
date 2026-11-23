import { StyleSheet, Text, View } from "react-native";
import { useThemedStyles, type Theme } from "../../hooks/use-theme";
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
import { Button } from "../ui/Button";
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
  const s = useThemedStyles(makeStyles);
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
    <Button variant={destructive ? "danger" : "secondary"} label={t(label)} accessibilityLabel={itemActionLabel(label, item, t)}
      disabled={!enabled} onPress={onPress} />;

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

const makeStyles = (t: Theme) => {
  const c = t.colors;
  return StyleSheet.create({
    row: { marginTop: 10, padding: t.space.md, borderRadius: t.radius.md, backgroundColor: c.primarySoft, borderWidth: 1, borderColor: c.primaryBorder },
    title: { ...t.type.label, color: c.foreground },
    meta: { ...t.type.meta, ...t.font.regular, color: c.mutedForeground, marginTop: t.space.xxs },
    preview: { marginTop: t.space.sm },
    error: { ...t.type.meta, ...t.font.regular, color: c.errorMessage, marginTop: t.space.xs },
    actions: { flexDirection: "row", flexWrap: "wrap", gap: t.space.sm, marginTop: t.space.sm },
  });
};
