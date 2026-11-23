import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { STYLES } from "../../constants/styles";
import { useFontsReady } from "../../hooks/use-app-fonts";
import { useTheme, useThemedStyles, type Theme } from "../../hooks/use-theme";
import { buildTheme } from "../../lib/design-theme";
import { useLanguage } from "../../lib/language";
import { STYLE_IDS } from "../../lib/settings";
import { useSettings } from "../../lib/settings-context";
import { fillPlaceholders } from "../../lib/text-template";
import { useResolvedScheme } from "../../lib/theme-context";

/** Height of the drawn preview inside each card. */
const PREVIEW_HEIGHT = 88;
const CHECK_SIZE = 18;
/** Widths of the two "text lines" of the mini card, as a share of its width. */
const LINE_LONG = "78%";
const LINE_SHORT = "52%";
const LINE_HEIGHT = 5;
const SWATCH_WIDTH = 34;
const SWATCH_HEIGHT = 12;

/**
 * The four looks of the app (settings.style) as cards, two per row. Each card draws a small live preview in that look's
 * own tokens for the current Light/Dark scheme (background, a card with its depth, "Aa" in its headline face beside a
 * primary button swatch, two text lines), so the choice is visible before tapping. The label and description are the current style's text.
 */
export function StylePicker() {
  const { settings, update } = useSettings();
  const { t } = useLanguage();
  const s = useThemedStyles(makeStyles);
  const scheme = useResolvedScheme();
  const fontsReady = useFontsReady();
  const previews = useMemo(
    () => STYLE_IDS.map(id => ({ id, theme: buildTheme(id, scheme, settings.accent, fontsReady) })),
    [scheme, settings.accent, fontsReady],
  );
  return <View>
    <Text style={s.caption}>{t("Style")}</Text>
    <View style={s.grid}>
      {previews.map(({ id, theme }) => <StyleCard key={id} preview={theme} selected={settings.style === id}
        onPress={() => { void update({ style: id }); }}
        label={t(STYLES[id].label)} description={t(STYLES[id].description)}
        a11y={fillPlaceholders(t("Use the {name} style"), { name: t(STYLES[id].label) })} />)}
    </View>
  </View>;
}

type CardProps = { preview: Theme; selected: boolean; label: string; description: string; a11y: string; onPress: () => void };

function StyleCard({ preview: p, selected, label, description, a11y, onPress }: CardProps) {
  const s = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const pc = p.colors;
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y} accessibilityState={{ selected }}
    style={[s.card, selected && s.cardOn]}>
    {/* Drawn in the previewed style's own tokens; decorative, the card's label says what it is. */}
    <View accessible={false} importantForAccessibility="no-hide-descendants"
      style={[s.preview, { backgroundColor: pc.background, borderRadius: p.radius.md }]}>
      <View style={[s.mini, { backgroundColor: pc.card, borderRadius: p.radius.sm }, p.elevation.card]}>
        <View style={s.miniTop}>
          <Text numberOfLines={1} style={[p.type.headline, { color: pc.foreground }]}>
            Aa{p.titlePunctuation ? <Text style={{ color: pc.titleDot }}>.</Text> : null}
          </Text>
          <View style={[s.swatch, { backgroundColor: pc.primary, borderRadius: p.buttonRadius }]} />
        </View>
        <View style={[s.line, { width: LINE_LONG, backgroundColor: pc.track, borderRadius: p.radius.xs }]} />
        <View style={[s.line, { width: LINE_SHORT, backgroundColor: pc.track, borderRadius: p.radius.xs }]} />
      </View>
    </View>
    <View style={s.nameRow}>
      <Text numberOfLines={1} style={s.label}>{label}</Text>
      {selected && <Ionicons name="checkmark-circle" size={CHECK_SIZE} color={colors.primary} />}
    </View>
    <Text style={s.description}>{description}</Text>
  </Pressable>;
}

const makeStyles = (t: Theme) => {
  const c = t.colors;
  return StyleSheet.create({
    caption: { ...t.type.meta, color: c.mutedForeground, marginBottom: t.space.sm },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: t.space.sm, marginBottom: t.space.lg },
    // Two per row: each card takes a little under half, and grows to fill the row.
    card: {
      flexGrow: 1, flexBasis: "40%", minWidth: 132, padding: t.space.sm, gap: t.space.xs + 2,
      borderRadius: t.radius.lg, borderWidth: 2, borderColor: c.hairline, backgroundColor: c.card,
    },
    cardOn: { borderColor: c.primary },
    preview: { height: PREVIEW_HEIGHT, padding: t.space.sm + 2, justifyContent: "center", overflow: "hidden" },
    mini: { paddingHorizontal: t.space.sm, paddingVertical: t.space.xs + 2, gap: t.space.xs },
    miniTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: t.space.xs },
    line: { height: LINE_HEIGHT },
    swatch: { width: SWATCH_WIDTH, height: SWATCH_HEIGHT },
    nameRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: t.space.xs, paddingHorizontal: t.space.xxs },
    label: { ...t.type.label, color: c.foreground, flexShrink: 1 },
    description: { ...t.type.caption, ...t.font.regular, color: c.mutedForeground, paddingHorizontal: t.space.xxs },
  });
};
