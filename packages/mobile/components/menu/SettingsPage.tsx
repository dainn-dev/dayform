import React, { useCallback, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useBackToPersonal } from "../../hooks/use-back-to-personal";
import { useColors } from "../../hooks/use-colors";
import { useKeyboardInset } from "../../hooks/use-keyboard-inset";
import { useRevealFocusedInput } from "../../hooks/use-reveal-focused-input";
import { RevealOnFocusProvider } from "../editor/reveal-context";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";
import { useSettings } from "../../lib/settings-context";
import type { MenuRow } from "../../lib/settings-menu";
import { SETTINGS_PAGES } from "../personal/sections";
import { FLOATING_ACTION_CLEARANCE, FloatingActionProvider, FloatingAddButton, type FloatingAction } from "./floating-action";
import { PageHeader } from "./PageHeader";
import { PartCard } from "./PartCard";

const CONTENT_PADDING_BOTTOM = 40;
const SCROLL_EVENT_THROTTLE_MS = 16;
/** Wait for the keyboard to settle after a field gains focus before measuring it. */
const REVEAL_ON_FOCUS_DELAY_MS = 60;

/** One settings page: header with back button, then the section body in a card. Rendered by app/settings/[section].tsx. */
export function SettingsPage({ row }: { row: MenuRow }) {
  const { t } = useLanguage();
  const colors = useColors();
  const { saveError } = useSettings();
  const keyboard = useKeyboardInset();
  // Pages are edge-to-edge, so Android does not resize them for the keyboard: pad the content and scroll the focused
  // field above the keyboard, as the task editor does (fields call the reveal on focus through RevealOnFocusProvider).
  const scrollRef = useRef<ScrollView>(null);
  const viewportRef = useRef<View>(null);
  const { reveal, onScroll } = useRevealFocusedInput(scrollRef, viewportRef, keyboard);
  const revealOnFocus = useCallback(() => { setTimeout(reveal, REVEAL_ON_FOCUS_DELAY_MS); }, [reveal]);
  useBackToPersonal();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [floating, setFloating] = useState<FloatingAction | null>(null);
  const { parts, hasTextInput } = SETTINGS_PAGES[row.slug];
  // Pages with a text field keep the field reachable above the keyboard; a floating button gets room under the last row.
  const bottom = CONTENT_PADDING_BOTTOM + (hasTextInput ? keyboard.height : 0) + (floating ? FLOATING_ACTION_CLEARANCE : 0);

  return <SafeAreaView edges={["top", "left", "right", "bottom"]} style={s.root}>
    <FloatingActionProvider register={setFloating}>
      <RevealOnFocusProvider value={revealOnFocus}>
      <View ref={viewportRef} style={s.root} collapsable={false}>
      <ScrollView ref={scrollRef} contentContainerStyle={[s.content, { paddingBottom: bottom }]} showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" onScroll={onScroll} scrollEventThrottle={SCROLL_EVENT_THROTTLE_MS}
        onContentSizeChange={reveal}>
        <PageHeader title={t(row.title)} />
        {saveError && <View accessibilityRole="alert" style={s.error}>
          <Text style={{ color: colors.errorMessage }}>{t("Could not save your settings. They will reset when you reopen the app.")}</Text>
        </View>}
        {parts.map(part => <PartCard key={part.title ?? row.slug} title={part.title === undefined ? undefined : t(part.title)}>
          <part.Component />
        </PartCard>)}
      </ScrollView>
      </View>
      </RevealOnFocusProvider>
    </FloatingActionProvider>
    {floating && <FloatingAddButton action={floating} />}
  </SafeAreaView>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  content: { width: "100%", maxWidth: 680, alignSelf: "center", paddingHorizontal: 22, paddingTop: 20 },
  error: { padding: 13, backgroundColor: c.errorBg, borderRadius: 12, marginBottom: 12 },
});
