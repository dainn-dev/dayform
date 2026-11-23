import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useThemedStyles, type Theme } from "../../hooks/use-theme";
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
  const s = useThemedStyles(makeStyles);
  return <View>
    <ChoiceChips choices={CHOICES} value={language} onChange={setLanguage} />
    {languageError && <Text accessibilityRole="alert" style={s.error}>{languageError}</Text>}
  </View>;
}

const makeStyles = (t: Theme) => StyleSheet.create({
  error: { ...t.type.meta, ...t.font.regular, color: t.colors.errorMessage, marginTop: t.space.sm },
});
