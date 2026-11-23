import React, { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useTheme, useThemedStyles, type Theme } from "../../hooks/use-theme";
import { checkBaseUrl, maskKey } from "../../lib/ai-config";
import { testConnection } from "../../lib/ai-client";
import { deleteApiKey, deleteSonioxKey, readApiKey, readSonioxKey, saveApiKey, saveSonioxKey } from "../../lib/ai-key-expo";
import { testSoniox } from "../../lib/soniox-client";
import { speechLocale } from "../../lib/assistant-speech";
import { askMic, downloadOfflinePack } from "../../lib/voice-expo";
import { useLanguage } from "../../lib/language";
import { useSettings } from "../../lib/settings-context";
import { AssistantVoicePicker } from "./AssistantVoicePicker";
import { SwitchRow } from "./SwitchRow";
import { useRevealOnFocus } from "../editor/reveal-context";
import { Button } from "../ui/Button";
import { Collapsible } from "../ui/Collapsible";

const LOOKS = [
  { id: "leo", label: "Leo", source: require("../../assets/assistant/leo.png") },
  { id: "ice-bear", label: "Ice Bear", source: require("../../assets/assistant/ice-bear.png") },
  { id: "maid", label: "Maid", source: require("../../assets/assistant/maid.webp") },
  { id: "silver", label: "Silver", source: require("../../assets/assistant/silver.webp") },
] as const;

const URL_PROBLEMS = {
  empty: "Enter the provider's base URL.",
  invalid: "That is not a web address.",
  insecure: "Use https (plain http only for a server on your own network).",
} as const;

/**
 * "Assistant": the assistant in the corner (on/off, its name, its voice) and the AI chat, an OpenAI-compatible provider
 * the user brings: base URL and model in the settings, the API key only in the phone's secure storage.
 */
export function AssistantSection() {
  const { settings, update } = useSettings();
  const { t, language } = useLanguage();
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
  const revealOnFocus = useRevealOnFocus();
  const { assistant, ai } = settings;

  const [name, setName] = useState(assistant.name);
  const [baseUrl, setBaseUrl] = useState(ai.baseUrl);
  const [model, setModel] = useState(ai.model);
  const [sonioxKey, setSonioxKey] = useState<string | null>(null);
  const [sonioxDraft, setSonioxDraft] = useState("");
  const [sonioxNote, setSonioxNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [keyDraft, setKeyDraft] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [micNote, setMicNote] = useState<string | null>(null);
  const [packNote, setPackNote] = useState<string | null>(null);
  const locale = speechLocale(language === "vi" ? "vi" : "en");

  const setWakeWord = async (next: boolean) => {
    setMicNote(null);
    if (next && !(await askMic())) {
      setMicNote(t("Allow the microphone to call the assistant by voice."));
      return;
    }
    void update({ assistant: { wakeWord: next } });
  };
  const getPack = async () => {
    const result = await downloadOfflinePack(locale);
    setPackNote(t({ done: "The offline pack is installed.", dialog: "Follow the phone's dialog to download it.", scheduled: "The download is scheduled.", settings: "In these settings, tap the gear next to Speech Services by Google, then the languages for speech recognition, and download Vietnamese.", failed: "This phone could not download it." }[result]));
  };

  useEffect(() => { setName(assistant.name); }, [assistant.name]);
  useEffect(() => { setBaseUrl(ai.baseUrl); }, [ai.baseUrl]);
  useEffect(() => { setModel(ai.model); }, [ai.model]);
  useEffect(() => { void readSonioxKey().then(setSonioxKey); }, []);
  useEffect(() => { void readApiKey().then(setSavedKey); }, []);

  const urlCheck = checkBaseUrl(baseUrl);
  const commitName = () => { if (name.trim() !== assistant.name) void update({ assistant: { name: name.trim() } }); };
  const commitUrl = () => { if (urlCheck.ok && urlCheck.url !== ai.baseUrl) void update({ ai: { baseUrl: urlCheck.url } }); };
  const commitModel = () => { if (model.trim() !== ai.model) void update({ ai: { model: model.trim() } }); };
  const storeSoniox = async () => {
    if (!(await saveSonioxKey(sonioxDraft))) return;
    const saved = sonioxDraft.trim();
    setSonioxKey(saved);
    setSonioxDraft("");
    const error = await testSoniox(saved);
    setSonioxNote(error ? { ok: false, text: t(error) } : { ok: true, text: t("Soniox accepted the key.") });
  };
  const removeSoniox = async () => {
    await deleteSonioxKey();
    setSonioxKey(null);
    setSonioxNote(null);
  };

  const storeKey = async () => {
    if (await saveApiKey(keyDraft)) {
      setSavedKey(keyDraft.trim());
      setKeyDraft("");
      setTestResult(null);
    }
  };
  const removeKey = async () => {
    await deleteApiKey();
    setSavedKey(null);
    setTestResult(null);
  };
  const runTest = async () => {
    if (!savedKey || !urlCheck.ok || !model.trim()) return;
    setTesting(true);
    setTestResult(null);
    const error = await testConnection({ baseUrl: urlCheck.url, model: model.trim(), apiKey: savedKey });
    setTestResult(error ? { ok: false, text: t(error) } : { ok: true, text: t("Connected. The AI answered.") });
    setTesting(false);
  };

  return <View>
    <SwitchRow label={t("Show the assistant")} value={assistant.enabled}
      onChange={next => { void update({ assistant: { enabled: next } }); }}
      hint={t("A little helper in the corner who greets you and answers questions about your day.")} />

    {assistant.enabled && <>
      <Text style={s.label}>{t("Assistant's name")}</Text>
      <TextInput onFocus={revealOnFocus} value={name} onChangeText={setName} onBlur={commitName} onSubmitEditing={commitName} maxLength={20}
        style={s.input} placeholder="Leo" placeholderTextColor={colors.mutedForeground} accessibilityLabel={t("Assistant's name")} />

      <SwitchRow label={t("Tips from the assistant")} value={assistant.tips}
        onChange={next => { void update({ assistant: { tips: next } }); }}
        hint={t("Now and then I pass on a short tip about the screen you are on or about your day. Only counts are used, never your task titles.")} />

      <Text style={s.label}>{t("Assistant look")}</Text>
      <View style={s.lookRow}>
        {LOOKS.map(look => (
          <Pressable key={look.id} onPress={() => void update({ assistant: { look: look.id } })}
            style={[s.lookButton, assistant.look === look.id && s.lookButtonActive]} accessibilityRole="radio"
            accessibilityLabel={t(look.label)} accessibilityState={{ checked: assistant.look === look.id }}>
            <Image source={look.source} style={s.lookImage} />
            <Text style={s.lookLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t(look.label)}</Text>
          </Pressable>
        ))}
      </View>

      <Collapsible title={t("Voice and microphone")} summary={t(assistant.voice || assistant.wakeWord ? "On" : "Off")}>
      <SwitchRow label={t("Read the assistant's lines aloud")} value={assistant.voice}
        onChange={next => { void update({ assistant: { voice: next } }); }}
        hint={t("Uses your phone's own voice. Off when a screen reader is on, so lines are not read twice.")} />
      {assistant.voice && <AssistantVoicePicker />}

      <SwitchRow label={t("Call by voice: \"{name} ơi\"").replace("{name}", assistant.name)} value={assistant.wakeWord}
        onChange={next => { void setWakeWord(next); }}
        hint={t("While the app is open, the microphone listens for the name, then for your question. Your phone's speech service (Speech Services by Google) does the listening: with its offline pack for the language the audio stays on the phone, otherwise it may be sent to Google. The microphone stops when you leave the app.")} />
      {micNote && <Text style={s.error}>{micNote}</Text>}
      <Text style={s.hint}>{t("Hold the assistant, or tap the microphone in the chat, to say one thing without calling it.")}</Text>
      <Button variant="secondary" label={t("Download the offline speech pack")} onPress={() => { void getPack(); }} style={s.packButton} />
      {packNote && <Text style={s.hint} accessibilityLiveRegion="polite">{packNote}</Text>}

      <Text style={s.label}>{t("Soniox API key (speech to text)")}</Text>
      {sonioxKey
        ? <View style={s.keyRow}>
          <Text style={s.keyText}>{t("Saved key {key}").replace("{key}", maskKey(sonioxKey))}</Text>
          <Button variant="secondary" label={t("Remove")} onPress={() => { void removeSoniox(); }} />
        </View>
        : <View style={s.keyRow}>
          <TextInput onFocus={revealOnFocus} value={sonioxDraft} onChangeText={setSonioxDraft} secureTextEntry autoCapitalize="none" autoCorrect={false}
            style={[s.input, s.keyInput]} placeholder={t("Paste your Soniox API key")} placeholderTextColor={colors.mutedForeground}
            accessibilityLabel={t("Soniox API key (speech to text)")} />
          <Button variant="secondary" label={t("Save")} disabled={!sonioxDraft.trim()} onPress={() => { void storeSoniox(); }} />
        </View>}
      {sonioxNote && <Text style={sonioxNote.ok ? s.ok : s.error} accessibilityLiveRegion="polite">{sonioxNote.text}</Text>}
      <Text style={s.hint}>{t("With a Soniox key, your voice is streamed to Soniox (stt-rt.soniox.com) in real time while you hold the assistant or tap the microphone in the chat, and the words appear as you speak. With \"Call by voice\" on, the microphone streams to Soniox the whole time the app is open and the assistant is idle, and Soniox charges for that listening time. The key stays in the phone's secure storage. Without a key, the phone's own speech recognizer is used.")}</Text>

      </Collapsible>

      <Collapsible title={t("AI chat")} summary={t(ai.enabled ? "On" : "Off")}>
      <SwitchRow label={t("Answer with an AI")} value={ai.enabled}
        onChange={next => { void update({ ai: { enabled: next } }); }}
        hint={t("Off: the assistant answers a few questions on this phone. On: your questions, today's tasks and the tools' results go to the provider below, which can then create, change or finish tasks and change settings. Every change waits for you to agree.")} />

      {ai.enabled && <>
        <Text style={s.label}>{t("Base URL")}</Text>
        <TextInput onFocus={revealOnFocus} value={baseUrl} onChangeText={setBaseUrl} onBlur={commitUrl} onSubmitEditing={commitUrl} autoCapitalize="none" autoCorrect={false}
          keyboardType="url" style={s.input} placeholder="https://api.openai.com/v1" placeholderTextColor={colors.mutedForeground} accessibilityLabel={t("Base URL")} />
        {!urlCheck.ok && <Text style={s.error}>{t(URL_PROBLEMS[urlCheck.reason])}</Text>}
        <Text style={s.hint}>{t("Any OpenAI-compatible endpoint (it must accept POST /chat/completions with tools).")}</Text>

        <Text style={s.label}>{t("Model")}</Text>
        <TextInput onFocus={revealOnFocus} value={model} onChangeText={setModel} onBlur={commitModel} onSubmitEditing={commitModel} autoCapitalize="none" autoCorrect={false}
          style={s.input} placeholder={t("e.g. the model id from your provider")} placeholderTextColor={colors.mutedForeground} accessibilityLabel={t("Model")} />

        <Text style={s.label}>{t("API key")}</Text>
        {savedKey
          ? <View style={s.keyRow}>
            <Text style={s.keyText}>{t("Saved key {key}").replace("{key}", maskKey(savedKey))}</Text>
            <Button variant="secondary" label={t("Remove")} onPress={() => { void removeKey(); }} />
          </View>
          : <View style={s.keyRow}>
            <TextInput onFocus={revealOnFocus} value={keyDraft} onChangeText={setKeyDraft} secureTextEntry autoCapitalize="none" autoCorrect={false}
              style={[s.input, s.keyInput]} placeholder={t("Paste your API key")} placeholderTextColor={colors.mutedForeground} accessibilityLabel={t("API key")} />
            <Button variant="secondary" label={t("Save")} disabled={!keyDraft.trim()} onPress={() => { void storeKey(); }} />
          </View>}
        <Text style={s.hint}>{t("The key is kept in the phone's secure storage. It is never in backups, exports or the widget.")}</Text>

        <SwitchRow label={t("Share task titles with the AI")} value={ai.shareTitles}
          onChange={next => { void update({ ai: { shareTitles: next } }); }}
          hint={t("Off: the AI sees only times, durations and status. Period tracking is never shared.")} />

        <Button block label={t(testing ? "Testing…" : "Test the connection")} onPress={() => { void runTest(); }}
          disabled={testing || !savedKey || !urlCheck.ok || !model.trim()} style={s.testButton} />
        {testResult && <Text style={testResult.ok ? s.ok : s.error} accessibilityLiveRegion="polite">{testResult.text}</Text>}
      </>}
      </Collapsible>
    </>}
  </View>;
}

const makeStyles = (t: Theme) => {
  const c = t.colors;
  return StyleSheet.create({
    label: { ...t.type.label, color: c.foreground, marginTop: t.space.md, marginBottom: t.space.xs + 2 },
    hint: { ...t.type.caption, ...t.font.regular, color: c.mutedForeground, marginTop: t.space.xs },
    error: { ...t.type.meta, ...t.font.regular, color: c.destructive, marginTop: t.space.xs },
    ok: { ...t.type.meta, ...t.font.bold, color: c.foreground, marginTop: t.space.xs + 2 },
    input: {
      ...t.type.body, minHeight: 44, paddingHorizontal: t.space.md, borderRadius: t.radius.md, backgroundColor: c.card,
      borderWidth: 1, borderColor: c.inputBorder, color: c.foreground,
    },
    keyRow: { flexDirection: "row", alignItems: "center", gap: t.space.sm },
    keyText: { ...t.type.label, ...t.font.regular, flex: 1, color: c.foreground },
    keyInput: { flex: 1 },
    packButton: { marginTop: 10 },
    // Every look in one row: the buttons share the width and the pictures fill their button.
    lookRow: { flexDirection: "row", gap: t.space.xs + 2, marginBottom: t.space.xs + 2 },
    lookButton: { flex: 1, minWidth: 0, alignItems: "center", gap: t.space.xs, paddingVertical: t.space.sm, paddingHorizontal: t.space.xs, borderRadius: t.radius.md, borderWidth: 1, borderColor: c.hairline },
    lookButtonActive: { borderColor: c.primary, borderWidth: 2 },
    lookImage: { width: "100%", height: 72, resizeMode: "contain" },
    lookLabel: { ...t.type.meta, color: c.foreground, textAlign: "center" },
    testButton: { marginTop: 14 },
  });
};
