import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, useThemedStyles, type Theme } from "../../hooks/use-theme";
import { useLanguage } from "../../lib/language";
import { dateKey } from "../../lib/planner";
import { describeDate, sortByNext, untilText } from "../../lib/special-day-draft";
import { useSpecialDays } from "../../lib/special-days-context";
import { MAX_SPECIAL_DAYS, countText, type SpecialKind } from "../../lib/special-days";
import { fillPlaceholders } from "../../lib/text-template";
import { useHeaderAction } from "../menu/header-action";
import { SpecialDayEditorModal, type SpecialDayTarget } from "./SpecialDayEditorModal";

const KIND_ICONS: Record<SpecialKind, "gift-outline" | "heart-outline" | "flower-outline" | "star-outline"> = {
  birthday: "gift-outline", wedding: "heart-outline", memorial: "flower-outline", custom: "star-outline",
};
const ICON_BADGE = 40;

/** "Special days": the user's birthdays, anniversaries and other yearly days, nearest first; an add button under the list adds one (the page's floating plus belongs to the categories above). */
export function SpecialDaysSection() {
  const days = useSpecialDays();
  const { t } = useLanguage();
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
  const [editing, setEditing] = useState<SpecialDayTarget | null>(null);
  const today = dateKey(new Date());
  const sorted = useMemo(() => sortByNext(days.items, today), [days.items, today]);
  const atLimit = days.items.length >= MAX_SPECIAL_DAYS;

  // The page shows this plus beside the card's title.
  useHeaderAction({ label: t("Add special day"), disabled: days.locked || atLimit, onPress: () => setEditing({ kind: "new" }) });

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

const makeStyles = (t: Theme) => {
  const c = t.colors;
  return StyleSheet.create({
    lead: { ...t.type.meta, ...t.font.regular, color: c.mutedForeground, marginBottom: t.space.sm },
    notice: { ...t.type.meta, ...t.font.regular, color: c.warningText, backgroundColor: c.warningBg, marginBottom: t.space.xs + 2, marginTop: t.space.xs, padding: 10, borderRadius: t.radius.md, overflow: "hidden" },
    empty: { ...t.type.body, color: c.labelText, paddingVertical: 14 },
    row: { flexDirection: "row", alignItems: "center", gap: t.space.md, minHeight: 56, paddingVertical: t.space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.hairline },
    badge: { width: ICON_BADGE, height: ICON_BADGE, borderRadius: t.radius.md, backgroundColor: c.primaryTint, alignItems: "center", justifyContent: "center" },
    texts: { flex: 1 },
    name: { ...t.type.subtitle, color: c.foreground },
    meta: { ...t.type.meta, color: c.mutedForeground, marginTop: 1 },
    until: { ...t.type.meta, ...t.font.bold, color: c.mutedForeground },
    untilToday: { color: c.accentForeground },
    hint: { ...t.type.caption, ...t.font.regular, color: c.labelText, marginTop: t.space.xs + 2 },
  });
};
