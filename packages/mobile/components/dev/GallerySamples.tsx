import React from "react";
import { Pressable, StyleSheet, Text, TextInput, View, type TextStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { STYLES, TEXT_ROLES } from "../../constants/styles";
import type { Theme } from "../../lib/design-theme";

/**
 * Samples for the hidden design gallery (app/design-gallery.tsx). Every sample takes the preview `Theme` as a prop
 * instead of reading `useTheme()`, so the gallery can show any style and scheme without touching the user's settings.
 * They mirror the kit in components/ui; they are a visual check, not components to reuse in screens.
 */

const VI_SAMPLE = "Chào buổi sáng, Đạt — Họp nhóm lúc 09:00";
const EN_SAMPLE = "Good morning, Dat — Team meeting at 09:00";
const BUILT_IN = ["Focus", "Work", "Personal", "Wellness"] as const;

function txt(t: Theme, role: keyof Theme["type"], color: string, extra?: TextStyle): TextStyle {
  return { ...t.type[role], color, ...extra };
}

export function Section({ t, title, children }: { t: Theme; title: string; children: React.ReactNode }) {
  return <View style={{ gap: t.space.md, marginBottom: t.space.xxl }}>
    <Text accessibilityRole="header" style={txt(t, "micro", t.colors.mutedForeground)}>{title}</Text>
    {children}
  </View>;
}

function Swatch({ t, name, color, ink }: { t: Theme; name: string; color: string; ink?: string }) {
  return <View style={{ width: 96, gap: t.space.xs }}>
    <View style={[{ height: 48, borderRadius: t.radius.md, backgroundColor: color, alignItems: "center", justifyContent: "center" },
      { borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border }]}>
      {ink ? <Text style={txt(t, "label", ink)}>Aa</Text> : null}
    </View>
    <Text numberOfLines={1} style={txt(t, "caption", t.colors.foreground)}>{name}</Text>
  </View>;
}

export function Swatches({ t }: { t: Theme }) {
  const c = t.colors;
  const rows: Array<[string, string, string?]> = [
    ["background", c.background, c.foreground], ["card", c.card, c.foreground], ["foreground", c.foreground, c.background],
    ["muted", c.muted, c.mutedForeground], ["mutedForeground", c.mutedForeground], ["border", c.border], ["hairline", c.hairline],
    ["primary", c.primary, c.onPrimary], ["secondary", c.secondary, c.secondaryForeground], ["primarySoft", c.primarySoft, c.countText],
    ["primaryTint", c.primaryTint, c.countText], ["primaryTintStrong", c.primaryTintStrong, c.countText], ["primaryBorder", c.primaryBorder],
    ["destructive", c.destructive], ["errorBg", c.errorBg, c.errorBannerText], ["success", c.success], ["tealTint", c.tealTint, c.tealAccent],
    ["warning", c.warning], ["warningBg", c.warningBg, c.warningText], ["live", c.live], ["sun", c.sun], ["track", c.track],
  ];
  return <View style={{ gap: t.space.lg }}>
    <View style={styles.wrap}>{rows.map(([name, color, ink]) => <Swatch key={name} t={t} name={name} color={color} ink={ink} />)}</View>
    <View style={styles.wrap}>
      {BUILT_IN.map(id => {
        const tint = c.category[id];
        return <View key={id} style={{ width: 96, gap: t.space.xs }}>
          <View style={{ height: 48, borderRadius: t.radius.md, backgroundColor: tint.bg, flexDirection: "row", overflow: "hidden" }}>
            <View style={{ width: 4, backgroundColor: tint.accent }} />
            <Text style={txt(t, "label", tint.accent, { margin: t.space.sm })}>{id}</Text>
          </View>
          <Text style={txt(t, "caption", t.colors.mutedForeground)}>{id} tint</Text>
        </View>;
      })}
    </View>
  </View>;
}

export function TypeScale({ t }: { t: Theme }) {
  const spec = STYLES[t.style].type;
  return <View style={{ gap: t.space.lg }}>
    {TEXT_ROLES.map(role => <View key={role} style={{ gap: t.space.xxs }}>
      <Text style={txt(t, "caption", t.colors.mutedForeground)}>
        {`${role} · ${spec[role].family} ${spec[role].weight} · ${spec[role].size}/${spec[role].line}`}
      </Text>
      <Text style={txt(t, role, t.colors.foreground)}>{VI_SAMPLE}</Text>
      <Text style={txt(t, role, t.colors.foreground)}>{EN_SAMPLE}</Text>
    </View>)}
  </View>;
}

export function Radii({ t }: { t: Theme }) {
  const keys = ["xs", "sm", "md", "lg", "xl", "pill"] as const;
  return <View style={styles.wrap}>
    {keys.map(key => <View key={key} style={{ alignItems: "center", gap: t.space.xs }}>
      <View style={{ width: 64, height: 48, borderRadius: t.radius[key], backgroundColor: t.colors.primaryTint, borderWidth: 1, borderColor: t.colors.primaryBorder }} />
      <Text style={txt(t, "caption", t.colors.foreground)}>{`${key} ${t.radius[key] >= 999 ? "pill" : t.radius[key]}`}</Text>
    </View>)}
  </View>;
}

export function Elevations({ t }: { t: Theme }) {
  const levels = ["card", "raised", "overlay"] as const;
  return <View style={{ flexDirection: "row", gap: t.space.md }}>
    {levels.map(level => <View key={level} style={[{ flex: 1, height: 72, borderRadius: t.radius.lg, backgroundColor: t.colors.card,
      alignItems: "center", justifyContent: "center" }, t.elevation[level]]}>
      <Text style={txt(t, "label", t.colors.foreground)}>{level}</Text>
    </View>)}
  </View>;
}

type Variant = "primary" | "secondary" | "ghost" | "danger";

/** Same rules as components/ui/Button.tsx, on the preview theme. */
export function SampleButton({ t, label, variant, size }: { t: Theme; label: string; variant: Variant; size: "md" | "sm" }) {
  const c = t.colors;
  const outlined = variant === "secondary" && t.style !== "dayform";
  const fill = outlined ? c.card : { primary: c.primary, secondary: c.secondary, ghost: "transparent", danger: c.errorBg }[variant];
  const ink = outlined ? c.foreground : { primary: c.onPrimary, secondary: c.secondaryForeground, ghost: c.countText, danger: c.deleteText }[variant];
  return <Pressable accessibilityRole="button" style={({ pressed }) => [{
    minHeight: size === "md" ? 48 : 36, borderRadius: t.buttonRadius, backgroundColor: fill, paddingHorizontal: size === "md" ? t.space.xl : t.space.md,
    alignItems: "center", justifyContent: "center", opacity: pressed ? 0.82 : 1,
  }, outlined ? { borderWidth: 1, borderColor: c.border } : null]}>
    <Text numberOfLines={1} style={txt(t, "label", ink)}>{label}</Text>
  </Pressable>;
}

export function Buttons({ t }: { t: Theme }) {
  const variants: Variant[] = ["primary", "secondary", "ghost", "danger"];
  return <View style={{ gap: t.space.md }}>
    {(["md", "sm"] as const).map(size => <View key={size} style={styles.wrap}>
      {variants.map(variant => <SampleButton key={variant} t={t} variant={variant} size={size} label={`${variant} ${size}`} />)}
    </View>)}
  </View>;
}

/** Same rules as components/ui/Chip.tsx, on the preview theme. */
export function SampleChip({ t, label, selected = false, dot }: { t: Theme; label: string; selected?: boolean; dot?: string }) {
  const c = t.colors;
  const outlined = !selected && t.style !== "dayform";
  return <View style={[{ minHeight: 34, paddingHorizontal: t.space.md, borderRadius: t.radius.pill, flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: selected ? c.primary : outlined ? c.card : c.muted }, outlined ? { borderWidth: 1, borderColor: c.border } : null]}>
    {dot ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} /> : null}
    <Text numberOfLines={1} style={txt(t, "label", selected ? c.onPrimary : c.foreground)}>{label}</Text>
  </View>;
}

export function Chips({ t }: { t: Theme }) {
  return <View style={styles.wrap}>
    <SampleChip t={t} label="Selected" selected />
    <SampleChip t={t} label="Unselected" />
    <SampleChip t={t} label="Work" dot={t.colors.category.Work.accent} />
    <SampleChip t={t} label="Wellness" dot={t.colors.category.Wellness.accent} selected />
  </View>;
}

export function TaskCardSample({ t }: { t: Theme }) {
  const c = t.colors;
  const cat = c.category.Work;
  return <View style={[{ backgroundColor: c.card, borderRadius: t.radius.lg, padding: t.space.lg, flexDirection: "row", gap: t.space.md }, t.elevation.card]}>
    <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: c.checkBorder, marginTop: 2 }} />
    <View style={{ flex: 1, gap: t.space.xs }}>
      <Text style={txt(t, "subtitle", c.cardForeground)}>Họp nhóm sản phẩm</Text>
      <Text style={txt(t, "meta", c.cardMeta)}>09:00 – 10:00 · 60 min · 1/3</Text>
      <View style={{ flexDirection: "row", gap: t.space.sm, marginTop: t.space.xs }}>
        <View style={{ backgroundColor: cat.bg, borderRadius: t.radius.pill, paddingHorizontal: t.space.sm, paddingVertical: t.space.xxs }}>
          <Text style={txt(t, "caption", cat.accent)}>Work</Text>
        </View>
        <View style={{ backgroundColor: c.warningBg, borderRadius: t.radius.pill, paddingHorizontal: t.space.sm, paddingVertical: t.space.xxs }}>
          <Text style={txt(t, "caption", c.overlapText)}>⚠ Overlap</Text>
        </View>
      </View>
    </View>
    <Ionicons name="notifications-outline" size={18} color={c.mutedForeground} />
  </View>;
}

export function TimelineBlockSample({ t }: { t: Theme }) {
  const c = t.colors;
  const hours = ["09:00", "10:00", "11:00"];
  return <View style={{ flexDirection: "row", gap: t.space.sm }}>
    <View style={{ width: 44 }}>
      {hours.map(h => <Text key={h} style={txt(t, "caption", c.hourLabel, { height: 64 })}>{h}</Text>)}
    </View>
    <View style={{ flex: 1, gap: t.space.xs, paddingTop: 6 }}>
      {(["Focus", "Personal"] as const).map((id, i) => {
        const cat = c.category[id];
        return <View key={id} style={{ height: i === 0 ? 90 : 56, backgroundColor: cat.bg, borderRadius: t.radius.md, flexDirection: "row", overflow: "hidden" }}>
          <View style={{ width: 4, backgroundColor: cat.accent }} />
          <View style={{ flex: 1, padding: t.space.sm, gap: t.space.xxs }}>
            <Text numberOfLines={1} style={txt(t, "label", c.foreground)}>{i === 0 ? "Viết báo cáo quý" : "Đi bộ"}</Text>
            <Text numberOfLines={1} style={txt(t, "caption", c.eventMeta)}>{i === 0 ? "09:00 – 10:30 · Focus" : "10:40 – 11:20 · Personal"}</Text>
          </View>
        </View>;
      })}
    </View>
  </View>;
}

export function InputSample({ t }: { t: Theme }) {
  const c = t.colors;
  return <View style={{ gap: t.space.xs }}>
    <Text style={txt(t, "label", c.labelText)}>Title</Text>
    <TextInput placeholder="Tên công việc / Task name" placeholderTextColor={c.placeholder}
      style={[txt(t, "body", c.foreground), { borderWidth: 1, borderColor: c.inputBorder, borderRadius: t.radius.md, backgroundColor: c.card,
        paddingHorizontal: t.space.md, minHeight: 48 }]} />
    <Text style={txt(t, "caption", c.errorMessage)}>Error message sample</Text>
  </View>;
}

const styles = StyleSheet.create({ wrap: { flexDirection: "row", flexWrap: "wrap", gap: 12 } });
