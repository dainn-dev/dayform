import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../../hooks/use-colors";
import { useNow } from "../../hooks/use-now";
import {
  ARCHIVE_UNEXPECTED_NOTICE,
  archivable,
  archiveButtonLabel,
  archiveNotice,
  readArchive,
  runArchive,
  runRestore,
  type ArchiveNotice,
  type ArchiveOutcome,
  type RestoreOutcome,
} from "../../lib/archive";
import { countItem, formatNotice } from "../../lib/backup-flow";
import { useLanguage } from "../../lib/language";
import { dateKey } from "../../lib/planner";
import { useTasks } from "../../lib/tasks-context";
import type { ThemeColors } from "../../constants/theme";

/** null = not read yet (or unreadable). */
function useArchivedCount(): { archivedCount: number | null; refresh: () => Promise<void> } {
  const [archivedCount, setArchivedCount] = useState<number | null>(null);
  const refresh = useCallback(async () => {
    const result = await readArchive(AsyncStorage);
    setArchivedCount(result.ok ? result.tasks.length : null);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return { archivedCount, refresh };
}

/** "Archive": move old finished tasks out of the main list (the cheap guard against the storage cap) and back. */
export function ArchiveSection() {
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { tasks, loading, writesBlocked, mutate } = useTasks();
  const today = dateKey(useNow());
  const { archivedCount, refresh } = useArchivedCount();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<ArchiveNotice | null>(null);

  const eligible = useMemo(() => archivable(tasks, today).length, [tasks, today]);
  const idle = !busy && !loading && !writesBlocked;

  const run = useCallback(async (action: () => Promise<ArchiveOutcome | RestoreOutcome>) => {
    setBusy(true);
    setNotice(null);
    setConfirming(false);
    try {
      setNotice(archiveNotice(await action()));
    } catch {
      // The archive functions return typed outcomes; this only guards an unexpected throw from the store.
      setNotice(ARCHIVE_UNEXPECTED_NOTICE);
    } finally {
      setBusy(false);
      await refresh();
    }
  }, [refresh]);

  const archiveNow = () => run(() => runArchive(AsyncStorage, { mutate }, tasks, today));
  const restoreAll = () => run(() => runRestore(AsyncStorage, { mutate }));
  const countLine = (n: number, one: string, many: string) => formatNotice([countItem(n, one, many)], t);

  return <View>
    <Text style={s.hint}>{t("Move old completed tasks out of your main list to keep the app fast and your storage free.")}</Text>
    <Text style={s.count}>{countLine(eligible, "task can be archived", "tasks can be archived")}</Text>
    {archivedCount !== null && <Text style={s.count}>{countLine(archivedCount, "task in the archive", "tasks in the archive")}</Text>}
    {confirming ? <View style={s.row}>
      <Text style={s.question}>{t("Archive old tasks?")}</Text>
      <Pressable disabled={!idle} onPress={() => { void archiveNow(); }} accessibilityRole="button" style={[s.button, s.primary, !idle && s.disabled]}>
        <Text style={s.primaryText}>{t("Archive")}</Text>
      </Pressable>
      <Pressable onPress={() => setConfirming(false)} accessibilityRole="button" style={[s.button, s.secondary]}>
        <Text style={s.buttonText}>{t("Cancel")}</Text>
      </Pressable>
    </View> : <View style={s.row}>
      <Pressable disabled={!idle || eligible === 0} onPress={() => setConfirming(true)} accessibilityRole="button" style={[s.button, (!idle || eligible === 0) && s.disabled]}>
        <Ionicons name="archive-outline" size={18} color={colors.primary} />
        <Text style={s.buttonText}>{archiveButtonLabel(t)}</Text>
      </Pressable>
      <Pressable disabled={!idle || archivedCount === 0} onPress={() => { void restoreAll(); }} accessibilityRole="button" style={[s.button, (!idle || archivedCount === 0) && s.disabled]}>
        <Ionicons name="arrow-undo-outline" size={18} color={colors.primary} />
        <Text style={s.buttonText}>{t("Restore archived tasks")}</Text>
      </Pressable>
    </View>}
    {busy && <View style={s.busy}><ActivityIndicator color={colors.primary} size="small" /><Text style={s.busyText}>{t("Working...")}</Text></View>}
    {notice && <Text accessibilityRole="alert" style={notice.tone === "success" ? s.success : s.error}>{formatNotice(notice.parts, t)}</Text>}
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  hint: { color: c.mutedForeground, fontSize: 12, lineHeight: 18 },
  count: { color: c.foreground, fontSize: 12, fontWeight: "700", marginTop: 6 },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 12 },
  question: { color: c.foreground, fontSize: 13, fontWeight: "800" },
  button: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, paddingHorizontal: 14, borderRadius: 12, backgroundColor: c.primaryTint },
  buttonText: { color: c.foreground, fontSize: 12, fontWeight: "800", flexShrink: 1 },
  primary: { backgroundColor: c.primary },
  primaryText: { color: c.primaryForeground, fontSize: 12, fontWeight: "800" },
  secondary: { backgroundColor: c.primaryTint },
  disabled: { opacity: 0.45 },
  busy: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }, busyText: { color: c.mutedForeground, fontSize: 12 },
  success: { color: c.success, fontSize: 12, fontWeight: "700", marginTop: 10 },
  error: { color: c.errorMessage, fontSize: 12, fontWeight: "700", marginTop: 10 },
});
