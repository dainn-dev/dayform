import React, { useMemo } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";
import { word } from "../../lib/ladder-words";
import { rankLabel } from "../../lib/rank-label";
import { LADDERS, LADDER_STYLES, rankOf } from "../../lib/realm";
import { useSettings } from "../../lib/settings-context";
import { useXp } from "../../lib/xp-context";
import { RankBadge } from "../cultivation/RankBadge";
import { Collapsible } from "../ui/Collapsible";
import { SwitchRow } from "./SwitchRow";

const HERO = 104;
const REALM_TILE = 40;
const STYLE_BADGE = 44;
const MIN_TOUCH_TARGET = 44;

/** The names of the two styles in the picker. */
const STYLE_NAMES = { cultivation: "Cultivation style", engineer: "Engineer style" } as const;

/**
 * "Rank": deliberately sparse. The rank and a bar without numbers, the realms reached so far and a "?" for each one still to
 * find. No experience amounts, rules or goals: how it all works is left for the player to discover.
 */
export function CultivationSection() {
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { settings, update } = useSettings();
  const xp = useXp();
  const { rank, state, ladder, style } = xp;
  const w = (key: string) => t(word(style, key));

  const erase = () => Alert.alert(w("Erase your experience and realm?"), t("This cannot be undone. Your tasks are not touched."), [
    { text: t("Cancel"), style: "cancel" },
    { text: t("Erase"), style: "destructive", onPress: () => { void xp.reset(); } },
  ]);

  const label = rankLabel(rank, t, ladder);

  return <View>
    <SwitchRow label={w("Cultivation is on")} value={settings.xp.enabled}
      onChange={next => { void update({ xp: { enabled: next } }); }}
      hint={t("Finish tasks to grow. The rest is yours to discover.")} />

    {settings.xp.enabled && <>
      <View style={s.hero} accessible accessibilityLabel={label}>
        <RankBadge style={style} realm={rank.realm} layer={rank.layer} stage={rank.stage} size={HERO} />
        <Text style={s.rank}>{label}</Text>
        <View style={s.track} accessible={false}><View style={[s.fill, { width: `${Math.round(rank.progress * 100)}%` }]} /></View>
        {rank.breakthrough && <Text style={s.teaser}>{t("Your strength is gathering…")}</Text>}
      </View>

      {/* One row: the realms reached so far, then a single "?" for what is ahead, so the player cannot count the rest. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.path} accessibilityLabel={w("Realms")}>
        {ladder.tracks.slice(0, rank.realm + 1).map((name, track) => <View key={name} style={s.pathStep}>
          {track > 0 && <View style={s.link} />}
          <View style={s.realm} accessible accessibilityLabel={t(name)}>
            <RankBadge style={style} realm={track} layer={1} stage={0} size={REALM_TILE} />
            <Text style={[s.realmName, track === rank.realm && s.realmNameNow]}>{t(name)}</Text>
          </View>
        </View>)}
        {rank.realm < ladder.tracks.length - 1 && <View style={s.pathStep}>
          <View style={s.link} />
          <View style={s.realm} accessible accessibilityLabel={t("Not reached yet")}>
            <View style={s.unknown}><Text style={s.unknownMark}>?</Text></View>
            <Text style={s.realmName}>???</Text>
          </View>
        </View>}
      </ScrollView>

      <Collapsible title={t("Style and sound")}>
      <View style={s.styles} accessibilityRole="radiogroup">
        {LADDER_STYLES.map(id => {
          const other = LADDERS[id];
          const there = rankOf(state.total, other);
          const chosen = id === style;
          return <Pressable key={id} onPress={() => { void update({ xp: { style: id } }); }} accessibilityRole="radio" accessibilityState={{ checked: chosen }}
            accessibilityLabel={`${t(STYLE_NAMES[id])}: ${rankLabel(there, t, other)}`} style={[s.styleCard, chosen && s.styleCardOn]}>
            <RankBadge style={id} realm={there.realm} layer={there.layer} stage={there.stage} size={STYLE_BADGE} />
            <Text style={s.styleName}>{t(STYLE_NAMES[id])}</Text>
          </Pressable>;
        })}
      </View>

      <SwitchRow label={t("Play a sound when you rank up")} value={settings.xp.sound}
        onChange={next => { void update({ xp: { sound: next } }); }} hint={t("The assistant rings a chime and congratulates you.")} />

      <Pressable onPress={erase} accessibilityRole="button" style={s.erase}><Text style={s.eraseText}>{t("Start again")}</Text></Pressable>
      </Collapsible>
    </>}
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  hero: { alignItems: "center", paddingVertical: 12, gap: 8 },
  rank: { color: c.foreground, fontSize: 20, lineHeight: 26, fontWeight: "800", marginTop: 6, textAlign: "center", alignSelf: "stretch" },
  track: { alignSelf: "stretch", height: 8, borderRadius: 4, backgroundColor: c.track, overflow: "hidden", marginTop: 4 },
  fill: { height: 8, borderRadius: 4, backgroundColor: c.primary },
  teaser: { color: c.mutedForeground, fontSize: 12, fontStyle: "italic", textAlign: "center" },
  path: { alignItems: "flex-start", paddingVertical: 6, paddingRight: 8 },
  pathStep: { flexDirection: "row", alignItems: "flex-start" },
  link: { width: 14, height: 2, borderRadius: 1, backgroundColor: c.track, marginTop: REALM_TILE / 2 - 1 },
  realm: { width: 76, alignItems: "center", gap: 4 },
  realmName: { color: c.mutedForeground, fontSize: 11, lineHeight: 14, fontWeight: "700", textAlign: "center" },
  realmNameNow: { color: c.primary },
  unknown: { width: REALM_TILE, height: REALM_TILE, borderRadius: REALM_TILE / 2, backgroundColor: c.primaryTint, alignItems: "center", justifyContent: "center" },
  unknownMark: { color: c.mutedForeground, fontSize: 18, fontWeight: "800" },
  styles: { flexDirection: "row", gap: 10, marginBottom: 6 },
  styleCard: { flex: 1, alignItems: "center", gap: 4, padding: 10, borderRadius: 14, borderWidth: 1, borderColor: c.hairline },
  styleCardOn: { borderColor: c.primary, borderWidth: 2, backgroundColor: c.primaryTint },
  styleName: { color: c.foreground, fontSize: 12, fontWeight: "800", textAlign: "center" },
  erase: { minHeight: MIN_TOUCH_TARGET, alignItems: "center", justifyContent: "center", marginTop: 16 },
  eraseText: { color: c.destructive, fontSize: 13, fontWeight: "700" },
});
