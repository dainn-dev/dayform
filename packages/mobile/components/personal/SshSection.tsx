import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";
import { SSH_ERROR_TEXTS, shortFingerprint, toSshError } from "../../lib/ssh";
import { readSshCredentials } from "../../lib/ssh-credentials-expo";
import { hostAddress, type SshHost } from "../../lib/ssh-hosts";
import { useSshHosts } from "../../lib/ssh-hosts-context";
import { fetchHostFingerprint, isSshSupported, runSshCommand } from "../../modules/dayform-ssh";
import { useSettings } from "../../lib/settings-context";
import { SshHostEditor } from "./SshHostEditor";
import { SwitchRow } from "./SwitchRow";
import { SshTerminal } from "./SshTerminal";

/** "SSH servers": the servers the user can log in to, each with a connection check that shows the server's key before it is trusted. */
export function SshSection() {
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { items, locked, saveError } = useSshHosts();
  const [editing, setEditing] = useState<SshHost | null>(null);
  const [open, setOpen] = useState(false);
  const [terminal, setTerminal] = useState<SshHost | null>(null);
  const supported = isSshSupported();
  const { settings, update } = useSettings();

  return <View style={s.stack}>
    <Text style={s.hint}>{t("Log in to your own servers over SSH. Each server's key is shown to you first and checked on every connection.")}</Text>
    {!supported && <Text style={s.warning}>{t(SSH_ERROR_TEXTS.UNSUPPORTED)}</Text>}
    {items.length === 0
      ? <Text style={s.hint}>{t("No servers yet. Add one below.")}</Text>
      : items.map(host => <HostRow key={host.id} host={host} supported={supported} onEdit={() => { setEditing(host); setOpen(true); }} onRun={() => setTerminal(host)} />)}
    {(locked || saveError) && <Text style={s.warning}>{t(locked ? "Servers could not be loaded, so they cannot be changed now. Try reopening the app." : "Your change could not be saved. Please try again.")}</Text>}
    <View style={s.rules}>
      <SwitchRow label={t("Let the assistant run commands")} hint={t("The assistant can propose a command on a trusted server. You see the exact command and must agree to each one. A command that looks dangerous needs a tap on the card; it cannot be agreed to by voice.")}
        value={settings.ssh.assistant} onChange={value => { void update({ ssh: { assistant: value } }); }} />
      {settings.ssh.assistant && !settings.ai.enabled && <Text style={s.warning}>{t("Turn on the AI chat on the Assistant page for this to work.")}</Text>}
      {settings.ssh.assistant && <SwitchRow label={t("Send command output to the AI")} hint={t("Off: the assistant only learns whether a command worked, and you read the output yourself. On: up to 8000 characters of each output go to your AI provider, so leave it off for servers whose output can hold secrets.")}
        value={settings.ssh.shareOutput} onChange={value => { void update({ ssh: { shareOutput: value } }); }} />}
    </View>
    <Pressable onPress={() => { setEditing(null); setOpen(true); }} accessibilityRole="button" style={s.add}>
      <Ionicons accessible={false} name="add" size={18} color={colors.onPrimary} />
      <Text style={s.addText}>{t("Add a server")}</Text>
    </Pressable>
    <SshHostEditor visible={open} host={editing} onClose={() => setOpen(false)} />
    <SshTerminal visible={terminal !== null} host={terminal} onClose={() => setTerminal(null)} />
  </View>;
}

type Check = { kind: "idle" } | { kind: "busy" } | { kind: "ok" } | { kind: "error"; text: string; mismatch: boolean } | { kind: "trust"; fingerprint: string };

function HostRow({ host, supported, onEdit, onRun }: { host: SshHost; supported: boolean; onEdit: () => void; onRun: () => void }) {
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { trust } = useSshHosts();
  const [check, setCheck] = useState<Check>({ kind: "idle" });

  const login = async (fingerprint: string): Promise<void> => {
    const credentials = await readSshCredentials(host.id);
    if (credentials === null) return setCheck({ kind: "error", text: t(SSH_ERROR_TEXTS.NO_CREDENTIALS), mismatch: false });
    try {
      await runSshCommand(host, { command: "true", fingerprint, credentials, timeoutMs: 15_000 });
      setCheck({ kind: "ok" });
    } catch (error) {
      const failure = toSshError(error);
      setCheck({ kind: "error", text: t(SSH_ERROR_TEXTS[failure.code]), mismatch: failure.code === "HOST_KEY_MISMATCH" });
    }
  };

  const start = async (): Promise<void> => {
    if (check.kind === "busy") return;
    setCheck({ kind: "busy" });
    if (host.fingerprint !== null) return login(host.fingerprint);
    try {
      setCheck({ kind: "trust", fingerprint: await fetchHostFingerprint(host) });
    } catch (error) {
      setCheck({ kind: "error", text: t(SSH_ERROR_TEXTS[toSshError(error).code]), mismatch: false });
    }
  };

  const accept = async (fingerprint: string): Promise<void> => {
    setCheck({ kind: "busy" });
    const saved = await trust(host.id, fingerprint);
    if (!saved.ok) return setCheck({ kind: "error", text: t("Your change could not be saved. Please try again."), mismatch: false });
    await login(fingerprint);
  };

  // After a mismatch the old key is forgotten, so the next check shows the new one to compare before it is trusted.
  const forget = async (): Promise<void> => {
    await trust(host.id, null);
    setCheck({ kind: "idle" });
  };

  return <View style={s.card}>
    <View style={s.cardTop}>
      <View style={s.cardText}>
        <Text numberOfLines={1} style={s.name}>{host.name}</Text>
        <Text numberOfLines={1} style={s.meta}>{`${host.user}@${hostAddress(host)}`}</Text>
        <Text style={host.fingerprint === null ? s.metaWarn : s.metaOk}>
          {host.fingerprint === null ? t("Key not checked yet") : `${t("Trusted key")} ${shortFingerprint(host.fingerprint)}`}
        </Text>
      </View>
      <Pressable onPress={onEdit} accessibilityRole="button" accessibilityLabel={`${t("Edit server")} ${host.name}`} style={s.iconBtn}>
        <Ionicons name="create-outline" size={20} color={colors.mutedForeground} />
      </Pressable>
    </View>

    {check.kind === "trust" && <View style={s.trustBox}>
      <Text style={s.trustTitle}>{t("Is this your server's key?")}</Text>
      <Text selectable style={s.fingerprint}>{check.fingerprint}</Text>
      <Text style={s.hint}>{t("Compare it with what the server shows: ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub")}</Text>
      <View style={s.buttons}>
        <Pressable onPress={() => setCheck({ kind: "idle" })} accessibilityRole="button" style={s.ghost}><Text style={s.ghostText}>{t("Cancel")}</Text></Pressable>
        <Pressable onPress={() => void accept(check.fingerprint)} accessibilityRole="button" style={s.primary}><Text style={s.primaryText}>{t("Trust and log in")}</Text></Pressable>
      </View>
    </View>}

    {check.kind === "ok" && <Text accessibilityLiveRegion="polite" style={s.ok}>{t("Connected. The login works.")}</Text>}
    {check.kind === "error" && <View>
      <Text accessibilityLiveRegion="polite" style={s.error}>{check.text}</Text>
      {check.mismatch && <Pressable onPress={() => void forget()} accessibilityRole="button" style={s.ghost}><Text style={s.ghostText}>{t("Forget the old key")}</Text></Pressable>}
    </View>}

    {host.fingerprint !== null && check.kind !== "trust" && <Pressable onPress={onRun} disabled={!supported} accessibilityRole="button" style={[s.runBtn, !supported && s.off]}>
      <Ionicons accessible={false} name="terminal-outline" size={18} color={colors.onPrimary} />
      <Text style={s.runBtnText}>{t("Run a command")}</Text>
    </Pressable>}

    {check.kind !== "trust" && <Pressable onPress={() => void start()} disabled={!supported || check.kind === "busy"} accessibilityRole="button"
      accessibilityState={{ disabled: !supported || check.kind === "busy", busy: check.kind === "busy" }} style={[s.check, (!supported || check.kind === "busy") && s.off]}>
      <Text style={s.checkText}>{check.kind === "busy" ? t("Connecting…") : t("Check connection")}</Text>
    </Pressable>}
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  stack: { gap: 12 },
  rules: { gap: 10, paddingTop: 4 },
  hint: { color: c.mutedForeground, fontSize: 12, lineHeight: 17 },
  warning: { color: c.errorBannerText, fontSize: 12, lineHeight: 17 },
  card: { padding: 14, borderRadius: 16, backgroundColor: c.primarySoft, gap: 10 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardText: { flex: 1, minWidth: 0 },
  name: { color: c.foreground, fontSize: 15, fontWeight: "800" },
  meta: { color: c.mutedForeground, fontSize: 12, marginTop: 2 },
  metaOk: { color: c.accentForeground, fontSize: 11, marginTop: 4, fontWeight: "700" },
  metaWarn: { color: c.mutedForeground, fontSize: 11, marginTop: 4, fontWeight: "700" },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  trustBox: { gap: 8, padding: 12, borderRadius: 14, backgroundColor: c.card },
  trustTitle: { color: c.foreground, fontSize: 13, fontWeight: "800" },
  fingerprint: { color: c.foreground, fontSize: 12, fontFamily: "monospace", lineHeight: 18 },
  buttons: { flexDirection: "row", gap: 10, justifyContent: "flex-end", marginTop: 4 },
  ok: { color: c.accentForeground, fontSize: 13, fontWeight: "700" },
  error: { color: c.errorMessage, fontSize: 13, fontWeight: "700", lineHeight: 18 },
  check: { minHeight: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: c.card },
  checkText: { color: c.accentForeground, fontSize: 13, fontWeight: "800" },
  off: { opacity: 0.5 },
  runBtn: { minHeight: 44, borderRadius: 14, backgroundColor: c.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  runBtnText: { color: c.onPrimary, fontSize: 13, fontWeight: "800" },
  ghost: { minHeight: 44, paddingHorizontal: 14, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  ghostText: { color: c.mutedForeground, fontSize: 13, fontWeight: "700" },
  primary: { minHeight: 44, paddingHorizontal: 18, borderRadius: 13, backgroundColor: c.primary, alignItems: "center", justifyContent: "center" },
  primaryText: { color: c.onPrimary, fontSize: 13, fontWeight: "800" },
  add: { minHeight: 48, borderRadius: 15, backgroundColor: c.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  addText: { color: c.onPrimary, fontSize: 14, fontWeight: "800" },
});
