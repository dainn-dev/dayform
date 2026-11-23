import React, { useEffect, useState } from "react";
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { STYLES } from "../constants/styles";
import type { ColorScheme } from "../constants/palettes";
import { useFontsReady } from "../hooks/use-app-fonts";
import { useTheme } from "../hooks/use-theme";
import { buildTheme, type Theme } from "../lib/design-theme";
import { STYLE_IDS, type StyleId } from "../lib/settings";
import { useSettings } from "../lib/settings-context";
import { useResolvedScheme } from "../lib/theme-context";
import { AppText } from "../components/ui/AppText";
import { Button } from "../components/ui/Button";
import { Chip } from "../components/ui/Chip";
import { Divider } from "../components/ui/Divider";
import { Surface } from "../components/ui/Surface";
import { Title } from "../components/ui/Title";
import {
  Buttons, Chips, Elevations, InputSample, Radii, Section, Swatches, TaskCardSample, TimelineBlockSample, TypeScale,
} from "../components/dev/GallerySamples";

/**
 * Hidden developer screen (long-press the version line in About): previews every style and light/dark locally, without
 * changing the user's settings, as a manual check since the app has no UI tests. Strings stay English on purpose.
 * The root layout is a Slot, so Back goes to the About page explicitly (see hooks/use-back-to-personal.ts).
 */
function leave(): void {
  router.replace("/settings/about");
}

const SCHEMES: ColorScheme[] = ["light", "dark"];

function Segments<T extends string>({ t, options, value, onChange, label }: {
  t: Theme; options: readonly T[]; value: T; onChange: (next: T) => void; label: (option: T) => string;
}) {
  const c = t.colors;
  return <View style={{ flexDirection: "row", backgroundColor: c.segmentBg, borderRadius: t.radius.md, padding: 3, gap: 3 }}>
    {options.map(option => {
      const on = option === value;
      return <Pressable key={option} onPress={() => onChange(option)} accessibilityRole="button" accessibilityState={{ selected: on }}
        style={[{ flex: 1, minHeight: 36, alignItems: "center", justifyContent: "center", borderRadius: t.radius.sm,
          backgroundColor: on ? c.card : "transparent" }, on ? t.elevation.card : null]}>
        <Text numberOfLines={1} style={{ ...t.type.label, color: on ? c.foreground : c.segmentText }}>{label(option)}</Text>
      </Pressable>;
    })}
  </View>;
}

export default function DesignGalleryScreen() {
  const { settings } = useSettings();
  const currentScheme = useResolvedScheme();
  const fontsReady = useFontsReady();
  const [style, setStyle] = useState<StyleId>(settings.style);
  const [scheme, setScheme] = useState<ColorScheme>(currentScheme);
  const t = buildTheme(style, scheme, settings.accent, fontsReady);
  const c = t.colors;

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => { leave(); return true; });
    return () => subscription.remove();
  }, []);

  return <SafeAreaView edges={["top", "left", "right", "bottom"]} style={{ flex: 1, backgroundColor: c.background }}>
    <View style={{ paddingHorizontal: t.gutter, paddingVertical: t.space.sm, gap: t.space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.hairline }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: t.space.sm }}>
        <Pressable onPress={leave} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8}
          style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: t.radius.pill, backgroundColor: c.muted }}>
          <Ionicons name="chevron-back" size={22} color={c.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text accessibilityRole="header" style={{ ...t.type.headline, color: c.foreground }}>Design gallery</Text>
          <Text numberOfLines={1} style={{ ...t.type.caption, color: c.mutedForeground }}>
            {`${STYLES[style].description} · fonts ${fontsReady ? "loaded" : "system"}`}
          </Text>
        </View>
      </View>
      <Segments t={t} options={STYLE_IDS} value={style} onChange={setStyle} label={id => STYLES[id].label} />
      <Segments t={t} options={SCHEMES} value={scheme} onChange={setScheme} label={s => (s === "light" ? "Light" : "Dark")} />
    </View>

    <ScrollView contentContainerStyle={{ padding: t.gutter, paddingBottom: t.space.xxxl * 2 }}>
      <Section t={t} title="Colours"><Swatches t={t} /></Section>
      <Section t={t} title="Type scale"><TypeScale t={t} /></Section>
      <Section t={t} title="Radii"><Radii t={t} /></Section>
      <Section t={t} title="Elevation"><Elevations t={t} /></Section>
      <Section t={t} title="Buttons"><Buttons t={t} /></Section>
      <Section t={t} title="Chips"><Chips t={t} /></Section>
      <Section t={t} title="Task card"><TaskCardSample t={t} /></Section>
      <Section t={t} title="Timeline block"><TimelineBlockSample t={t} /></Section>
      <Section t={t} title="Input"><InputSample t={t} /></Section>
      <Section t={t} title="Current app style (real kit, ignores the preview)"><CurrentKit /></Section>
    </ScrollView>
  </SafeAreaView>;
}

/** The real components/ui kit: it reads useTheme(), so it always shows the user's saved style and scheme. */
function CurrentKit() {
  const current = useTheme();
  const noop = () => {};
  return <Surface style={{ gap: 12 }}>
    <Title>Dayform</Title>
    <AppText variant="title">Họp nhóm lúc 09:00</AppText>
    <AppText tone="muted">Chào buổi sáng, Đạt — Good morning</AppText>
    <Divider />
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      <Button label="Primary" onPress={noop} />
      <Button label="Secondary" variant="secondary" onPress={noop} />
      <Button label="Ghost" variant="ghost" size="sm" onPress={noop} />
      <Button label="Danger" variant="danger" size="sm" onPress={noop} />
    </View>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      <Chip label="Selected" selected onPress={noop} />
      <Chip label="Unselected" onPress={noop} />
      <Chip label="Work" dot={current.colors.category.Work.accent} />
    </View>
  </Surface>;
}
