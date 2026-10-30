import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import { useLanguage } from "../../lib/language";
import { useThemePreference } from "../../lib/theme-context";
import { THEME_PREFERENCES, type ThemePreference } from "../../lib/theme-preference";
import type { ThemeColors } from "../../constants/theme";

const LABELS: Record<ThemePreference, string> = { system: "System", light: "Light", dark: "Dark" };
const A11Y_LABELS: Record<ThemePreference, string> = {
  system: "Use the system appearance",
  light: "Use the light appearance",
  dark: "Use the dark appearance",
};

/** 36 px segment + 3 px root padding + 4 px slop above and below = the 44 px minimum touch target. */
const SEGMENT_HIT_SLOP = { top: 4, bottom: 4, left: 0, right: 0 } as const;

/** System / Light / Dark segmented control. */
export function ThemeSwitch() {
  const { preference, setPreference, saveError } = useThemePreference();
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return <View>
    <View style={s.root}>{THEME_PREFERENCES.map(value => <Pressable key={value}
      accessibilityRole="button" accessibilityLabel={t(A11Y_LABELS[value])}
      accessibilityState={{ selected: preference === value }} onPress={() => setPreference(value)}
      hitSlop={SEGMENT_HIT_SLOP} style={[s.button, preference === value && s.active]}>
      <Text style={[s.text, preference === value && s.activeText]}>{t(LABELS[value])}</Text>
    </Pressable>)}</View>
    {saveError && <Text accessibilityRole="alert" style={s.error}>{t(saveError)}</Text>}
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  root: { flexDirection: "row", backgroundColor: c.segmentBg, borderRadius: 12, padding: 3 },
  button: { flex: 1, paddingHorizontal: 12, minHeight: 36, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  active: { backgroundColor: c.primary }, text: { color: c.segmentText, fontWeight: "800", fontSize: 12 }, activeText: { color: c.onPrimary },
  error: { color: c.errorMessage, fontSize: 11, marginTop: 4 },
});
