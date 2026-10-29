import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLanguage } from "../../lib/language";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";

const DEBOUNCE_MS = 200;
const MIN_TOUCH_TARGET = 44;

type Props = { value: string; onChange: (query: string) => void };

/** Search field with a clear button. Typing is debounced; submit and clear apply immediately. */
export function SearchBar({ value, onChange }: Props) {
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [text, setText] = useState(value);

  useEffect(() => {
    if (text === value) return undefined;
    const timer = setTimeout(() => onChange(text), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, value, onChange]);

  const clear = useCallback(() => { setText(""); onChange(""); }, [onChange]);
  const submit = useCallback(() => onChange(text), [onChange, text]);

  return <View style={s.box}>
    <Ionicons name="search" size={18} color={colors.mutedForeground} />
    <TextInput
      value={text} onChangeText={setText} onSubmitEditing={submit}
      placeholder={t("Search tasks")} placeholderTextColor={colors.placeholder}
      accessibilityLabel={t("Search tasks")} returnKeyType="search"
      autoCapitalize="none" autoCorrect={false} style={s.input}
    />
    {text.length > 0 && <Pressable onPress={clear} accessibilityRole="button" accessibilityLabel={t("Clear search")} hitSlop={4} style={s.clear}>
      <Ionicons name="close-circle" size={20} color={colors.mutedForeground} />
    </Pressable>}
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  box: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: c.card, borderRadius: 15, paddingLeft: 15, minHeight: 48, marginTop: 27 },
  input: { flex: 1, color: c.foreground, fontSize: 14, minHeight: MIN_TOUCH_TARGET, paddingVertical: 0 },
  clear: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: "center", justifyContent: "center" },
});
