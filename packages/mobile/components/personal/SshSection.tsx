import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, useThemedStyles, type Theme } from "../../hooks/use-theme";
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
import { Button } from "../ui/Button";

/** "SSH servers": the servers the user can log in to, each with a connection check that shows the server's key before it is trusted. */
export function SshSection() {
  const { t } = useLanguage();
  const s = useThemedStyles(makeStyles);
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
    <Button block icon="add" label={t("Add a server")} onPress={() => { setEditing(null); setOpen(true); }} />
    <SshHostEditor visible={open} host={editing} onClose={() => setOpen(false)} />
    <SshTerminal visible={terminal !== null} host={terminal} onClose={() => setTerminal(null)} />
  </View>;
}

type Check = { kind: "idle" } | { kind: "busy" } | { kind: "ok" } | { kind: "error"; text: string; mismatch: boolean } | { kind: "trust"; fingerprint: string };

function HostRow({ host, supported, onEdit, onRun }: { host: SshHost; supported: boolean; onEdit: () => void; onRun: () => void }) {
  const { t } = useLanguage();
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
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
        <Button variant="ghost" label={t("Cancel")} onPress={() => setCheck({ kind: "idle" })} />
        <Button label={t("Trust and log in")} onPress={() => void accept(check.fingerprint)} />
      </View>
    </View>}

    {check.kind === "ok" && <Text accessibilityLiveRegion="polite" style={s.ok}>{t("Connected. The login works.")}</Text>}
    {check.kind === "error" && <View>
      <Text accessibilityLiveRegion="polite" style={s.error}>{check.text}</Text>
      {check.mismatch && <Button variant="ghost" label={t("Forget the old key")} onPress={() => void forget()} />}
    </View>}

    {host.fingerprint !== null && check.kind !== "trust" && <Button block icon="terminal-outline" label={t("Run a command")} disabled={!supported} onPress={onRun} />}

    {check.kind !== "trust" && <Pressable onPress={() => void start()} disabled={!supported || check.kind === "busy"} accessibilityRole="button"
      accessibilityState={{ disabled: !supported || check.kind === "busy", busy: check.kind === "busy" }} style={[s.check, (!supported || check.kind === "busy") && s.off]}>
      <Text style={s.checkText}>{check.kind === "busy" ? t("Connecting…") : t("Check connection")}</Text>
    </Pressable>}
  </View>;
}

const makeStyles = (t: Theme) => {
  const c = t.colors;
  return StyleSheet.create({
    stack: { gap: t.space.md },
    rules: { gap: 10, paddingTop: t.space.xs },
    hint: { ...t.type.meta, ...t.font.regular, color: c.mutedForeground },
    warning: { ...t.type.meta, ...t.font.regular, color: c.errorBannerText },
    card: { padding: 14, borderRadius: t.radius.lg, backgroundColor: c.primarySoft, gap: 10 },
    cardTop: { flexDirection: "row", alignItems: "center", gap: t.space.sm },
    cardText: { flex: 1, minWidth: 0 },
    name: { ...t.type.subtitle, color: c.foreground },
    meta: { ...t.type.meta, color: c.mutedForeground, marginTop: t.space.xxs },
    metaOk: { ...t.type.caption, ...t.font.bold, color: c.accentForeground, marginTop: t.space.xs },
    metaWarn: { ...t.type.caption, ...t.font.bold, color: c.mutedForeground, marginTop: t.space.xs },
    iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
    trustBox: { gap: t.space.sm, padding: t.space.md, borderRadius: t.radius.md, backgroundColor: c.card },
    trustTitle: { ...t.type.label, color: c.foreground },
    fingerprint: { ...t.type.mono, color: c.foreground },
    buttons: { flexDirection: "row", gap: 10, justifyContent: "flex-end", marginTop: t.space.xs },
    ok: { ...t.type.label, color: c.accentForeground },
    error: { ...t.type.label, color: c.errorMessage },
    check: { minHeight: 44, borderRadius: t.buttonRadius, alignItems: "center", justifyContent: "center", backgroundColor: c.card },
    checkText: { ...t.type.label, color: c.accentForeground },
    off: { opacity: 0.5 },
  });
};
