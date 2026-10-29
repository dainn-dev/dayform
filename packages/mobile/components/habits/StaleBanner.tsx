import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";
import { fillPlaceholders } from "../../lib/text-template";

const MIN_TOUCH_TARGET = 44;
const CLOSE_ICON_SIZE = 18;

type Props = {
  count: number;
  days: number;
  onReview: () => void;
  onDismiss: () => void;
};

/** "N tasks have been waiting over D days" with a Review button and a close button. */
export function StaleBanner({ count, days, onReview, onDismiss }: Props) {
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const template = count === 1 ? "{count} task has been waiting over {days} days" : "{count} tasks have been waiting over {days} days";
  const message = fillPlaceholders(t(template), { count: String(count), days: String(days) });
  return <View style={s.banner}>
    <View style={s.body}>
      <Text accessibilityLiveRegion="polite" style={s.message}>{message}</Text>
      <Pressable onPress={onReview} accessibilityRole="button" accessibilityLabel={t("Review them")} style={s.button}>
        <Text style={s.buttonText}>{t("Review them")}</Text>
      </Pressable>
    </View>
    <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel={t("Hide this reminder for today")} style={s.close}>
      <Ionicons name="close" size={CLOSE_ICON_SIZE} color={colors.mutedForeground} />
    </Pressable>
  </View>;
}

type ReviewProps = { onShowAll: () => void };

/** Shown instead of the banner while the list is limited to the waiting tasks. */
export function StaleReviewStrip({ onShowAll }: ReviewProps) {
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return <View style={s.banner}>
    <Text style={[s.message, s.strip]}>{t("Showing the tasks that have been waiting")}</Text>
    <Pressable onPress={onShowAll} accessibilityRole="button" accessibilityLabel={t("Show all tasks again")} style={[s.button, s.showAll]}>
      <Text style={s.buttonText}>{t("Show all tasks again")}</Text>
    </Pressable>
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  banner: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 20, paddingLeft: 16, paddingVertical: 8, backgroundColor: c.primaryTint, borderRadius: 17, borderWidth: 1, borderColor: c.primaryBorder },
  body: { flex: 1, paddingVertical: 4 },
  message: { color: c.foreground, fontSize: 13, fontWeight: "700", lineHeight: 18 },
  strip: { flex: 1, paddingVertical: 4 },
  button: { alignSelf: "flex-start", minHeight: MIN_TOUCH_TARGET, paddingHorizontal: 16, marginTop: 8, justifyContent: "center", backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.primaryBorder },
  showAll: { alignSelf: "center", marginTop: 0, marginRight: 8 },
  buttonText: { color: c.primary, fontSize: 12, fontWeight: "700" },
  close: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: "center", justifyContent: "center", alignSelf: "flex-start" },
});
