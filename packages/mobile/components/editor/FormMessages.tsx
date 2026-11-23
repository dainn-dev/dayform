import React from "react";
import { StyleSheet, Text } from "react-native";
import { useThemedStyles, type Theme } from "../../hooks/use-theme";
import { useLanguage } from "../../lib/language";

type Props = { validation: string; error: string | null };

/** Validation message from the form and the store error, both translated (a store error equal to the validation text is shown once). */
export function FormMessages({ validation, error }: Props) {
  const { t } = useLanguage();
  const s = useThemedStyles(makeStyles);
  return <>
    {validation ? <Text accessibilityRole="alert" style={s.error}>{t(validation)}</Text> : null}
    {error && error !== validation ? <Text accessibilityRole="alert" style={s.error}>{t(error)}</Text> : null}
  </>;
}

const makeStyles = ({ colors: c, type, font }: Theme) => StyleSheet.create({
  error: { ...type.label, ...font.semibold, color: c.errorLabel, marginTop: 15 },
});
