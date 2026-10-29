import { useMemo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import { formatNotice } from "../../lib/backup-flow";
import { useLanguage } from "../../lib/language";
import { LIST_FAILED_MESSAGE, SNAPSHOTS_PAUSED_MESSAGE } from "../../lib/recovery-messages";
import type { ThemeColors } from "../../constants/theme";
import { RecoveryConfirm } from "./RecoveryConfirm";
import { RecoveryItemRow } from "./RecoveryItemRow";
import { useRecoveryActions, type RecoveryActions } from "./use-recovery-actions";
import { useSnapshotsPaused } from "./use-snapshot-paused";

const HINT = "Copies of data that could not be read are kept here, together with automatic snapshots, so nothing is lost.";

type Styles = ReturnType<typeof makeStyles>;

function ListBody({ actions, s }: { actions: RecoveryActions; s: Styles }) {
  const { t } = useLanguage();
  const colors = useColors();
  const { items, listFailed, busy, pending, ask, cancel, confirmDelete, refresh } = actions;
  if (items === null) return <ActivityIndicator color={colors.primary} size="small" style={s.loading} />;
  if (listFailed) {
    return <View>
      <Text accessibilityRole="alert" style={s.error}>{t(LIST_FAILED_MESSAGE)}</Text>
      <Pressable onPress={() => { void refresh(); }} accessibilityRole="button" style={s.button}><Text style={s.buttonText}>{t("Try again")}</Text></Pressable>
    </View>;
  }
  if (items.length === 0) return <Text style={s.empty}>{t("No recovery copies")}</Text>;
  return <View>
    {items.map(item => <RecoveryItemRow key={item.key} item={item} actions={actions} />)}
    {pending?.kind === "delete-all"
      ? <RecoveryConfirm question="Delete every recovery copy for good?" yes="Yes, delete" busy={busy}
        onYes={() => { void confirmDelete(); }} onCancel={cancel} />
      : <Pressable disabled={busy} onPress={() => { void ask({ kind: "delete-all" }); }} accessibilityRole="button"
        accessibilityState={{ disabled: busy }} style={[s.button, s.deleteAll, busy && s.disabled]}>
        <Text style={s.deleteText}>{t("Delete all recovery copies")}</Text>
      </Pressable>}
  </View>;
}

/**
 * "Data recovery": the copies kept by the loader (unreadable data, invalid records) and the automatic
 * snapshots, with Preview, Restore (merge / replace) and Delete. The card starts collapsed and reads no copy
 * until it is expanded (a snapshot can be 500 KB, and the Tasks tab must stay cheap). Restores go through the
 * task store only. The surrounding card supplies the "Data recovery" heading (lib/i18n/recovery.ts).
 */
export function RecoverySection() {
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const actions = useRecoveryActions();
  const snapshotsPaused = useSnapshotsPaused();
  const { expanded, notice, busy, toggleExpanded, refresh } = actions;
  const notices = notice && <Text accessibilityRole="alert" style={notice.tone === "success" ? s.success : s.error}>{formatNotice(notice.parts, t)}</Text>;

  return <View>
    <Text style={s.hint}>{t(HINT)}</Text>
    {snapshotsPaused && <Text accessibilityRole="alert" style={s.paused}>{t(SNAPSHOTS_PAUSED_MESSAGE)}</Text>}
    <View style={s.toolbar}>
      <Pressable disabled={busy} onPress={() => { void toggleExpanded(); }} accessibilityRole="button"
        accessibilityState={{ expanded, disabled: busy }} style={[s.button, busy && s.disabled]}>
        <Text style={s.buttonText}>{t(expanded ? "Hide recovery copies" : "Show recovery copies")}</Text>
      </Pressable>
      {expanded && <Pressable disabled={busy} onPress={() => { void refresh(); }} accessibilityRole="button"
        accessibilityState={{ disabled: busy }} style={[s.button, busy && s.disabled]}>
        <Text style={s.buttonText}>{t("Refresh")}</Text>
      </Pressable>}
    </View>
    {expanded && <ListBody actions={actions} s={s} />}
    {notices}
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  loading: { alignSelf: "flex-start", marginTop: 12 },
  hint: { color: c.mutedForeground, fontSize: 12, lineHeight: 18 },
  paused: { color: c.foreground, fontSize: 12, fontWeight: "700", lineHeight: 18, marginTop: 8 },
  empty: { color: c.mutedForeground, fontSize: 12, marginTop: 12 },
  toolbar: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  button: { minHeight: 44, paddingHorizontal: 14, borderRadius: 12, alignItems: "center", justifyContent: "center", alignSelf: "flex-start", backgroundColor: c.primaryTint, marginTop: 12 },
  buttonText: { color: c.foreground, fontSize: 12, fontWeight: "800" },
  deleteAll: { backgroundColor: c.card, borderWidth: 1, borderColor: c.primaryBorder },
  deleteText: { color: c.errorMessage, fontSize: 12, fontWeight: "800" },
  disabled: { opacity: 0.45 },
  success: { color: c.success, fontSize: 12, fontWeight: "700", marginTop: 10 },
  error: { color: c.errorMessage, fontSize: 12, fontWeight: "700", marginTop: 10 },
});
