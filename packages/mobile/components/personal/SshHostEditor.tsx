import React, { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColors } from "../../hooks/use-colors";
import { useKeyboardInset } from "../../hooks/use-keyboard-inset";
import type { ThemeColors } from "../../constants/theme";
import { pickBackupText } from "../../lib/backup-expo";
import { useLanguage } from "../../lib/language";
import { cleanPrivateKey, looksLikePrivateKey } from "../../lib/ssh";
import { deleteSshCredentials, hasSshCredentials, saveSshCredentials } from "../../lib/ssh-credentials-expo";
import { DEFAULT_SSH_PORT, MAX_HOST_NAME, type SshAuth, type SshHost, type SshHostForm } from "../../lib/ssh-hosts";
import { useSshHistory } from "../../lib/ssh-history-context";
import { useSshHosts } from "../../lib/ssh-hosts-context";
import { ChoiceChips } from "../editor/ChoiceChips";

type Props = { visible: boolean; host: SshHost | null; onClose: () => void };

const MESSAGES: Record<string, string> = {
  "invalid-name": "Give the server a name.",
  "invalid-host": "Enter a host name or an IP address, without ssh:// or a port.",
  "invalid-port": "The port must be a number from 1 to 65535.",
  "invalid-user": "Enter the user name to log in with.",
  duplicate: "Another server already has this name.",
  limit: "You have reached the maximum number of servers.",
  unknown: "That server no longer exists.",
  locked: "Servers could not be loaded, so they cannot be changed now. Try reopening the app.",
  "write-failed": "Your change could not be saved. Please try again.",
  "no-secret": "Enter the password, or the private key, to save with this server.",
  "bad-key": "That does not look like a private key. Paste the whole file, from the BEGIN line to the END line.",
  "secret-failed": "The server was saved, but its password or key could not be stored on this phone.",
  "key-read-failed": "That file could not be read.",
};

const AUTH_CHOICES = [{ value: "key" as const, label: "Private key" }, { value: "password" as const, label: "Password" }];

/** Add a server or edit one: where it is, who logs in, and the password or key, which only ever goes to the phone's secure storage. */
export function SshHostEditor({ visible, host, onClose }: Props) {
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const keyboard = useKeyboardInset();
  const { add, update, remove } = useSshHosts();
  const history = useSshHistory();
  const [form, setForm] = useState<SshHostForm>(() => formOf(host));
  const [secret, setSecret] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    if (!visible) return;
    setForm(formOf(host));
    setSecret("");
    setPassphrase("");
    setMessage(null);
    setArmed(false);
    setSaved(false);
    if (host !== null) void hasSshCredentials(host.id).then(setSaved);
  }, [visible, host]);

  const patch = (change: Partial<SshHostForm>) => setForm(current => ({ ...current, ...change }));
  const authChoices = useMemo(() => AUTH_CHOICES.map(choice => ({ ...choice, label: t(choice.label) })), [t]);
  const fail = (reason: string) => setMessage(t(MESSAGES[reason] ?? MESSAGES["write-failed"]));

  const chooseFile = async (): Promise<void> => {
    const picked = await pickBackupText(["*/*"]);
    if (picked.ok) setSecret(picked.text);
    else if (picked.reason !== "cancelled") fail("key-read-failed");
  };

  const save = async (): Promise<void> => {
    if (busy) return;
    const typed = secret.trim();
    // A new server needs a secret; an edit may keep the saved one by leaving the field empty, unless the login kind changed.
    const kindChanged = host !== null && host.auth !== form.auth;
    if (typed === "" && (host === null || !saved || kindChanged)) return fail("no-secret");
    if (typed !== "" && form.auth === "key" && !looksLikePrivateKey(typed)) return fail("bad-key");
    setBusy(true);
    try {
      const result = host === null ? await add(form) : await update(host.id, form);
      if (!result.ok) return fail(result.reason);
      const id = host === null ? result.id : host.id;
      if (typed !== "" && id !== undefined) {
        const stored = await saveSshCredentials(id, form.auth === "key"
          ? { privateKey: cleanPrivateKey(typed), ...(passphrase !== "" ? { passphrase } : {}) }
          : { password: typed });
        if (!stored) return fail("secret-failed");
      }
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const del = async (): Promise<void> => {
    if (host === null) return;
    if (!armed) { setArmed(true); return; }
    if (busy) return;
    setBusy(true);
    try {
      const result = await remove(host.id);
      if (!result.ok) return fail(result.reason);
      await deleteSshCredentials(host.id);
      await history.clear(host.id);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
    <SafeAreaView style={s.root} edges={["top", "bottom", "left", "right"]}>
      <View style={s.top}>
        <Text accessibilityRole="header" style={s.heading}>{t(host === null ? "New server" : "Edit server")}</Text>
        <Pressable onPress={onClose} accessibilityLabel={t("Cancel")} accessibilityRole="button" style={s.close}><Ionicons name="close" size={22} color={colors.foreground} /></Pressable>
      </View>
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: 40 + keyboard.height }]} keyboardShouldPersistTaps="handled">
        <Text style={s.label}>{t("Name")}</Text>
        <TextInput value={form.name} onChangeText={name => patch({ name })} maxLength={MAX_HOST_NAME} placeholder="prod" placeholderTextColor={colors.placeholder} accessibilityLabel={t("Name")} style={s.input} />

        <Text style={s.label}>{t("Address")}</Text>
        <View style={s.row}>
          <TextInput value={form.host} onChangeText={value => patch({ host: value })} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="example.com" placeholderTextColor={colors.placeholder} accessibilityLabel={t("Address")} style={[s.input, s.grow]} />
          <TextInput value={form.port} onChangeText={port => patch({ port: port.replace(/\D/g, "") })} maxLength={5} keyboardType="number-pad" placeholder={String(DEFAULT_SSH_PORT)} placeholderTextColor={colors.placeholder} accessibilityLabel={t("Port")} style={[s.input, s.port]} />
        </View>

        <Text style={s.label}>{t("User")}</Text>
        <TextInput value={form.user} onChangeText={user => patch({ user })} autoCapitalize="none" autoCorrect={false} placeholder="root" placeholderTextColor={colors.placeholder} accessibilityLabel={t("User")} style={s.input} />

        <Text style={s.label}>{t("Log in with")}</Text>
        <ChoiceChips choices={authChoices} value={form.auth} onChange={(auth: SshAuth) => { patch({ auth }); setSecret(""); }} />

        {form.auth === "key"
          ? <>
            <Text style={s.label}>{t("Private key")}</Text>
            <TextInput value={secret} onChangeText={setSecret} multiline autoCapitalize="none" autoCorrect={false} spellCheck={false} accessibilityLabel={t("Private key")}
              placeholder={saved && host?.auth === "key" ? t("A key is saved. Leave empty to keep it.") : "-----BEGIN OPENSSH PRIVATE KEY-----"} placeholderTextColor={colors.placeholder} style={[s.input, s.keyBox]} />
            <Pressable onPress={() => void chooseFile()} accessibilityRole="button" style={s.secondary}><Text style={s.secondaryText}>{t("Choose a key file")}</Text></Pressable>
            <Text style={s.label}>{t("Key passphrase (if it has one)")}</Text>
            <TextInput value={passphrase} onChangeText={setPassphrase} secureTextEntry autoCapitalize="none" autoCorrect={false} accessibilityLabel={t("Key passphrase (if it has one)")} placeholderTextColor={colors.placeholder} style={s.input} />
          </>
          : <>
            <Text style={s.label}>{t("Password")}</Text>
            <TextInput value={secret} onChangeText={setSecret} secureTextEntry autoCapitalize="none" autoCorrect={false} accessibilityLabel={t("Password")}
              placeholder={saved && host?.auth === "password" ? t("A password is saved. Leave empty to keep it.") : ""} placeholderTextColor={colors.placeholder} style={s.input} />
          </>}
        <Text style={s.hint}>{t("The password or key stays in your phone's secure storage. It is never saved in a backup and never sent to the assistant.")}</Text>

        {message !== null && <Text accessibilityLiveRegion="polite" style={s.message}>{message}</Text>}
        <Pressable onPress={() => void save()} disabled={busy} accessibilityRole="button" style={s.primary}><Text style={s.primaryText}>{t("Save")}</Text></Pressable>
        {host !== null && <Pressable onPress={() => void del()} disabled={busy} accessibilityRole="button" style={[s.danger, armed && s.dangerArmed]}>
          <Text style={s.dangerText}>{armed ? t("Tap again to delete") : t("Delete server")}</Text>
        </Pressable>}
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

function formOf(host: SshHost | null): SshHostForm {
  return host === null
    ? { name: "", host: "", port: "", user: "", auth: "key" }
    : { name: host.name, host: host.host, port: host.port === DEFAULT_SSH_PORT ? "" : String(host.port), user: host.user, auth: host.auth };
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  top: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heading: { fontSize: 26, fontWeight: "800", color: c.foreground, letterSpacing: -0.8 },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.card, alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: 24 },
  label: { color: c.labelText, fontSize: 10, fontWeight: "800", letterSpacing: 1.4, marginBottom: 8, marginTop: 18, textTransform: "uppercase" },
  hint: { color: c.mutedForeground, fontSize: 12, lineHeight: 17, marginTop: 14 },
  input: { minHeight: 48, backgroundColor: c.card, borderRadius: 14, paddingHorizontal: 14, color: c.foreground, fontSize: 15, borderWidth: 1, borderColor: c.inputBorder },
  row: { flexDirection: "row", gap: 10 },
  grow: { flex: 1, minWidth: 0 },
  port: { width: 92, textAlign: "center" },
  keyBox: { minHeight: 120, paddingTop: 12, textAlignVertical: "top", fontFamily: "monospace", fontSize: 12 },
  secondary: { marginTop: 10, minHeight: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: c.primarySoft },
  secondaryText: { color: c.accentForeground, fontSize: 13, fontWeight: "800" },
  message: { color: c.errorMessage, fontSize: 13, fontWeight: "700", marginTop: 14, textAlign: "center" },
  primary: { marginTop: 18, minHeight: 50, borderRadius: 16, backgroundColor: c.primary, alignItems: "center", justifyContent: "center" },
  primaryText: { color: c.onPrimary, fontSize: 14, fontWeight: "800" },
  danger: { marginTop: 10, minHeight: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  dangerArmed: { backgroundColor: c.errorBg },
  dangerText: { color: c.deleteText, fontSize: 14, fontWeight: "800" },
});
