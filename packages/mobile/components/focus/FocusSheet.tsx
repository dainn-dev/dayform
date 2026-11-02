import React, { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColors } from "../../hooks/use-colors";
import { useFocusClock } from "../../hooks/use-focus-clock";
import { FilterDropdown } from "../tasks/FilterDropdown";
import type { ThemeColors } from "../../constants/theme";
import { FOCUS_CHOICES, focusMinutesFor, focusMinutesIn, formatClock, remainingMs, type FocusSession } from "../../lib/focus";
import { useFocus } from "../../lib/focus-context";
import { useLanguage } from "../../lib/language";
import { dateKey, minutes as clockMinutes, type Task } from "../../lib/planner";
import { ensureReminderChannel, getReminderPermission, requestReminderPermission } from "../../lib/reminders-expo";
import { useTasks } from "../../lib/tasks-context";

const MAX_PICKABLE_TASKS = 40;
/** The dropdown key of "no task"; a task id is never empty. */
const FREE_KEY = "";

/** Open tasks worth focusing on: today's first (by time), then the backlog. */
function pickableTasks(tasks: readonly Task[], today: string): Task[] {
  const open = tasks.filter(task => task.status !== "done");
  const todays = open.filter(task => task.date === today).sort((a, b) => clockMinutes(a.start ?? "00:00") - clockMinutes(b.start ?? "00:00"));
  const backlog = open.filter(task => task.date === null);
  return [...todays, ...backlog].slice(0, MAX_PICKABLE_TASKS);
}

/** The focus timer: choose a task and a length, then a big countdown with pause, stop, and a break after each round. */
export function FocusSheet() {
  const { sheet, closeSheet, session, prefs, log, start, pause, resume, stop, skipBreak, nextRound, setPrefs } = useFocus();
  const { tasks, mutate } = useTasks();
  const { t, language, duration } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const now = useFocusClock();
  const [picked, setPicked] = useState<string | null | undefined>(undefined);
  const today = dateKey(new Date(now));
  const chosenId = picked === undefined ? sheet.taskId : picked;
  const chosen = chosenId === null ? null : tasks.find(task => task.id === chosenId) ?? null;
  const todayMinutes = focusMinutesIn(log, today, today).total;

  /** Asks for the notification permission the first time, so the end of a round is told with the app closed. */
  const begin = async (): Promise<void> => {
    try {
      if ((await getReminderPermission()) === "undetermined") {
        await ensureReminderChannel(language);
        await requestReminderPermission();
      }
    } catch {
      // Without notifications the countdown on screen still works.
    }
    await start(chosen?.id ?? null);
  };
  const finishTask = (id: string) => mutate(list => list.map(task => (task.id === id && task.status !== "done" ? { ...task, status: "done" as const } : task)));

  const close = () => { setPicked(undefined); closeSheet(); };
  const title = session === null ? t("Focus timer") : session.phase === "break" ? t("Break") : t("Focus");

  return <Modal visible={sheet.open} animationType="slide" presentationStyle="pageSheet" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
    <SafeAreaView style={s.root} edges={["top", "bottom", "left", "right"]}>
      <View style={s.top}>
        <View><Text style={s.eyebrow}>{t("STAY WITH ONE THING")}</Text><Text accessibilityRole="header" style={s.heading}>{title}</Text></View>
        <Pressable onPress={close} accessibilityLabel={t("Close the focus timer")} accessibilityRole="button" style={s.close}><Ionicons name="close" size={22} color={colors.foreground} /></Pressable>
      </View>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {session === null
          ? <Idle s={s} colors={colors} tasks={pickableTasks(tasks, today)} chosenId={chosenId} onPick={setPicked} minutes={prefs.focusMinutes} onMinutes={m => void setPrefs({ focusMinutes: m })}
              onStart={() => void begin()} taskMinutes={chosen ? focusMinutesFor(log, chosen.id) : 0} />
          : <Running s={s} colors={colors} session={session} now={now} task={session.taskId === null ? null : tasks.find(task => task.id === session.taskId) ?? null}
              onPause={() => void pause()} onResume={() => void resume()} onStop={() => void stop()} onSkip={() => void skipBreak()} onNext={() => void nextRound()}
              onFinishTask={id => void finishTask(id)} />}
        <Text style={s.today}>{todayMinutes > 0 ? `${t("Focused today")}: ${duration(todayMinutes)}` : t("No focus time logged today yet.")}</Text>
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

type Styles = ReturnType<typeof makeStyles>;

type IdleProps = {
  s: Styles; colors: ThemeColors; tasks: Task[]; chosenId: string | null; onPick: (id: string | null) => void;
  minutes: number; onMinutes: (minutes: number) => void; onStart: () => void; taskMinutes: number;
};

function Idle({ s, colors, tasks, chosenId, onPick, minutes, onMinutes, onStart, taskMinutes }: IdleProps) {
  const { t, duration } = useLanguage();
  return <>
    <Text style={s.label}>{t("WORK ON")}</Text>
    <View style={s.pick}>
      <FilterDropdown title={t("WORK ON")} valueLabel={tasks.find(task => task.id === chosenId)?.title ?? t("Free focus")} options={[{ key: FREE_KEY, label: t("Free focus") }, ...tasks.map(task => ({ key: task.id, label: task.title }))]}
        selected={[chosenId ?? FREE_KEY]} active={chosenId !== null} onPick={key => onPick(key === FREE_KEY ? null : key)} />
    </View>
    {taskMinutes > 0 && <Text style={s.hint}>{`${t("Already focused on this")}: ${duration(taskMinutes)}`}</Text>}
    <Text style={s.label}>{t("LENGTH")}</Text>
    <View style={s.chips}>
      {FOCUS_CHOICES.map(m => <Chip key={m} s={s} selected={minutes === m} label={`${m} ${t("min")}`} onPress={() => onMinutes(m)} />)}
    </View>
    <Pressable onPress={onStart} accessibilityRole="button" style={s.primary}>
      <Text style={s.primaryText}>{t("Start focus")}</Text>
    </Pressable>
  </>;
}

type RunningProps = {
  s: Styles; colors: ThemeColors; session: FocusSession; now: number; task: Task | null;
  onPause: () => void; onResume: () => void; onStop: () => void; onSkip: () => void; onNext: () => void; onFinishTask: (id: string) => void;
};

function Running({ s, colors, session, now, task, onPause, onResume, onStop, onSkip, onNext, onFinishTask }: RunningProps) {
  const { t } = useLanguage();
  const left = remainingMs(session, now);
  const progress = 1 - left / session.durationMs;
  const onBreak = session.phase === "break";
  const paused = session.pausedAt !== null;
  return <>
    <Text style={s.taskName} numberOfLines={2}>{onBreak ? t("Rest your eyes. You earned it.") : task?.title ?? t("Free focus")}</Text>
    <Text accessibilityRole="timer" accessibilityLabel={formatClock(left)} style={s.clock}>{formatClock(left)}</Text>
    <View style={s.track}><View style={[s.fill, { width: `${Math.min(100, Math.max(0, progress * 100))}%` }]} /></View>
    <Text style={s.hint}>{onBreak ? t("Break") : paused ? t("Paused") : `${t("Round")} ${session.round + 1}`}</Text>
    {onBreak
      ? <>
        <Pressable onPress={onNext} accessibilityRole="button" style={s.primary}><Text style={s.primaryText}>{t("Another round")}</Text></Pressable>
        <Pressable onPress={onSkip} accessibilityRole="button" style={s.secondary}><Text style={s.secondaryText}>{t("End the session")}</Text></Pressable>
      </>
      : <>
        <Pressable onPress={paused ? onResume : onPause} accessibilityRole="button" style={s.primary}>
          <Text style={s.primaryText}>{paused ? t("Resume") : t("Pause")}</Text>
        </Pressable>
        {task && task.status !== "done" && <Pressable onPress={() => { onFinishTask(task.id); onStop(); }} accessibilityRole="button" style={s.secondary}><Text style={s.secondaryText}>{t("Mark done and stop")}</Text></Pressable>}
        <Pressable onPress={onStop} accessibilityRole="button" style={s.secondary}><Text style={s.secondaryText}>{t("Stop")}</Text></Pressable>
      </>}
  </>;
}

function Chip({ s, selected, label, onPress }: { s: Styles; selected: boolean; label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }} style={[s.chip, selected && s.chipOn]}>
    <Text numberOfLines={1} style={[s.chipText, selected && s.chipTextOn]}>{label}</Text>
  </Pressable>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  top: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  eyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 2, color: c.primary, marginBottom: 5 },
  heading: { fontSize: 28, fontWeight: "800", color: c.foreground, letterSpacing: -0.8 },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.card, alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: 24, paddingBottom: 32 },
  label: { color: c.labelText, fontSize: 10, fontWeight: "800", letterSpacing: 1.4, marginBottom: 9, marginTop: 19 },
  pick: { flexDirection: "row" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { minHeight: 34, maxWidth: "100%", paddingHorizontal: 11, borderRadius: 17, backgroundColor: c.card, borderWidth: 1, borderColor: c.inputBorder, justifyContent: "center" },
  chipOn: { backgroundColor: c.primary, borderColor: c.primary },
  chipText: { color: c.foreground, fontSize: 12.5, fontWeight: "700" },
  chipTextOn: { color: c.onPrimary },
  hint: { color: c.mutedForeground, fontSize: 12, marginTop: 10, textAlign: "center" },
  primary: { marginTop: 28, minHeight: 54, borderRadius: 18, backgroundColor: c.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  primaryText: { color: c.onPrimary, fontSize: 16, fontWeight: "800" },
  secondary: { marginTop: 12, minHeight: 48, borderRadius: 16, backgroundColor: c.card, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: c.foreground, fontSize: 14, fontWeight: "700" },
  taskName: { color: c.foreground, fontSize: 18, fontWeight: "700", textAlign: "center", marginTop: 24 },
  clock: { color: c.foreground, fontSize: 72, fontWeight: "800", textAlign: "center", marginTop: 18, fontVariant: ["tabular-nums"] },
  track: { height: 6, borderRadius: 3, backgroundColor: c.track, overflow: "hidden", marginTop: 14 },
  fill: { height: 6, borderRadius: 3, backgroundColor: c.primary },
  today: { color: c.mutedForeground, fontSize: 12, textAlign: "center", marginTop: 32 },
});
