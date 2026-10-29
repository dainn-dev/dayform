import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLanguage } from "../lib/language";
import { useColors } from "../hooks/use-colors";
import type { ThemeColors } from "../constants/theme";

export function LanguageSwitch() {
  const { language, setLanguage, languageError } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return <View>
    <View style={s.root}>{(["en", "vi"] as const).map(value => <Pressable key={value}
      accessibilityRole="button" accessibilityLabel={value === "en" ? "Switch to English" : "Chuyển sang tiếng Việt"}
      accessibilityState={{ selected: language === value }} onPress={() => setLanguage(value)}
      style={[s.button, language === value && s.active]}><Text style={[s.text, language === value && s.activeText]}>{value.toUpperCase()}</Text></Pressable>)}</View>
    {languageError && <Text accessibilityRole="alert" style={s.error}>{languageError}</Text>}
  </View>;
}
const makeStyles = (c: ThemeColors) => StyleSheet.create({
  root: { flexDirection: "row", backgroundColor: c.segmentBg, borderRadius: 12, padding: 3 },
  button: { paddingHorizontal: 12, minHeight: 38, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  active: { backgroundColor: c.primary }, text: { color: c.segmentText, fontWeight: "800", fontSize: 11 }, activeText: { color: c.onPrimary },
  error: { color: c.errorMessage, fontSize: 10, maxWidth: 140, marginTop: 4 },
});