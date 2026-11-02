import { useMemo } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import { IconButton } from "../ui/IconButton";
import { HEALTH_DATA_WARNING, formatNotice } from "../../lib/backup-flow";
import { useLanguage } from "../../lib/language";
import type { ThemeColors } from "../../constants/theme";
import { ImportPanel } from "./ImportPanel";
import { useBackupActions } from "./use-backup-actions";

/** "Backup": export the tasks to a shareable JSON file, or import one (merge or replace). */
export function BackupSection() {
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
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

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  hint: { color: c.mutedForeground, fontSize: 12, lineHeight: 18 },
  note: { color: c.mutedForeground, fontSize: 12, lineHeight: 18, marginTop: 4 },
  healthNote: { color: c.errorMessage, fontSize: 12, lineHeight: 18, fontWeight: "700", marginTop: 4 },
  row: { flexDirection: "row", gap: 8, marginTop: 10 },
  busy: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }, busyText: { color: c.mutedForeground, fontSize: 12 },
  success: { color: c.success, fontSize: 12, fontWeight: "700", marginTop: 8 },
  error: { color: c.errorMessage, fontSize: 12, fontWeight: "700", marginTop: 8 },
});
