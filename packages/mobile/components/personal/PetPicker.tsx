import React, { useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { PET_CHOICES } from "../../lib/pet";
import { PET_PREVIEW_FRAMES } from "../../lib/pet-images";
import type { PetKind } from "../../lib/settings";

/** The animals on offer; "No pet" is the Pet switch, not a card. */
type Animal = Exclude<PetKind, "off">;

type Props = {
  value: PetKind;
  /** Already translated labels, by pet kind. */
  labels: Readonly<Record<PetKind, string>>;
  onChange: (kind: Animal) => void;
};

const ANIMALS = PET_CHOICES.map(choice => choice.value).filter((kind): kind is Animal => kind !== "off");
const FRAME_MS = 140;
const SPRITE_SIZE = 64;

/** True while the system asks for less motion; the picked pet then stands still instead of walking. */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (alive) setReduced(value); }).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => { alive = false; subscription.remove(); };
  }, []);
  return reduced;
}

/** The frame to show now: it steps through `count` frames while `active`, and rests on the first one otherwise. */
function useWalkFrame(count: number, active: boolean): number {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!active || count < 2) { setFrame(0); return; }
    const timer = setInterval(() => setFrame(current => (current + 1) % count), FRAME_MS);
    return () => clearInterval(timer);
  }, [active, count]);
  return frame;
}

/**
 * The pets as cards with their picture, so the user sees the animal before choosing it: the picked one walks, the
 * others stand on their first frame. Every frame stays mounted (the hidden ones at zero opacity) so a step never waits
 * for an image to decode and the sprite does not flicker.
 */
export function PetPicker({ value, labels, onChange }: Props) {
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const reducedMotion = useReducedMotion();
  return <View accessibilityRole="radiogroup" style={s.grid}>
    {ANIMALS.map(kind => <PetCard key={kind} kind={kind} label={labels[kind]} selected={kind === value}
      walking={!reducedMotion} colors={colors} onPress={() => onChange(kind)} />)}
  </View>;
}

type CardProps = { kind: Animal; label: string; selected: boolean; walking: boolean; colors: ThemeColors; onPress: () => void };

function PetCard({ kind, label, selected, walking, colors, onPress }: CardProps) {
  const s = useMemo(() => makeStyles(colors), [colors]);
  const frames = PET_PREVIEW_FRAMES[kind];
  const frame = useWalkFrame(frames.length, selected && walking);
  return <Pressable onPress={onPress} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: selected }}
    style={[s.card, selected && s.cardActive]}>
    <View style={s.stage}>
      {frames.map((source, index) => <Image key={index} source={source} accessible={false} fadeDuration={0} resizeMode="contain"
        style={[s.sprite, index !== frame && s.hidden]} />)}
    </View>
    <Text numberOfLines={1} style={[s.label, selected && { color: colors.primary }]}>{label}</Text>
  </Pressable>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  card: { flexGrow: 1, flexBasis: "30%", minWidth: 92, alignItems: "center", gap: 6, paddingVertical: 10, paddingHorizontal: 8, backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.inputBorder },
  cardActive: { backgroundColor: c.primaryTint, borderColor: c.primaryBorder },
  stage: { width: SPRITE_SIZE, height: SPRITE_SIZE, alignItems: "center", justifyContent: "center" },
  sprite: { position: "absolute", width: SPRITE_SIZE, height: SPRITE_SIZE },
  hidden: { opacity: 0 },
  label: { color: c.foreground, fontSize: 12, fontWeight: "700" },
});
