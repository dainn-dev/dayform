import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useThemedStyles, type Theme } from "../../hooks/use-theme";
import { pickBackupText } from "../../lib/backup-expo";
import { useCategories } from "../../lib/categories-context";
import { IMPORT_WINDOW_DAYS, MAX_IMPORTED_TASKS, parseIcs, planIcsImport, type IcsPlan, type IcsSkipped } from "../../lib/ics";
import { useLanguage } from "../../lib/language";
import { dateKey } from "../../lib/planner";
import { pickCategory } from "../../lib/new-task-defaults";
import { useSettings } from "../../lib/settings-context";
import { useTasks } from "../../lib/tasks-context";
import { Button } from "../ui/Button";

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
  const s = useThemedStyles(makeStyles);
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
    <Button block variant="secondary" label={t("Choose a calendar file")} busy={busy} onPress={() => void choose()} style={s.button} />
    {stage.kind === "ready" && <View style={s.panel}>
      <Text style={s.headline}>{`${stage.plan.toAdd.length} ${t("events to add")}`}{stage.plan.alreadyThere > 0 ? ` · ${stage.plan.alreadyThere} ${t("already imported")}` : ""}</Text>
      {skippedLine(stage.skipped, t) !== "" && <Text style={s.hint}>{skippedLine(stage.skipped, t)}</Text>}
      {stage.truncated && <Text style={s.hint}>{`${t("Only the first")} ${MAX_IMPORTED_TASKS} ${t("events are imported.")}`}</Text>}
      <Text style={s.hint}>{`${t("Times are read as written in the file; a time with a time zone label is taken as your local time.")} (${IMPORT_WINDOW_DAYS} ${t("days")})`}</Text>
      <Button block label={t("Add to my tasks")} disabled={busy || stage.plan.toAdd.length === 0} onPress={() => void add(stage.plan)} style={s.button} />
    </View>}
    {stage.kind === "message" && <Text accessibilityLiveRegion="polite" style={s.message}>{stage.text}</Text>}
  </View>;
}

const makeStyles = (t: Theme) => {
  const c = t.colors;
  return StyleSheet.create({
    hint: { ...t.type.meta, ...t.font.regular, color: c.mutedForeground, marginTop: t.space.xs + 2 },
    button: { marginTop: t.space.md },
    panel: { marginTop: 14 },
    headline: { ...t.type.subtitle, color: c.foreground },
    message: { ...t.type.label, color: c.accentForeground, marginTop: t.space.md },
  });
};
