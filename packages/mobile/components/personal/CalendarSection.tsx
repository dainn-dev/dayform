import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { ChoiceChips, type Choice } from "../editor/ChoiceChips";
import { HourStepper } from "./HourStepper";
import { useLanguage } from "../../lib/language";
import { dayWindowFromMinutes, dayWindowPatch, isDayWindowValid, MIN_WINDOW_HOURS, stepDayWindow, type DayWindow } from "../../lib/day-window";
import { formatTime, resolveTimeFormat } from "../../lib/planner";
import type { Settings } from "../../lib/settings";
import { useSettings } from "../../lib/settings-context";
import { hourLabel } from "../../lib/timeline-config";
import { fillPlaceholders } from "../../lib/text-template";

type Calendar = Settings["calendar"];
const EXAMPLE_TIME = "09:30";

/** "Calendar & time": day window, hour height, week start and time format (settings.calendar). */
export function CalendarSection() {
  const { settings, update } = useSettings();
  const { t, language, timeFormat } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { calendar } = settings;
  const saved = useMemo(() => dayWindowFromMinutes(calendar.dayStart, calendar.dayEnd), [calendar.dayStart, calendar.dayEnd]);
  // The steppers edit a draft: an invalid pair (under 4 hours) is explained inline and never saved or reset.
  const [draft, setDraft] = useState<DayWindow>(saved);
  useEffect(() => setDraft(saved), [saved]);
  const valid = isDayWindowValid(draft);
  const step = (edge: "start" | "end", delta: number) => {
    const next = stepDayWindow(draft, edge, delta);
    setDraft(next);
    if (isDayWindowValid(next)) void update({ calendar: dayWindowPatch(next) });
  };
  const change = (patch: Partial<Pick<Calendar, "hourHeight" | "weekStart" | "timeFormat">>) => { void update({ calendar: patch }); };
  const example = formatTime(EXAMPLE_TIME, resolveTimeFormat(calendar.timeFormat, language));

  const heights: Choice<Calendar["hourHeight"]>[] = [
    { value: "compact", label: t("Compact") }, { value: "normal", label: t("Normal") }, { value: "roomy", label: t("Roomy") },
  ];
  const weeks: Choice<Calendar["weekStart"]>[] = [
    { value: "mon", label: t("Monday") }, { value: "sun", label: t("Sunday") }, { value: "sat", label: t("Saturday") },
  ];
  const formats: Choice<Calendar["timeFormat"]>[] = [
    { value: "auto", label: t("Automatic") }, { value: "12h", label: t("12-hour") }, { value: "24h", label: t("24-hour") },
  ];

  return <View>
    <HourStepper label={t("Day starts")} valueText={hourLabel(draft.startHour, timeFormat)}
      decreaseLabel={t("Day starts earlier")} increaseLabel={t("Day starts later")}
      onDecrease={() => step("start", -1)} onIncrease={() => step("start", 1)} />
    <HourStepper label={t("Day ends")} valueText={hourLabel(draft.endHour, timeFormat)}
      decreaseLabel={t("Day ends earlier")} increaseLabel={t("Day ends later")}
      onDecrease={() => step("end", -1)} onIncrease={() => step("end", 1)} />
    {!valid && <Text accessibilityRole="alert" style={s.error}>{fillPlaceholders(t("The day must be at least {hours} hours long. The timeline keeps its last valid hours."), { hours: String(MIN_WINDOW_HOURS) })}</Text>}
    <Text style={s.caption}>{t("Hour height")}</Text>
    <ChoiceChips choices={heights} value={calendar.hourHeight} onChange={hourHeight => change({ hourHeight })} />
    <Text style={s.caption}>{t("Week starts on")}</Text>
    <ChoiceChips choices={weeks} value={calendar.weekStart} onChange={weekStart => change({ weekStart })} />
    <Text style={s.caption}>{t("Time format")}</Text>
    <ChoiceChips choices={formats} value={calendar.timeFormat} onChange={format => change({ timeFormat: format })} />
    <Text style={s.example}>{fillPlaceholders(t("Example: {time}"), { time: example })}</Text>
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  caption: { color: c.mutedForeground, fontSize: 12, fontWeight: "700", marginTop: 16, marginBottom: 8 },
  error: { color: c.errorBannerText, fontSize: 12, lineHeight: 17, marginTop: 6 },
  example: { color: c.mutedForeground, fontSize: 12, marginTop: 10 },
});
