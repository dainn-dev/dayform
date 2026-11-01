import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { fill } from "../../lib/assistant-answers";
import { useLanguage } from "../../lib/language";
import { word } from "../../lib/ladder-words";
import { formatNumber, goalLine, rankLabel } from "../../lib/rank-label";
import { fillPlaceholders } from "../../lib/text-template";
import { useXp } from "../../lib/xp-context";
import { RankBadge } from "../cultivation/RankBadge";

const BADGE = 64;

/**
 * The rank on the Personal tab: picture and name, the experience in numbers, the progress bar and what is still missing for
 * the next step. Opens the Rank page.
 */
export function CultivationCard() {
  const { t, language } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { enabled, ready, rank, state, ladder, style } = useXp();
  if (!ready || !enabled) return null;
  const w = (key: string) => t(word(style, key));
  const label = rankLabel(rank, t, ladder);
  const lang = language === "vi" ? "vi" : "en";
  const total = fillPlaceholders(w("{xp} experience"), { xp: formatNumber(state.total, lang) });
  const goal = goalLine(rank, state.total, t, lang, ladder);
  const goalText = goal ? fill(t(goal.text), goal.vars) : w("The highest realm");
  return <Pressable onPress={() => router.push("/settings/cultivation")} accessibilityRole="button"
    accessibilityLabel={`${w("Cultivation")}: ${label}. ${total}. ${goalText}`} style={s.card}>
    <RankBadge style={style} realm={rank.realm} layer={rank.layer} stage={rank.stage} size={BADGE} />
    <View style={s.body}>
      <Text style={s.kicker}>{w("Cultivation")}</Text>
      <Text style={s.title} numberOfLines={2}>{label}</Text>
      {rank.breakthrough && <Text style={s.gather} numberOfLines={2}>
        {fillPlaceholders(w("Gathering strength to break through to {realm}"), { realm: t(ladder.tracks[rank.realm + 1] ?? "") })}
      </Text>}
      <View style={s.track} accessible={false}><View style={[s.fill, { width: `${Math.round(rank.progress * 100)}%` }]} /></View>
      <View style={s.numbers}>
        <Text style={s.total}>{total}</Text>
        {state.streak > 0 && <Text style={s.streak}>{fillPlaceholders(t("{n} days"), { n: String(state.streak) })}</Text>}
      </View>
      <Text style={s.goal} numberOfLines={2}>{goalText}</Text>
    </View>
  </Pressable>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: c.card, borderRadius: 17, padding: 14, marginTop: 8 },
  body: { flex: 1 },
  kicker: { color: c.labelText, fontSize: 10, fontWeight: "800", letterSpacing: 1.2, textTransform: "uppercase" },
  title: { color: c.foreground, fontSize: 16, fontWeight: "800", marginTop: 2 },
  gather: { color: c.primary, fontSize: 11, fontWeight: "700", marginTop: 2 },
  track: { height: 6, borderRadius: 3, backgroundColor: c.track, overflow: "hidden", marginTop: 8 },
  fill: { height: 6, borderRadius: 3, backgroundColor: c.primary },
  numbers: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 6 },
  total: { color: c.foreground, fontSize: 13, fontWeight: "800" },
  streak: { color: c.mutedForeground, fontSize: 11, fontWeight: "700" },
  goal: { color: c.mutedForeground, fontSize: 11, lineHeight: 15, marginTop: 2 },
});
