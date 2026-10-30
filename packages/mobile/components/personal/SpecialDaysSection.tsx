import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";
import { dateKey } from "../../lib/planner";
import { describeDate, sortByNext, untilText } from "../../lib/special-day-draft";
import { useSpecialDays } from "../../lib/special-days-context";
import { MAX_SPECIAL_DAYS, countText, type SpecialKind } from "../../lib/special-days";
import { fillPlaceholders } from "../../lib/text-template";
import { useFloatingAction } from "../menu/floating-action";
import { SpecialDayEditorModal, type SpecialDayTarget } from "./SpecialDayEditorModal";

const KIND_ICONS: Record<SpecialKind, "gift-outline" | "heart-outline" | "flower-outline" | "star-outline"> = {
  birthday: "gift-outline", wedding: "heart-outline", memorial: "flower-outline", custom: "star-outline",
};
const ICON_BADGE = 40;

/** "Special days": the user's birthdays, anniversaries and other yearly days, nearest first; a floating plus adds one. */
export function SpecialDaysSection() {
  const days = useSpecialDays();
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [editing, setEditing] = useState<SpecialDayTarget | null>(null);
  const today = dateKey(new Date());
  const sorted = useMemo(() => sortByNext(days.items, today), [days.items, today]);
  const atLimit = days.items.length >= MAX_SPECIAL_DAYS;

  useFloatingAction({ label: t("Add special day"), disabled: days.locked || atLimit, onPress: () => setEditing({ kind: "new" }) });

  return <View>
    <Text style={s.lead}>{t("Birthdays, anniversaries and other days that come back every year. They are marked on the Timeline.")}</Text>
    {days.locked && <Text accessibilityRole="alert" style={s.notice}>{t("Your special days could not be read safely, so changes are paused this session.")}</Text>}
    {!days.locked && days.saveError && <Text accessibilityRole="alert" style={s.notice}>{t("Could not save your special days. Please try again.")}</Text>}
    {sorted.length === 0 && <Text style={s.empty}>{t("No special days yet. Tap + to add a birthday or an anniversary.")}</Text>}
    {sorted.map(({ item, next }) => {
      const count = next === null ? "" : countText(item.kind, next.years, t);
      const detail = [describeDate(item, t), count].filter(part => part !== "").join(" · ");
      const until = next === null ? "" : untilText(next.daysUntil, t);
      return <Pressable key={item.id} onPress={() => setEditing({ kind: "edit", id: item.id })} accessibilityRole="button"
        accessibilityLabel={`${item.title}, ${detail}${until === "" ? "" : `, ${until}`}`} style={s.row}>
        <View style={s.badge}><Ionicons name={KIND_ICONS[item.kind]} size={19} color={colors.accentForeground} /></View>
        <View style={s.texts}>
          <Text numberOfLines={1} style={s.name}>{item.title}</Text>
          <Text numberOfLines={1} style={s.meta}>{detail}</Text>
        </View>
        {until !== "" && <Text style={[s.until, next?.daysUntil === 0 && s.untilToday]}>{until}</Text>}
      </Pressable>;
    })}
    {atLimit && <Text style={s.hint}>{fillPlaceholders(t("You can keep up to {count} special days."), { count: String(MAX_SPECIAL_DAYS) })}</Text>}
    <SpecialDayEditorModal target={editing} onClose={() => setEditing(null)} />
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  lead: { color: c.mutedForeground, fontSize: 12, lineHeight: 17, marginBottom: 8 },
  notice: { color: c.warningText, backgroundColor: c.warningBg, fontSize: 12, lineHeight: 17, marginBottom: 6, marginTop: 4, padding: 10, borderRadius: 12, overflow: "hidden" },
  empty: { color: c.labelText, fontSize: 13, lineHeight: 19, paddingVertical: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.hairline },
  badge: { width: ICON_BADGE, height: ICON_BADGE, borderRadius: 14, backgroundColor: c.primaryTint, alignItems: "center", justifyContent: "center" },
  texts: { flex: 1 },
  name: { color: c.foreground, fontSize: 15, fontWeight: "700" },
  meta: { color: c.mutedForeground, fontSize: 12, marginTop: 1 },
  until: { color: c.mutedForeground, fontSize: 12, fontWeight: "700" },
  untilToday: { color: c.accentForeground },
  hint: { color: c.labelText, fontSize: 11, lineHeight: 16, marginTop: 6 },
});
