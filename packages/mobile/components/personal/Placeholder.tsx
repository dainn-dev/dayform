import React from "react";
import { StyleSheet, Text } from "react-native";
import { useThemedStyles, type Theme } from "../../hooks/use-theme";
import { useLanguage } from "../../lib/language";

/** Temporary body of a section whose controls are built later. Remove its use when the section is filled in. */
export function Placeholder() {
  const { t } = useLanguage();
  const s = useThemedStyles(makeStyles);
  return <Text style={s.text}>{t("More options are coming soon.")}</Text>;
}

const makeStyles = (t: Theme) => StyleSheet.create({
  text: { ...t.type.meta, ...t.font.regular, color: t.colors.emptyText },
});
