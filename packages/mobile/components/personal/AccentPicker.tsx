import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ACCENT_IDS, ACCENT_LABELS, ACCENT_SETS } from "../../constants/accents";
import { useTheme, useThemedStyles, type Theme } from "../../hooks/use-theme";
import { useLanguage } from "../../lib/language";
import { useSettings } from "../../lib/settings-context";
import { useResolvedScheme } from "../../lib/theme-context";
import { fillPlaceholders } from "../../lib/text-template";

const TOUCH_TARGET = 44;
const SWATCH = 32;

/** Six round accent swatches. Each shows its own primary for the current scheme, so the choice is visible before tapping. */
export function AccentPicker() {
  const { settings, update } = useSettings();
  const { t } = useLanguage();
  const { colors } = useTheme();
  const scheme = useResolvedScheme();
  const s = useThemedStyles(makeStyles);
  return <View>
    <Text style={s.caption}>{t("Accent color")}</Text>
    <View style={s.row}>{ACCENT_IDS.map(id => {
      const selected = settings.accent === id;
      const swatch = ACCENT_SETS[id][scheme];
      return <Pressable key={id} onPress={() => { void update({ accent: id }); }} accessibilityRole="button"
        accessibilityLabel={fillPlaceholders(t("Use the {name} accent"), { name: t(ACCENT_LABELS[id]) })}
        accessibilityState={{ selected }} style={s.target}>
        <View style={[s.swatch, { backgroundColor: swatch.primary }, selected && { borderColor: colors.foreground }]}>
          {selected && <Ionicons name="checkmark" size={18} color={swatch.onPrimary} />}
        </View>
      </Pressable>;
    })}</View>
  </View>;
}

const makeStyles = (t: Theme) => StyleSheet.create({
  caption: { ...t.type.meta, color: t.colors.mutedForeground, marginTop: t.space.md, marginBottom: t.space.xs },
  row: { flexDirection: "row", flexWrap: "wrap", gap: t.space.xs },
  target: { width: TOUCH_TARGET, height: TOUCH_TARGET, alignItems: "center", justifyContent: "center" },
  swatch: { width: SWATCH, height: SWATCH, borderRadius: SWATCH / 2, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "transparent" },
});
