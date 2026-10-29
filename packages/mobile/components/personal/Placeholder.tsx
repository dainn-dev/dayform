import React, { useMemo } from "react";
import { StyleSheet, Text } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";

/** Temporary body of a section whose controls are built later. Remove its use when the section is filled in. */
export function Placeholder() {
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return <Text style={s.text}>{t("More options are coming soon.")}</Text>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  text: { color: c.emptyText, fontSize: 12, lineHeight: 18 },
});
