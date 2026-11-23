import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, useThemedStyles, type Theme } from "../../hooks/use-theme";
import { useLanguage } from "../../lib/language";
import { fillPlaceholders } from "../../lib/text-template";
import { IconButton } from "../ui/IconButton";

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
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
  const template = count === 1 ? "{count} task has been waiting over {days} days" : "{count} tasks have been waiting over {days} days";
  const message = fillPlaceholders(t(template), { count: String(count), days: String(days) });
  return <View style={s.banner}>
    <View style={s.body}>
      <Text accessibilityLiveRegion="polite" style={s.message}>{message}</Text>
      <IconButton icon="eye-outline" label={t("Review them")} onPress={onReview} style={s.button} />
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
  const s = useThemedStyles(makeStyles);
  return <View style={s.banner}>
    <Text style={[s.message, s.strip]}>{t("Showing the tasks that have been waiting")}</Text>
    <IconButton icon="list-outline" label={t("Show all tasks again")} onPress={onShowAll} style={s.showAll} />
  </View>;
}

const makeStyles = (t: Theme) => {
  const c = t.colors;
  return StyleSheet.create({
    banner: { flexDirection: "row", alignItems: "center", gap: t.space.xs, marginTop: t.space.xl, paddingLeft: t.space.lg, paddingVertical: t.space.sm, backgroundColor: c.primaryTint, borderRadius: t.radius.lg, borderWidth: 1, borderColor: c.primaryBorder },
    body: { flex: 1, paddingVertical: t.space.xs },
    message: { ...t.type.label, color: c.foreground },
    strip: { flex: 1, paddingVertical: t.space.xs },
    button: { alignSelf: "flex-start", marginTop: t.space.sm },
    showAll: { alignSelf: "center", marginRight: t.space.sm },
    close: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: "center", justifyContent: "center", alignSelf: "flex-start" },
  });
};
