import React, { useEffect, useMemo, useRef } from "react";
import { StyleSheet, TextInput } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
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
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
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

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  input: { minHeight: 52, backgroundColor: c.background, borderRadius: 15, paddingHorizontal: 16, paddingVertical: 14, color: c.foreground, fontSize: 16, borderWidth: 1, borderColor: c.inputBorder },
});
