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
import { SwitchRow } from "./SwitchRow";
import { fillPlaceholders } from "../../lib/text-template";
import type { HolidayGroup } from "../../lib/holidays-vn";

type Calendar = Settings["calendar"];

/** The holiday groups that can be switched off, with their labels (translation keys in lib/i18n/calendar.ts). */
const HOLIDAY_GROUP_ROWS: ReadonlyArray<{ group: HolidayGroup; label: string; hint: string }> = [
  { group: "national", label: "Public holidays", hint: "Tết, Giỗ Tổ, 30/4, 1/5, 2/9." },
  { group: "traditional", label: "Lunar festivals", hint: "Rằm, Trung thu, Vu Lan, ông Táo and more." },
  { group: "occasion", label: "Other occasions", hint: "Valentine, Women's Day, Teachers' Day, Christmas, Mother's Day." },
];
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
  const change = (patch: Partial<Pick<Calendar, "hourHeight" | "weekStart" | "timeFormat" | "showHolidays" | "showLunar">>) => { void update({ calendar: patch }); };
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
    <View style={s.holidays}>
      <SwitchRow label={t("Show holidays")} hint={t("Marks Vietnamese holidays, solar and lunar, on the week strip and above the day.")}
        value={calendar.showHolidays} onChange={showHolidays => change({ showHolidays })} />
      {calendar.showHolidays && HOLIDAY_GROUP_ROWS.map(row => <SwitchRow key={row.group} label={t(row.label)} hint={t(row.hint)}
        value={calendar.holidayGroups[row.group]} onChange={on => { void update({ calendar: { holidayGroups: { [row.group]: on } } }); }} />)}
      <SwitchRow label={t("Show lunar date")} hint={t("Shows the lunar day and month under each day of the week.")}
        value={calendar.showLunar} onChange={showLunar => change({ showLunar })} />
    </View>
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  caption: { color: c.mutedForeground, fontSize: 12, fontWeight: "700", marginTop: 12, marginBottom: 6 },
  error: { color: c.errorBannerText, fontSize: 12, lineHeight: 17, marginTop: 4 },
  example: { color: c.mutedForeground, fontSize: 12, marginTop: 8 },
  holidays: { marginTop: 12, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.hairline },
});
