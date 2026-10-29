import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ACCENT_IDS, ACCENT_LABELS, ACCENT_SETS } from "../../constants/accents";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
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
  const colors = useColors();
  const scheme = useResolvedScheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
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

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  caption: { color: c.mutedForeground, fontSize: 12, fontWeight: "700", marginTop: 16, marginBottom: 4 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  target: { width: TOUCH_TARGET, height: TOUCH_TARGET, alignItems: "center", justifyContent: "center" },
  swatch: { width: SWATCH, height: SWATCH, borderRadius: SWATCH / 2, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "transparent" },
});
