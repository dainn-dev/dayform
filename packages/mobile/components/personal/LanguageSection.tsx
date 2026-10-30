import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { type Language, useLanguage } from "../../lib/language";
import { ChoiceChips, type Choice } from "../editor/ChoiceChips";

/** A language is always named in itself, so a user who cannot read the current one can still find theirs. */
const CHOICES: readonly Choice<Language>[] = [
  { value: "en", label: "English" },
  { value: "vi", label: "Tiếng Việt" },
];

/** The interface language (it used to be an EN / VI switch in the header of the Timeline and Tasks tabs). */
export function LanguageSection() {
  const { language, setLanguage, languageError } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return <View>
    <ChoiceChips choices={CHOICES} value={language} onChange={setLanguage} />
    {languageError && <Text accessibilityRole="alert" style={s.error}>{languageError}</Text>}
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  error: { color: c.errorMessage, fontSize: 12, marginTop: 8 },
});
