import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { pickBackupText } from "../../lib/backup-expo";
import { useCategories } from "../../lib/categories-context";
import { IMPORT_WINDOW_DAYS, MAX_IMPORTED_TASKS, parseIcs, planIcsImport, type IcsPlan, type IcsSkipped } from "../../lib/ics";
import { useLanguage } from "../../lib/language";
import { dateKey } from "../../lib/planner";
import { pickCategory } from "../../lib/new-task-defaults";
import { useSettings } from "../../lib/settings-context";
import { useTasks } from "../../lib/tasks-context";

type Stage =
  | { kind: "idle" }
  | { kind: "ready"; plan: IcsPlan; skipped: IcsSkipped; truncated: boolean }
  | { kind: "message"; text: string };

const PICK_MESSAGES = {
  "read-failed": "That file could not be read.",
  "too-large": "That file is too big to import.",
  "unsupported-platform": "Importing is not available on this device.",
} as const;

function skippedLine(skipped: IcsSkipped, t: (text: string) => string): string {
  const parts: string[] = [];
  if (skipped.allDay > 0) parts.push(`${skipped.allDay} ${t("all-day")}`);
  if (skipped.cancelled > 0) parts.push(`${skipped.cancelled} ${t("cancelled")}`);
  if (skipped.unsupported > 0) parts.push(`${skipped.unsupported} ${t("with a repeat rule not supported")}`);
  if (skipped.outsideWindow > 0) parts.push(`${skipped.outsideWindow} ${t("outside the next 90 days")}`);
  return parts.length === 0 ? "" : `${t("Skipped")}: ${parts.join(", ")}`;
}

/** Brings the events of a calendar file (.ics from Google, Apple or Outlook calendar) in as tasks, once and never twice. */
export function CalendarImportSection() {
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { settings } = useSettings();
  const { visible } = useCategories();
  const { tasks, mutate } = useTasks();
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [busy, setBusy] = useState(false);

  const choose = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      const picked = await pickBackupText(["text/calendar", "*/*"]);
      if (!picked.ok) return setStage(picked.reason === "cancelled" ? { kind: "idle" } : { kind: "message", text: t(PICK_MESSAGES[picked.reason]) });
      const parsed = parseIcs(picked.text, dateKey(new Date()));
      if (!parsed.ok) return setStage({ kind: "message", text: t(parsed.reason === "too-large" ? PICK_MESSAGES["too-large"] : "That file is not a calendar.") });
      const plan = planIcsImport(parsed.occurrences, tasks, pickCategory(settings.defaults.category, visible), new Date().toISOString());
      setStage({ kind: "ready", plan, skipped: parsed.skipped, truncated: parsed.truncated });
    } finally {
      setBusy(false);
    }
  };

  const add = async (plan: IcsPlan): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      // Re-derived inside the write queue: an event that appeared in the meantime is not added twice.
      const known = (list: { id: string }[]) => new Set(list.map(task => task.id));
      const ok = await mutate(list => {
        const have = known(list);
        const fresh = plan.toAdd.filter(task => !have.has(task.id));
        return fresh.length === 0 ? list : [...list, ...fresh];
      }, { undo: "bulk" });
      setStage({ kind: "message", text: ok ? `${t("Added")}: ${plan.toAdd.length}` : t("Your change could not be saved. Please try again.") });
    } finally {
      setBusy(false);
    }
  };

  return <View>
    <Text style={s.hint}>{t("Choose a .ics file exported from your calendar. Events of the next 90 days become tasks; importing the same file again adds nothing twice.")}</Text>
    <Pressable onPress={() => void choose()} disabled={busy} accessibilityRole="button" style={s.button}>
      {busy && <ActivityIndicator color={colors.primary} />}
      <Text style={s.buttonText}>{t("Choose a calendar file")}</Text>
    </Pressable>
    {stage.kind === "ready" && <View style={s.panel}>
      <Text style={s.headline}>{`${stage.plan.toAdd.length} ${t("events to add")}`}{stage.plan.alreadyThere > 0 ? ` · ${stage.plan.alreadyThere} ${t("already imported")}` : ""}</Text>
      {skippedLine(stage.skipped, t) !== "" && <Text style={s.hint}>{skippedLine(stage.skipped, t)}</Text>}
      {stage.truncated && <Text style={s.hint}>{`${t("Only the first")} ${MAX_IMPORTED_TASKS} ${t("events are imported.")}`}</Text>}
      <Text style={s.hint}>{`${t("Times are read as written in the file; a time with a time zone label is taken as your local time.")} (${IMPORT_WINDOW_DAYS} ${t("days")})`}</Text>
      <Pressable onPress={() => void add(stage.plan)} disabled={busy || stage.plan.toAdd.length === 0} accessibilityRole="button" style={[s.primary, stage.plan.toAdd.length === 0 && s.off]}>
        <Text style={s.primaryText}>{t("Add to my tasks")}</Text>
      </Pressable>
    </View>}
    {stage.kind === "message" && <Text accessibilityLiveRegion="polite" style={s.message}>{stage.text}</Text>}
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  hint: { color: c.mutedForeground, fontSize: 12, lineHeight: 18, marginTop: 6 },
  button: { marginTop: 12, minHeight: 48, borderRadius: 15, backgroundColor: c.primarySoft, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  buttonText: { color: c.accentForeground, fontSize: 14, fontWeight: "800" },
  panel: { marginTop: 14 },
  headline: { color: c.foreground, fontSize: 15, fontWeight: "800" },
  primary: { marginTop: 12, minHeight: 48, borderRadius: 15, backgroundColor: c.primary, alignItems: "center", justifyContent: "center" },
  off: { opacity: 0.45 },
  primaryText: { color: c.onPrimary, fontSize: 14, fontWeight: "800" },
  message: { color: c.accentForeground, fontSize: 13, fontWeight: "700", marginTop: 12 },
});
