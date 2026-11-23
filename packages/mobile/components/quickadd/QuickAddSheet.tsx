import React, { useEffect, useMemo, useRef, useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme, useThemedStyles, type Theme } from "../../hooks/use-theme";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { IconButton } from "../ui/IconButton";
import { useCategories } from "../../lib/categories-context";
import { useLanguage } from "../../lib/language";
import { addDays, dateKey, fromKey, type Repeat } from "../../lib/planner";
import { planQuickAdd } from "../../lib/quick-add-plan";
import { useSettings } from "../../lib/settings-context";
import { hasConflict } from "../../lib/task-save";
import { useTasks } from "../../lib/tasks-context";

type Props = { visible: boolean; onClose: () => void; /** Text to start with, e.g. what another app shared. */ initialText?: string };

const REPEAT_LABEL: Record<Repeat, string> = { daily: "Every day", weekdays: "Weekdays", weekly: "Every week", monthly: "Every month" };

const randomSuffix = () => Math.random().toString(36).slice(2);

/** Type a sentence ("họp team 3pm mai 45p #work"), see what was understood, add it. Several tasks can be added in a row. */
export function QuickAddSheet({ visible, onClose, initialText = "" }: Props) {
  const { t, locale, time, duration } = useLanguage();
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
  const { settings } = useSettings();
  const { visible: categoryIds, label } = useCategories();
  const { tasks, mutate } = useTasks();
  const [text, setText] = useState("");
  const [added, setAdded] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const saving = useRef(false);
  useEffect(() => { if (visible) { setText(initialText); setAdded(null); setFailed(false); } }, [visible, initialText]);
  const today = dateKey(new Date());

  const categories = useMemo(() => categoryIds.map(id => ({ id, name: label(id) })), [categoryIds, label]);
  const { form, plan } = useMemo(() => planQuickAdd(text, {
    now: new Date(), categories, settings, newId: () => `${Date.now()}-${randomSuffix()}`, newSeriesId: () => `series-${Date.now()}-${randomSuffix()}`,
  }), [text, categories, settings]);
  const overlapping = plan !== null && hasConflict(plan.candidate, tasks);

  const dateText = (key: string): string => {
    if (key === today) return t("Today");
    if (key === addDays(today, 1)) return t("Tomorrow");
    return fromKey(key).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
  };
  // What was understood, as plain words: the words say it, so the chips carry no icons.
  const chips: string[] = [];
  if (form !== null) {
    chips.push(form.scheduled ? `${dateText(form.date)} ${time(form.time)}` : t("On your mind"), duration(form.duration));
    if (form.repeat !== null) chips.push(t(REPEAT_LABEL[form.repeat]));
    chips.push(label(form.category));
  }

  const add = async (): Promise<void> => {
    if (plan === null || saving.current) return;
    saving.current = true;
    setFailed(false);
    try {
      if (await mutate(plan.update)) {
        setAdded(plan.candidate.title);
        setText("");
      } else {
        setFailed(true);
      }
    } finally {
      saving.current = false;
    }
  };
  const close = () => { setText(""); setAdded(null); setFailed(false); onClose(); };

  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
    <SafeAreaView style={s.root} edges={["top", "bottom", "left", "right"]}>
      <View style={s.top}>
        <View style={s.titles}><Text style={s.eyebrow}>{t("WRITE IT LIKE YOU SAY IT")}</Text><Text accessibilityRole="header" style={s.heading}>{t("Quick add")}</Text></View>
        <IconButton icon="close" label={t("Close quick add")} onPress={close} />
      </View>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <TextInput value={text} onChangeText={value => { setText(value); setAdded(null); }} onSubmitEditing={() => void add()} autoFocus returnKeyType="done" blurOnSubmit={false}
          accessibilityLabel={t("Quick add")} placeholder={t("Team meeting 3pm tomorrow 45m")} placeholderTextColor={colors.placeholder} style={s.input} />
        {form !== null
          ? <>
            <Text accessibilityRole="header" style={s.title}>{form.title}</Text>
            <View style={s.chips}>{chips.map((chip, i) => <Chip key={i} label={chip} />)}</View>
            {overlapping && <Text style={s.warn}>{t("⚠ Overlaps another task")}</Text>}
          </>
          : <Text style={s.hint}>{t("Try: Gym 6pm Friday, Pay rent every month, Read for 20m")}</Text>}
        <Button label={t("Add task")} onPress={() => void add()} disabled={plan === null} block style={s.primary} />
        {added !== null && <Text accessibilityLiveRegion="polite" style={s.ok}>{`${t("Added")}: ${added}`}</Text>}
        {failed && <Text accessibilityLiveRegion="polite" style={s.warn}>{t("Your change could not be saved. Please try again.")}</Text>}
        <Text style={s.tips}>{t("Words I understand: today, tomorrow, Monday, 15/11, 3pm, 15h30, 45m, 2 hours, every day, every Friday, #category.")}</Text>
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

const makeStyles = ({ colors: c, type, font, radius, space, gutter }: Theme) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  top: { paddingHorizontal: gutter, paddingTop: space.xl, paddingBottom: space.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  titles: { flex: 1, minWidth: 0 },
  eyebrow: { ...type.micro, color: c.primary, marginBottom: 5 },
  heading: { ...type.display, color: c.foreground },
  content: { paddingHorizontal: gutter, paddingBottom: space.xxxl },
  input: {
    ...type.body, minHeight: 56, backgroundColor: c.card, borderRadius: radius.md, paddingHorizontal: space.lg, color: c.foreground,
    borderWidth: 1, borderColor: c.inputBorder,
  },
  title: { ...type.headline, color: c.foreground, marginTop: 22 },
  // The chips only show what was understood; the 10 px gap keeps their (unused) hit areas apart like the editor's chips.
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: space.md },
  warn: { ...type.meta, ...font.bold, color: c.conflictText, marginTop: space.md },
  hint: { ...type.body, color: c.mutedForeground, marginTop: 22 },
  primary: { marginTop: 26 },
  ok: { ...type.label, color: c.accentForeground, marginTop: 14, textAlign: "center" },
  tips: { ...type.caption, ...font.regular, color: c.mutedForeground, marginTop: 28 },
});
