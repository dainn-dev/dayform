import React, { useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusClock } from "../../hooks/use-focus-clock";
import { useThemedStyles, type Theme } from "../../hooks/use-theme";
import { FilterDropdown } from "../tasks/FilterDropdown";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { IconButton } from "../ui/IconButton";
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
  const s = useThemedStyles(makeStyles);
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
        <View style={s.titles}><Text style={s.eyebrow}>{t("STAY WITH ONE THING")}</Text><Text accessibilityRole="header" style={s.heading}>{title}</Text></View>
        <IconButton icon="close" label={t("Close the focus timer")} onPress={close} />
      </View>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {session === null
          ? <Idle s={s} tasks={pickableTasks(tasks, today)} chosenId={chosenId} onPick={setPicked} minutes={prefs.focusMinutes} onMinutes={m => void setPrefs({ focusMinutes: m })}
              onStart={() => void begin()} taskMinutes={chosen ? focusMinutesFor(log, chosen.id) : 0} />
          : <Running s={s} session={session} now={now} task={session.taskId === null ? null : tasks.find(task => task.id === session.taskId) ?? null}
              onPause={() => void pause()} onResume={() => void resume()} onStop={() => void stop()} onSkip={() => void skipBreak()} onNext={() => void nextRound()}
              onFinishTask={id => void finishTask(id)} />}
        <Text style={s.today}>{todayMinutes > 0 ? `${t("Focused today")}: ${duration(todayMinutes)}` : t("No focus time logged today yet.")}</Text>
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

type Styles = ReturnType<typeof makeStyles>;

type IdleProps = {
  s: Styles; tasks: Task[]; chosenId: string | null; onPick: (id: string | null) => void;
  minutes: number; onMinutes: (minutes: number) => void; onStart: () => void; taskMinutes: number;
};

function Idle({ s, tasks, chosenId, onPick, minutes, onMinutes, onStart, taskMinutes }: IdleProps) {
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
      {FOCUS_CHOICES.map(m => <Chip key={m} selected={minutes === m} label={`${m} ${t("min")}`} onPress={() => onMinutes(m)} style={s.chip} />)}
    </View>
    <Button label={t("Start focus")} onPress={onStart} block style={s.primary} />
  </>;
}

type RunningProps = {
  s: Styles; session: FocusSession; now: number; task: Task | null;
  onPause: () => void; onResume: () => void; onStop: () => void; onSkip: () => void; onNext: () => void; onFinishTask: (id: string) => void;
};

function Running({ s, session, now, task, onPause, onResume, onStop, onSkip, onNext, onFinishTask }: RunningProps) {
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
        <Button label={t("Another round")} onPress={onNext} block style={s.primary} />
        <Button label={t("End the session")} variant="secondary" onPress={onSkip} block style={s.secondary} />
      </>
      : <>
        <Button label={paused ? t("Resume") : t("Pause")} onPress={paused ? onResume : onPause} block style={s.primary} />
        {task && task.status !== "done" && <Button label={t("Mark done and stop")} variant="secondary" onPress={() => { onFinishTask(task.id); onStop(); }} block style={s.secondary} />}
        <Button label={t("Stop")} variant="secondary" onPress={onStop} block style={s.secondary} />
      </>}
  </>;
}

const TRACK_HEIGHT = 6;
const CLOCK_SIZE = 72;

const makeStyles = ({ colors: c, type, space, gutter }: Theme) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  top: { paddingHorizontal: gutter, paddingTop: space.xl, paddingBottom: space.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  titles: { flex: 1, minWidth: 0 },
  eyebrow: { ...type.micro, color: c.primary, marginBottom: 5 },
  heading: { ...type.display, color: c.foreground },
  content: { paddingHorizontal: gutter, paddingBottom: space.xxxl },
  label: { ...type.micro, color: c.labelText, marginBottom: 9, marginTop: 19 },
  pick: { flexDirection: "row" },
  // 10 px apart: twice the chip's hit slop, so two touch targets never overlap.
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  chip: { maxWidth: "100%" },
  hint: { ...type.meta, color: c.mutedForeground, marginTop: 10, textAlign: "center" },
  primary: { marginTop: 28 },
  secondary: { marginTop: space.md },
  taskName: { ...type.title, color: c.foreground, textAlign: "center", marginTop: space.xxl },
  // The countdown is the one thing on this sheet: the hero role (36..44px) scaled up to the old 72px size.
  clock: { ...type.hero, fontSize: CLOCK_SIZE, lineHeight: Math.round(CLOCK_SIZE * 1.12), color: c.foreground, textAlign: "center", marginTop: 18, fontVariant: ["tabular-nums"] },
  track: { height: TRACK_HEIGHT, borderRadius: TRACK_HEIGHT / 2, backgroundColor: c.track, overflow: "hidden", marginTop: 14 },
  fill: { height: TRACK_HEIGHT, borderRadius: TRACK_HEIGHT / 2, backgroundColor: c.primary },
  today: { ...type.meta, color: c.mutedForeground, textAlign: "center", marginTop: space.xxxl },
});
