import React, { useMemo } from "react";
import { StyleSheet, Text } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";

type Props = { validation: string; error: string | null };

/** Validation message from the form and the store error, both translated (a store error equal to the validation text is shown once). */
export function FormMessages({ validation, error }: Props) {
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return <>
    {validation ? <Text accessibilityRole="alert" style={s.error}>{t(validation)}</Text> : null}
    {error && error !== validation ? <Text accessibilityRole="alert" style={s.error}>{t(error)}</Text> : null}
  </>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  error: { color: c.errorLabel, fontSize: 13, marginTop: 15, fontWeight: "600" },
});
