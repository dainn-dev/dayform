import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useTheme, useThemedStyles, type Theme } from "../../hooks/use-theme";
import { IconButton } from "../ui/IconButton";
import { HEALTH_DATA_WARNING, formatNotice } from "../../lib/backup-flow";
import { useLanguage } from "../../lib/language";
import { ImportPanel } from "./ImportPanel";
import { useBackupActions } from "./use-backup-actions";

/** "Backup": export the tasks to a shareable JSON file, or import one (merge or replace). */
export function BackupSection() {
  const { t } = useLanguage();
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
  const { stage, notice, busy, includesHealthData, exportTasks, startImport, importWith, askToReplace, cancel } = useBackupActions();
  const importBlocked = busy || stage.kind !== "idle";

  return <View>
    <Text style={s.hint}>{t("Your tasks are stored on this device (and in your phone's encrypted backup, if it is on). Export a copy to keep it safe or move it elsewhere.")}</Text>
    <Text style={s.note}>{t("The backup file is not encrypted. Keep it somewhere safe.")}</Text>
    {includesHealthData && <Text style={s.healthNote}>{t(HEALTH_DATA_WARNING)}</Text>}
    <View style={s.row}>
      <IconButton icon="share-outline" label={t("Export tasks")} disabled={busy} onPress={() => { void exportTasks(); }} />
      <IconButton icon="download-outline" label={t("Import tasks")} disabled={importBlocked} onPress={() => { void startImport(); }} />
    </View>
    {busy && <View style={s.busy}><ActivityIndicator color={colors.primary} size="small" /><Text style={s.busyText}>{t("Working...")}</Text></View>}
    {notice && <Text accessibilityRole="alert" style={notice.tone === "success" ? s.success : s.error}>{formatNotice(notice.parts, t)}</Text>}
    <ImportPanel stage={stage} busy={busy} importWith={importWith} askToReplace={askToReplace} cancel={cancel} />
  </View>;
}

const makeStyles = (t: Theme) => {
  const c = t.colors;
  return StyleSheet.create({
    hint: { ...t.type.meta, ...t.font.regular, color: c.mutedForeground },
    note: { ...t.type.meta, ...t.font.regular, color: c.mutedForeground, marginTop: t.space.xs },
    healthNote: { ...t.type.meta, ...t.font.bold, color: c.errorMessage, marginTop: t.space.xs },
    row: { flexDirection: "row", gap: t.space.sm, marginTop: 10 },
    busy: { flexDirection: "row", alignItems: "center", gap: t.space.sm, marginTop: t.space.sm },
    busyText: { ...t.type.meta, ...t.font.regular, color: c.mutedForeground },
    success: { ...t.type.meta, ...t.font.bold, color: c.success, marginTop: t.space.sm },
    error: { ...t.type.meta, ...t.font.bold, color: c.errorMessage, marginTop: t.space.sm },
  });
};
