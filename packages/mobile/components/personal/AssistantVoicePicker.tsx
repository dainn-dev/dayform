import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, useThemedStyles, type Theme } from "../../hooks/use-theme";
import { voiceNeedsNetwork, type SpeechLanguage, type VoiceInfo } from "../../lib/assistant-speech";
import { listVoices, speakLine, stopSpeaking } from "../../lib/assistant-speech-expo";
import { useLanguage } from "../../lib/language";
import { useSettings } from "../../lib/settings-context";

const SAMPLE = "Hi, I'm Leo! Shall we plan your day?";

/**
 * Which of the phone's voices Leo uses for the app's language (settings.assistant.voiceId, "" = automatic); every row
 * has its own play button, so a voice can be heard without choosing it first. When the phone has no voice for the language it says how to get one.
 */
export function AssistantVoicePicker() {
  const { settings, update } = useSettings();
  const { t, language } = useLanguage();
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
  const speechLanguage: SpeechLanguage = language === "vi" ? "vi" : "en";
  const [voices, setVoices] = useState<VoiceInfo[] | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const chosen = settings.assistant.voiceId;

  useEffect(() => {
    let alive = true;
    setVoices(null);
    void listVoices(speechLanguage).then(found => { if (alive) setVoices(found); });
    return () => { alive = false; stopSpeaking(); };
  }, [speechLanguage]);

  const choose = (id: string) => { void update({ assistant: { voiceId: id } }); };
  const listen = (id: string) => {
    // A second tap on the voice that is playing stops it.
    if (playing === id) {
      stopSpeaking();
      setPlaying(null);
      return;
    }
    setPlaying(id);
    void speakLine(t(SAMPLE), speechLanguage, { onStart: () => {}, onDone: () => setPlaying(current => (current === id ? null : current)) }, id)
      .then(started => { if (!started) setPlaying(null); });
  };

  if (voices === null) return <Text style={s.hint}>{t("Looking for voices…")}</Text>;
  if (voices.length === 0) {
    return <Text style={s.warning}>{t("This phone has no voice for the app's language, so Leo only shows its lines. Install Speech Services by Google from the Play Store, download the Vietnamese voice in it, then choose it as the preferred engine in the phone's text-to-speech settings.")}</Text>;
  }

  const options: { id: string; label: string; note: string | null }[] = [
    { id: "", label: t("Automatic"), note: null },
    ...voices.map(voice => {
      const network = voiceNeedsNetwork(voice);
      return { id: voice.identifier, label: voice.name || voice.identifier, note: network === null ? null : t(network ? "needs internet" : "on this phone") };
    }),
  ];
  const selected = options.some(option => option.id === chosen) ? chosen : "";

  return <View style={s.stack}>
    <Text style={s.label}>{t("Voice")}</Text>
    <View style={s.list} accessibilityRole="radiogroup">
      {options.map(option => {
        const on = option.id === selected;
        const sounding = playing === option.id;
        return <View key={option.id || "auto"} style={[s.option, on && s.optionOn]}>
          <Pressable onPress={() => choose(option.id)} accessibilityRole="radio" accessibilityState={{ checked: on }} style={s.optionBody}>
            <Text style={[s.optionText, on && s.optionTextOn]} numberOfLines={1}>{option.label}</Text>
            {option.note ? <Text style={[s.note, on && s.optionTextOn]}>{option.note}</Text> : null}
          </Pressable>
          <Pressable onPress={() => listen(option.id)} accessibilityRole="button" hitSlop={4}
            accessibilityLabel={`${t(sounding ? "Stop" : "Listen")}: ${option.label}`} style={s.play}>
            <Ionicons name={sounding ? "stop" : "play"} size={18} color={on ? colors.onPrimary : colors.primary} />
          </Pressable>
        </View>;
      })}
    </View>
    <Text style={s.hint}>{t("If a voice sounds wrong, the phone's own speech engine may not speak this language well. Speech Services by Google, chosen as the preferred engine in the phone's text-to-speech settings, usually sounds best.")}</Text>
  </View>;
}

const makeStyles = (t: Theme) => {
  const c = t.colors;
  return StyleSheet.create({
    stack: { gap: t.space.sm, marginTop: t.space.xs },
    label: { ...t.type.label, color: c.foreground },
    list: { gap: t.space.xs + 2 },
    option: {
      minHeight: 48, paddingLeft: t.space.md, borderRadius: t.radius.md, flexDirection: "row", alignItems: "center",
      backgroundColor: c.card, borderWidth: 1, borderColor: c.inputBorder,
    },
    optionBody: { flex: 1, minHeight: 46, paddingVertical: t.space.xs + 2, justifyContent: "center" },
    play: { width: 48, height: 46, alignItems: "center", justifyContent: "center" },
    optionOn: { backgroundColor: c.primary, borderColor: c.primary },
    optionText: { ...t.type.label, color: c.foreground },
    optionTextOn: { color: c.onPrimary },
    note: { ...t.type.caption, ...t.font.regular, color: c.mutedForeground, marginTop: 1 },
    hint: { ...t.type.caption, ...t.font.regular, color: c.mutedForeground },
    warning: { ...t.type.meta, ...t.font.regular, color: c.foreground },
  });
};
