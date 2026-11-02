import React, { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { fill } from "../../lib/assistant-answers";
import { expLine, rankLabel } from "../../lib/rank-label";
import { useXp } from "../../lib/xp-context";
import { RankBadge } from "../cultivation/RankBadge";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { NameInput } from "../onboarding/NameInput";
import { useLanguage } from "../../lib/language";
import { isValidName, nameInitial } from "../../lib/settings";
import { useSettings } from "../../lib/settings-context";
import { IconButton } from "../ui/IconButton";

const AVATAR_SIZE = 56;

/** Avatar, name and an inline editor (same validation as the first-launch prompt). */
export function ProfileCard() {
  const { settings, setName } = useSettings();
  const { t, language } = useLanguage();
  const router = useRouter();
  const { enabled, ready, rank, state, style, ladder } = useXp();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const name = settings.profile.name;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const canSave = isValidName(draft) && !busy;
  // With the rank system on, the badge takes the frame before the name and the rank and experience sit under it.
  const ranked = ready && enabled;
  const lang = language === "vi" ? "vi" : "en";
  const label = ranked ? rankLabel(rank, t, ladder) : "";
  const exp = ranked ? expLine(rank, state.total, lang, ladder) : null;
  const expText = exp ? fill(t(exp.text), exp.vars) : "";
  const openRank = () => router.push("/settings/cultivation");

  const startEditing = () => { setDraft(name); setEditing(true); };
  const stopEditing = () => setEditing(false);
  const save = useCallback(async () => {
    if (!canSave) return;
    setBusy(true);
    await setName(draft);
    setBusy(false);
    setEditing(false);
  }, [canSave, draft, setName]);

  return <View style={s.card}>
    <View style={s.row}>
      {ranked
        ? <Pressable onPress={openRank} accessibilityRole="button" accessibilityLabel={`${t("Open rank details")}: ${label}`} style={s.badge}>
          <RankBadge style={style} realm={rank.realm} layer={rank.layer} stage={rank.stage} size={AVATAR_SIZE} />
        </Pressable>
        : <View style={s.avatar} accessible={false} importantForAccessibility="no-hide-descendants">
          <Text style={s.initial}>{nameInitial(name)}</Text>
        </View>}
      <View style={s.who}>
        <Text style={s.name} numberOfLines={2}>{name || t("Add your name")}</Text>
        {ranked && <Pressable onPress={openRank} accessibilityRole="button" accessibilityLabel={`${label}. ${expText}`}>
          <Text style={s.rank}>{label}</Text>
          <Text style={s.exp}>{expText}</Text>
          <View style={s.track} accessible={false}><View style={[s.fill, { width: `${Math.round(rank.progress * 100)}%` }]} /></View>
        </Pressable>}
      </View>
      {!editing && <IconButton icon="pencil-outline" label={t("Edit your name")} onPress={startEditing} />}
    </View>
    {editing && <View style={s.editor}>
      <NameInput value={draft} onChange={setDraft} onSubmit={() => { void save(); }} focusAfterMs={0} />
      <View style={s.actions}>
        <IconButton icon="close" label={t("Cancel")} onPress={stopEditing} />
        <IconButton icon="checkmark" tone="primary" label={t("Save")} disabled={!canSave} onPress={() => { void save(); }} />
      </View>
    </View>}
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  card: { backgroundColor: c.card, borderRadius: 17, padding: 14, marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2, backgroundColor: c.accent, alignItems: "center", justifyContent: "center" },
  initial: { color: c.accentForeground, fontSize: 24, fontWeight: "800" },
  badge: { width: AVATAR_SIZE, height: AVATAR_SIZE },
  // minWidth 0 lets the rank and the experience line wrap under the badge instead of being cut off.
  who: { flex: 1, minWidth: 0 },
  name: { color: c.foreground, fontSize: 19, fontWeight: "800" },
  rank: { color: c.primary, fontSize: 13, lineHeight: 18, fontWeight: "800", marginTop: 3 },
  exp: { color: c.mutedForeground, fontSize: 12, lineHeight: 17, fontWeight: "700", marginTop: 1 },
  track: { height: 5, borderRadius: 3, backgroundColor: c.track, overflow: "hidden", marginTop: 5 },
  fill: { height: 5, borderRadius: 3, backgroundColor: c.primary },
  editor: { marginTop: 12 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 10 },
});
