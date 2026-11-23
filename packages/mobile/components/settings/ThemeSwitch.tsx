import { Pressable, StyleSheet, Text, View } from "react-native";
import { useThemedStyles, type Theme } from "../../hooks/use-theme";
import { useLanguage } from "../../lib/language";
import { useThemePreference } from "../../lib/theme-context";
import { THEME_PREFERENCES, type ThemePreference } from "../../lib/theme-preference";

const LABELS: Record<ThemePreference, string> = { system: "System", light: "Light", dark: "Dark" };
const A11Y_LABELS: Record<ThemePreference, string> = {
  system: "Use the system appearance",
  light: "Use the light appearance",
  dark: "Use the dark appearance",
};

/** 36 px segment + 3 px root padding + 4 px slop above and below = the 44 px minimum touch target. */
const SEGMENT_HIT_SLOP = { top: 4, bottom: 4, left: 0, right: 0 } as const;
const SEGMENT_HEIGHT = 36;
const ROOT_PADDING = 3;

/** System / Light / Dark segmented control. */
export function ThemeSwitch() {
  const { preference, setPreference, saveError } = useThemePreference();
  const { t } = useLanguage();
  const s = useThemedStyles(makeStyles);
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

const makeStyles = (t: Theme) => {
  const c = t.colors;
  return StyleSheet.create({
    root: { flexDirection: "row", backgroundColor: c.segmentBg, borderRadius: t.radius.md, padding: ROOT_PADDING },
    button: { flex: 1, paddingHorizontal: t.space.md, minHeight: SEGMENT_HEIGHT, alignItems: "center", justifyContent: "center", borderRadius: t.radius.sm },
    active: { backgroundColor: c.primary },
    text: { ...t.type.meta, ...t.font.bold, color: c.segmentText },
    activeText: { color: c.onPrimary },
    error: { ...t.type.caption, ...t.font.regular, color: c.errorMessage, marginTop: t.space.xs },
  });
};
