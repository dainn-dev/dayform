import { useMemo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../../hooks/use-colors";
import { formatNotice } from "../../lib/backup-flow";
import { useLanguage } from "../../lib/language";
import type { ThemeColors } from "../../constants/theme";
import { ImportPanel } from "./ImportPanel";
import { useBackupActions } from "./use-backup-actions";

/** "Backup": export the tasks to a shareable JSON file, or import one (merge or replace). */
export function BackupSection() {
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { stage, notice, busy, exportTasks, startImport, importWith, askToReplace, cancel } = useBackupActions();
  const importBlocked = busy || stage.kind !== "idle";

  return <View>
    <Text style={s.hint}>{t("Your tasks stay on this device. Export a copy to keep it safe or move it elsewhere.")}</Text>
    <Text style={s.note}>{t("The backup file is not encrypted. Keep it somewhere safe.")}</Text>
    <View style={s.row}>
      <Pressable disabled={busy} onPress={() => { void exportTasks(); }} accessibilityRole="button" style={[s.button, busy && s.disabled]}>
        <Ionicons name="share-outline" size={18} color={colors.primary} /><Text style={s.buttonText}>{t("Export tasks")}</Text>
      </Pressable>
      <Pressable disabled={importBlocked} onPress={() => { void startImport(); }} accessibilityRole="button" style={[s.button, importBlocked && s.disabled]}>
        <Ionicons name="download-outline" size={18} color={colors.primary} /><Text style={s.buttonText}>{t("Import tasks")}</Text>
      </Pressable>
    </View>
    {busy && <View style={s.busy}><ActivityIndicator color={colors.primary} size="small" /><Text style={s.busyText}>{t("Working...")}</Text></View>}
    {notice && <Text accessibilityRole="alert" style={notice.tone === "success" ? s.success : s.error}>{formatNotice(notice.parts, t)}</Text>}
    <ImportPanel stage={stage} busy={busy} importWith={importWith} askToReplace={askToReplace} cancel={cancel} />
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  hint: { color: c.mutedForeground, fontSize: 12, lineHeight: 18 },
  note: { color: c.mutedForeground, fontSize: 12, lineHeight: 18, marginTop: 4 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  button: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, paddingHorizontal: 14, borderRadius: 12, backgroundColor: c.primaryTint },
  buttonText: { color: c.foreground, fontSize: 12, fontWeight: "800" },
  disabled: { opacity: 0.45 },
  busy: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }, busyText: { color: c.mutedForeground, fontSize: 12 },
  success: { color: c.success, fontSize: 12, fontWeight: "700", marginTop: 10 },
  error: { color: c.errorMessage, fontSize: 12, fontWeight: "700", marginTop: 10 },
});
