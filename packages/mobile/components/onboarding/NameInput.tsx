import React, { useEffect, useRef } from "react";
import { StyleSheet, TextInput } from "react-native";
import { useTheme, useThemedStyles, type Theme } from "../../hooks/use-theme";
import { useLanguage } from "../../lib/language";
import { MAX_NAME_LENGTH } from "../../lib/settings";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** Focuses the field (opening the keyboard) this many ms after mount; a short delay lets a Modal finish appearing. */
  focusAfterMs?: number;
};

/** The name field shared by the first-launch dialog and the profile editor. The text is never logged or sent. */
export function NameInput({ value, onChange, onSubmit, focusAfterMs }: Props) {
  const { t } = useLanguage();
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (focusAfterMs === undefined) return;
    const timer = setTimeout(() => inputRef.current?.focus(), focusAfterMs);
    return () => clearTimeout(timer);
  }, [focusAfterMs]);

  return <TextInput
    ref={inputRef} value={value} onChangeText={onChange} onSubmitEditing={onSubmit}
    placeholder={t("Your name")} placeholderTextColor={colors.placeholder} style={s.input}
    maxLength={MAX_NAME_LENGTH} autoCapitalize="words" autoCorrect={false} returnKeyType="done"
    accessibilityLabel={t("Your name")}
  />;
}

const makeStyles = (t: Theme) => StyleSheet.create({
  input: { ...t.type.body, minHeight: 52, backgroundColor: t.colors.background, borderRadius: t.radius.lg, paddingHorizontal: t.space.lg, paddingVertical: 14, color: t.colors.foreground, borderWidth: 1, borderColor: t.colors.inputBorder },
});
