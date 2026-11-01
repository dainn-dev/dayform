import React, { useMemo } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";
import { fill } from "../../lib/assistant-answers";
import { word } from "../../lib/ladder-words";
import { formatNumber, goalLine, rankLabel } from "../../lib/rank-label";
import { DAILY_CAP, MAX_WORK_HOURS, MIN_REST_HOURS, XP_PER_HOUR } from "../../lib/xp";
import { LADDERS, LADDER_STYLES, LAYERS, STAGES, breakthroughCost, rankOf, realmStart, toNextRealm } from "../../lib/realm";
import { useSettings } from "../../lib/settings-context";
import { fillPlaceholders } from "../../lib/text-template";
import { useXp } from "../../lib/xp-context";
import { RankBadge } from "../cultivation/RankBadge";
import { SwitchRow } from "./SwitchRow";

const HERO = 96;
const CELL = 40;
const REALM_TILE = 36;
const STYLE_BADGE = 44;

/** The names of the two styles in the picker. */
const STYLE_NAMES = { cultivation: "Cultivation style", engineer: "Engineer style" } as const;

/** "Rank": the style, the rank, the day's experience, the streak, rest days left, every rank of the current track, and the switches. */
export function CultivationSection() {
  const { t, language } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { settings, update } = useSettings();
  const xp = useXp();
  const { rank, state, restLeft, todayXp, ladder, style } = xp;
  const w = (key: string) => t(word(style, key));

  const erase = () => Alert.alert(w("Erase your experience and realm?"), t("This cannot be undone. Your tasks are not touched."), [
    { text: t("Cancel"), style: "cancel" },
    { text: t("Erase"), style: "destructive", onPress: () => { void xp.reset(); } },
  ]);

  const lang = language === "vi" ? "vi" : "en";
  const num = (value: number) => formatNumber(value, lang);
  const label = rankLabel(rank, t, ladder);
  const progress = fillPlaceholders(w("{xp} experience"), { xp: num(state.total) });
  const goal = goalLine(rank, state.total, t, lang, ladder);
  const goalText = goal ? fill(t(goal.text), goal.vars) : w("The highest realm");
  // The long road to the next track: how far through this one, and what is still missing.
  const missing = toNextRealm(state.total, rank, ladder);
  const nextTrack = ladder.tracks[rank.realm + 1];
  const realmSpan = nextTrack ? realmStart(rank.realm + 1, ladder) - realmStart(rank.realm, ladder) : 0;
  const realmProgress = realmSpan > 0 ? Math.min(1, (state.total - realmStart(rank.realm, ladder)) / realmSpan) : 1;
  // Every step of the current track up to the current one is reached; later ones are shown faint.
  const reached = (layer: number, stage: number) => layer < rank.layer || (layer === rank.layer && stage <= rank.stage);

  return <View>
    <SwitchRow label={w("Cultivation is on")} value={settings.xp.enabled}
      onChange={next => { void update({ xp: { enabled: next } }); }}
      hint={w("Finished tasks earn experience and raise your realm. A day without a finished task is a rest day (one per week, four per month); more than that costs experience, and many in a row can lower your realm. Tasks added after their day do not count.")} />

    {settings.xp.enabled && <>
      <Text style={s.heading}>{t("Style")}</Text>
      <View style={s.styles} accessibilityRole="radiogroup">
        {LADDER_STYLES.map(id => {
          const other = LADDERS[id];
          const there = rankOf(state.total, other);
          const chosen = id === style;
          return <Pressable key={id} onPress={() => { void update({ xp: { style: id } }); }} accessibilityRole="radio" accessibilityState={{ checked: chosen }}
            accessibilityLabel={`${t(STYLE_NAMES[id])}: ${rankLabel(there, t, other)}`} style={[s.styleCard, chosen && s.styleCardOn]}>
            <RankBadge style={id} realm={there.realm} layer={there.layer} stage={there.stage} size={STYLE_BADGE} />
            <Text style={s.styleName}>{t(STYLE_NAMES[id])}</Text>
            <Text style={s.styleRank} numberOfLines={2}>{rankLabel(there, t, other)}</Text>
          </Pressable>;
        })}
      </View>
      <Text style={s.meta}>{t("The experience is the same in both styles; only the names and pictures change.")}</Text>

      <SwitchRow label={t("Play a sound when you rank up")} value={settings.xp.sound}
        onChange={next => { void update({ xp: { sound: next } }); }} hint={t("The assistant rings a chime and congratulates you.")} />

      <View style={s.hero} accessible accessibilityLabel={`${label}. ${progress}`}>
        <RankBadge style={style} realm={rank.realm} layer={rank.layer} stage={rank.stage} size={HERO} />
        <Text style={s.rank}>{label}</Text>
        <Text style={s.bigXp}>{progress}</Text>
        <View style={s.track}><View style={[s.fill, { width: `${Math.round(rank.progress * 100)}%` }]} /></View>
        {rank.next !== null && <View style={s.range}>
          <Text style={s.rangeText}>{num(rank.floor)}</Text>
          <Text style={s.rangeText}>{num(rank.next)}</Text>
        </View>}
        <Text style={s.goal}>{goalText}</Text>
      </View>

      {missing !== null && nextTrack && <View style={s.gate}>
        <Text style={s.gateTitle}>{rank.breakthrough
          ? fillPlaceholders(w("Gathering strength to break through to {realm}"), { realm: t(nextTrack) })
          : `${w("Breakthrough")} · ${t(nextTrack)}`}</Text>
        <View style={s.track}><View style={[s.fill, { width: `${Math.round(realmProgress * 100)}%` }]} /></View>
        <Text style={s.meta}>{fillPlaceholders(w("Reaching {realm} takes {n} more experience. The last {gate} of it is the breakthrough, which only fills once you reach layer 9, perfection."), {
          realm: t(nextTrack), n: num(missing), gate: num(breakthroughCost(rank.realm, ladder)),
        })}</Text>
      </View>}

      <View style={s.stats}>
        <View style={s.stat}><Text style={s.statLabel}>{t("Today")}</Text><Text style={s.statValue}>{fillPlaceholders(t("{n} / {cap} today"), { n: num(todayXp), cap: num(DAILY_CAP) })}</Text></View>
        <View style={s.stat}>
          <Text style={s.statLabel}>{t("Streak")}</Text>
          <Text style={s.statValue}>{fillPlaceholders(t("{n} days"), { n: String(state.streak) })}</Text>
          <Text style={s.statSub}>{fillPlaceholders(t("Best {n}"), { n: String(state.best) })}</Text>
        </View>
        <View style={s.stat}>
          <Text style={s.statLabel}>{t("Rest days")}</Text>
          <Text style={s.statSub}>{fillPlaceholders(t("{week} this week, {month} this month"), { week: String(restLeft.week), month: String(restLeft.month) })}</Text>
        </View>
      </View>

      <Text style={s.meta}>{fillPlaceholders(t("A day gives at most {cap} experience: {rate} per hour of tasks, up to {work} hours, so you always keep {rest} hours to rest."), {
        cap: num(DAILY_CAP), rate: String(XP_PER_HOUR), work: String(MAX_WORK_HOURS), rest: String(MIN_REST_HOURS),
      })}</Text>

      <Text style={s.heading}>{w("Realms")}</Text>
      <View style={s.realms}>
        {ladder.tracks.map((name, track) => <View key={name} style={s.realm} accessible accessibilityLabel={`${t(name)}${track > rank.realm ? `. ${t("Not reached yet")}` : ""}`}>
          <RankBadge style={style} realm={track} layer={1} stage={0} size={REALM_TILE} dim={track > rank.realm} />
          <Text style={[s.realmName, track === rank.realm && s.realmNameNow]} numberOfLines={1}>{t(name)}</Text>
        </View>)}
      </View>

      <Text style={s.heading}>{`${t("All ranks")} · ${t(ladder.tracks[rank.realm])}`}</Text>
      {Array.from({ length: LAYERS }, (_, index) => index + 1).map(layer => <View key={layer} style={s.layerRow}>
        <Text style={s.layerLabel}>{fillPlaceholders(w("Layer {n}"), { n: String(layer) })}</Text>
        {Array.from({ length: STAGES }, (_, stage) => <View key={stage} style={[s.cell, layer === rank.layer && stage === rank.stage && s.cellNow]}>
          <RankBadge style={style} realm={rank.realm} layer={layer} stage={stage} size={CELL} dim={!reached(layer, stage)} />
        </View>)}
      </View>)}

      <Pressable onPress={erase} accessibilityRole="button" style={s.erase}><Text style={s.eraseText}>{t("Start again")}</Text></Pressable>
    </>}
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  styles: { flexDirection: "row", gap: 10, marginBottom: 6 },
  styleCard: { flex: 1, alignItems: "center", gap: 4, padding: 10, borderRadius: 14, borderWidth: 1, borderColor: c.hairline },
  styleCardOn: { borderColor: c.primary, borderWidth: 2, backgroundColor: c.primaryTint },
  styleName: { color: c.foreground, fontSize: 12, fontWeight: "800", textAlign: "center" },
  styleRank: { color: c.mutedForeground, fontSize: 10, textAlign: "center" },
  hero: { alignItems: "center", paddingVertical: 14, gap: 6 },
  rank: { color: c.foreground, fontSize: 18, fontWeight: "800", marginTop: 6, textAlign: "center" },
  track: { alignSelf: "stretch", height: 8, borderRadius: 4, backgroundColor: c.track, overflow: "hidden", marginTop: 4 },
  fill: { height: 8, borderRadius: 4, backgroundColor: c.primary },
  meta: { color: c.mutedForeground, fontSize: 12, lineHeight: 17 },
  bigXp: { color: c.foreground, fontSize: 26, fontWeight: "900", letterSpacing: -0.5 },
  range: { alignSelf: "stretch", flexDirection: "row", justifyContent: "space-between" },
  rangeText: { color: c.mutedForeground, fontSize: 11, fontWeight: "700" },
  goal: { color: c.foreground, fontSize: 13, fontWeight: "700", textAlign: "center", marginTop: 4 },
  gate: { backgroundColor: c.primaryTint, borderRadius: 12, padding: 12, gap: 6, marginTop: 10 },
  gateTitle: { color: c.primary, fontSize: 12, fontWeight: "800" },
  stats: { flexDirection: "row", gap: 8, marginTop: 4 },
  stat: { flex: 1, backgroundColor: c.primaryTint, borderRadius: 12, padding: 10, gap: 2 },
  statLabel: { color: c.labelText, fontSize: 10, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase" },
  statValue: { color: c.foreground, fontSize: 14, fontWeight: "800" },
  statSub: { color: c.mutedForeground, fontSize: 11 },
  heading: { color: c.labelText, fontSize: 10, fontWeight: "800", letterSpacing: 1.2, textTransform: "uppercase", marginTop: 18, marginBottom: 8 },
  realms: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  realm: { width: 62, alignItems: "center", gap: 4 },
  realmName: { color: c.mutedForeground, fontSize: 10, fontWeight: "700", textAlign: "center" },
  realmNameNow: { color: c.primary },
  layerRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  layerLabel: { width: 52, color: c.mutedForeground, fontSize: 11, fontWeight: "700" },
  cell: { width: CELL + 6, height: CELL + 6, alignItems: "center", justifyContent: "center", borderRadius: (CELL + 6) / 2 },
  cellNow: { borderWidth: 2, borderColor: c.primary },
  erase: { minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: 16 },
  eraseText: { color: c.destructive, fontSize: 13, fontWeight: "700" },
});
