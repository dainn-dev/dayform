import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import type { SloganStyle } from "../../lib/greeting";
import { useLanguage } from "../../lib/language";
import { MAX_SLOGAN_LENGTH, normalizeSlogan } from "../../lib/settings";
import { useSettings } from "../../lib/settings-context";
import { ChoiceChips, type Choice } from "../editor/ChoiceChips";
import { GreetingLines } from "../timeline/DayHeader";
import { SwitchRow } from "./SwitchRow";

const STYLE_CHOICES: readonly Choice<SloganStyle>[] = [
  { value: "rotate", label: "Rotating" },
  { value: "custom", label: "My own" },
  { value: "off", label: "None" },
];
const DISABLED_OPACITY = 0.5;

/** "Greeting": show name, slogan style and custom slogan (settings.greeting), with a live preview of the header. */
export function GreetingSection() {
  const { settings, hasName, update } = useSettings();
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { showName, sloganStyle, customSlogan } = settings.greeting;
  const [draft, setDraft] = useState(customSlogan);
  useEffect(() => { setDraft(customSlogan); }, [customSlogan]);

  const commitDraft = () => {
    const clean = normalizeSlogan(draft);
    setDraft(clean);
    if (clean !== customSlogan) void update({ greeting: { customSlogan: clean } });
  };

  return <View>
    <View style={!hasName && s.disabled} pointerEvents={hasName ? "auto" : "none"}>
      <SwitchRow label={t("Show my name in the greeting")} value={showName && hasName}
        onChange={next => { void update({ greeting: { showName: next } }); }}
        hint={hasName ? undefined : t("Add your name above to use this.")} />
    </View>
    <Text style={s.caption}>{t("Slogan")}</Text>
    <ChoiceChips choices={STYLE_CHOICES.map(c => ({ ...c, label: t(c.label) }))} value={sloganStyle}
      onChange={next => { void update({ greeting: { sloganStyle: next } }); }} />
    {sloganStyle === "custom" && <View>
      <TextInput value={draft} onChangeText={setDraft} onBlur={commitDraft} onSubmitEditing={commitDraft}
        maxLength={MAX_SLOGAN_LENGTH} returnKeyType="done" autoCorrect={false}
        accessibilityLabel={t("Your own slogan")} placeholder={t("Your own slogan")} placeholderTextColor={colors.placeholder}
        style={s.input} />
      <Text style={s.helper}>{t("Shown under the greeting.")}</Text>
    </View>}
    <Text style={s.caption}>{t("Preview")}</Text>
    <View style={s.preview}><GreetingLines now={new Date()} /></View>
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  disabled: { opacity: DISABLED_OPACITY },
  caption: { color: c.mutedForeground, fontSize: 12, fontWeight: "700", marginTop: 12, marginBottom: 6 },
  input: { minHeight: 44, marginTop: 8, backgroundColor: c.background, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, color: c.foreground, fontSize: 14, borderWidth: 1, borderColor: c.inputBorder },
  helper: { color: c.mutedForeground, fontSize: 11, lineHeight: 16, marginTop: 4 },
  preview: { backgroundColor: c.primarySoft, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 12 },
});
