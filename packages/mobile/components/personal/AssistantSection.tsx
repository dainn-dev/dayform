import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { checkBaseUrl, maskKey } from "../../lib/ai-config";
import { testConnection } from "../../lib/ai-client";
import { deleteApiKey, readApiKey, saveApiKey } from "../../lib/ai-key-expo";
import { speechLocale } from "../../lib/assistant-speech";
import { askMic, downloadOfflinePack } from "../../lib/voice-expo";
import { useLanguage } from "../../lib/language";
import { useSettings } from "../../lib/settings-context";
import { AssistantVoicePicker } from "./AssistantVoicePicker";
import { SwitchRow } from "./SwitchRow";

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
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { assistant, ai } = settings;

  const [name, setName] = useState(assistant.name);
  const [baseUrl, setBaseUrl] = useState(ai.baseUrl);
  const [model, setModel] = useState(ai.model);
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
    setPackNote(t({ done: "The offline pack is installed.", dialog: "Follow the phone's dialog to download it.", scheduled: "The download is scheduled.", failed: "This phone could not download it." }[result]));
  };

  useEffect(() => { setName(assistant.name); }, [assistant.name]);
  useEffect(() => { setBaseUrl(ai.baseUrl); }, [ai.baseUrl]);
  useEffect(() => { setModel(ai.model); }, [ai.model]);
  useEffect(() => { void readApiKey().then(setSavedKey); }, []);

  const urlCheck = checkBaseUrl(baseUrl);
  const commitName = () => { if (name.trim() !== assistant.name) void update({ assistant: { name: name.trim() } }); };
  const commitUrl = () => { if (urlCheck.ok && urlCheck.url !== ai.baseUrl) void update({ ai: { baseUrl: urlCheck.url } }); };
  const commitModel = () => { if (model.trim() !== ai.model) void update({ ai: { model: model.trim() } }); };

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
      <TextInput value={name} onChangeText={setName} onBlur={commitName} onSubmitEditing={commitName} maxLength={20}
        style={s.input} placeholder="Leo" placeholderTextColor={colors.mutedForeground} accessibilityLabel={t("Assistant's name")} />

      <SwitchRow label={t("Read the assistant's lines aloud")} value={assistant.voice}
        onChange={next => { void update({ assistant: { voice: next } }); }}
        hint={t("Uses your phone's own voice. Off when a screen reader is on, so lines are not read twice.")} />
      {assistant.voice && <AssistantVoicePicker />}

      <SwitchRow label={t("Call by voice: \"{name} ơi\"").replace("{name}", assistant.name)} value={assistant.wakeWord}
        onChange={next => { void setWakeWord(next); }}
        hint={t("While the app is open, the microphone listens for the name, then for your question. Your phone's speech service (Speech Services by Google) does the listening: with its offline pack for the language the audio stays on the phone, otherwise it may be sent to Google. The microphone stops when you leave the app.")} />
      {micNote && <Text style={s.error}>{micNote}</Text>}
      <Text style={s.hint}>{t("Hold the assistant, or tap the microphone in the chat, to say one thing without calling it.")}</Text>
      <Pressable onPress={() => { void getPack(); }} accessibilityRole="button" style={[s.smallButton, s.packButton]}>
        <Text style={s.smallButtonText}>{t("Download the offline speech pack")}</Text>
      </Pressable>
      {packNote && <Text style={s.hint} accessibilityLiveRegion="polite">{packNote}</Text>}

      <View style={s.divider} />
      <Text style={s.heading} accessibilityRole="header">{t("AI chat")}</Text>
      <SwitchRow label={t("Answer with an AI")} value={ai.enabled}
        onChange={next => { void update({ ai: { enabled: next } }); }}
        hint={t("Off: the assistant answers a few questions on this phone. On: your questions, today's tasks and the tools' results go to the provider below, which can then create, change or finish tasks and change settings. Every change waits for you to agree.")} />

      {ai.enabled && <>
        <Text style={s.label}>{t("Base URL")}</Text>
        <TextInput value={baseUrl} onChangeText={setBaseUrl} onBlur={commitUrl} onSubmitEditing={commitUrl} autoCapitalize="none" autoCorrect={false}
          keyboardType="url" style={s.input} placeholder="https://api.openai.com/v1" placeholderTextColor={colors.mutedForeground} accessibilityLabel={t("Base URL")} />
        {!urlCheck.ok && <Text style={s.error}>{t(URL_PROBLEMS[urlCheck.reason])}</Text>}
        <Text style={s.hint}>{t("Any OpenAI-compatible endpoint (it must accept POST /chat/completions with tools).")}</Text>

        <Text style={s.label}>{t("Model")}</Text>
        <TextInput value={model} onChangeText={setModel} onBlur={commitModel} onSubmitEditing={commitModel} autoCapitalize="none" autoCorrect={false}
          style={s.input} placeholder={t("e.g. the model id from your provider")} placeholderTextColor={colors.mutedForeground} accessibilityLabel={t("Model")} />

        <Text style={s.label}>{t("API key")}</Text>
        {savedKey
          ? <View style={s.keyRow}>
            <Text style={s.keyText}>{t("Saved key {key}").replace("{key}", maskKey(savedKey))}</Text>
            <Pressable onPress={() => { void removeKey(); }} accessibilityRole="button" style={s.smallButton}>
              <Text style={s.smallButtonText}>{t("Remove")}</Text>
            </Pressable>
          </View>
          : <View style={s.keyRow}>
            <TextInput value={keyDraft} onChangeText={setKeyDraft} secureTextEntry autoCapitalize="none" autoCorrect={false}
              style={[s.input, s.keyInput]} placeholder={t("Paste your API key")} placeholderTextColor={colors.mutedForeground} accessibilityLabel={t("API key")} />
            <Pressable onPress={() => { void storeKey(); }} disabled={!keyDraft.trim()} accessibilityRole="button" style={[s.smallButton, !keyDraft.trim() && s.disabled]}>
              <Text style={s.smallButtonText}>{t("Save")}</Text>
            </Pressable>
          </View>}
        <Text style={s.hint}>{t("The key is kept in the phone's secure storage. It is never in backups, exports or the widget.")}</Text>

        <SwitchRow label={t("Share task titles with the AI")} value={ai.shareTitles}
          onChange={next => { void update({ ai: { shareTitles: next } }); }}
          hint={t("Off: the AI sees only times, durations and status. Period tracking is never shared.")} />

        <Pressable onPress={() => { void runTest(); }} disabled={testing || !savedKey || !urlCheck.ok || !model.trim()} accessibilityRole="button"
          style={[s.testButton, (testing || !savedKey || !urlCheck.ok || !model.trim()) && s.disabled]}>
          <Text style={s.testText}>{t(testing ? "Testing…" : "Test the connection")}</Text>
        </Pressable>
        {testResult && <Text style={testResult.ok ? s.ok : s.error} accessibilityLiveRegion="polite">{testResult.text}</Text>}
      </>}
    </>}
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  label: { color: c.foreground, fontSize: 13, fontWeight: "700", marginTop: 12, marginBottom: 6 },
  heading: { color: c.foreground, fontSize: 14, fontWeight: "800", marginBottom: 4 },
  hint: { color: c.mutedForeground, fontSize: 11, lineHeight: 16, marginTop: 4 },
  error: { color: c.destructive, fontSize: 12, marginTop: 4 },
  ok: { color: c.foreground, fontSize: 12, marginTop: 6, fontWeight: "700" },
  input: {
    minHeight: 44, paddingHorizontal: 12, borderRadius: 12, backgroundColor: c.card,
    borderWidth: 1, borderColor: c.inputBorder, color: c.foreground, fontSize: 14,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: c.hairline, marginVertical: 14 },
  keyRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  keyText: { flex: 1, color: c.foreground, fontSize: 13 },
  keyInput: { flex: 1 },
  smallButton: { minHeight: 44, paddingHorizontal: 14, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.primary },
  smallButtonText: { color: c.primary, fontSize: 13, fontWeight: "800" },
  packButton: { marginTop: 10 },
  testButton: { minHeight: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: c.primary, marginTop: 14 },
  testText: { color: c.onPrimary, fontSize: 13, fontWeight: "800" },
  disabled: { opacity: 0.4 },
});
