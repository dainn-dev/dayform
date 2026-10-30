import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";
import {
  clearWidgetBackground,
  getWidgetBackground,
  isWidgetSupported,
  MAX_BACKGROUND_VEIL,
  setWidgetBackground,
  setWidgetBackgroundVeil,
} from "../../modules/dayform-widget";
import { HourStepper } from "./HourStepper";

const VEIL_STEP = 10;

/**
 * The widget's own picture behind its card. The picture is copied (shrunk) into the app's private files by the native
 * module, which also draws it; nothing about it is stored in the settings or leaves the device.
 */
export function WidgetBackgroundSection() {
  const { t } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [state, setState] = useState(() => getWidgetBackground());
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!isWidgetSupported()) return null;

  const choose = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: "image/*", copyToCacheDirectory: true, multiple: false });
      const asset = picked.canceled ? null : picked.assets[0];
      if (!asset) return;
      const saved = await setWidgetBackground(asset.uri);
      // The copy the picker made in the cache is no longer needed once the module has its own.
      try {
        const cached = new File(asset.uri);
        if (cached.exists) cached.delete();
      } catch {
        // Best effort: the system clears the cache anyway.
      }
      if (saved) setState(getWidgetBackground());
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    if (await clearWidgetBackground()) setState(getWidgetBackground());
    else setFailed(true);
    setBusy(false);
  };

  const moveVeil = (delta: number) => {
    const next = Math.min(MAX_BACKGROUND_VEIL, Math.max(0, state.veil + delta));
    if (next === state.veil) return;
    setState({ ...state, veil: next });
    void setWidgetBackgroundVeil(next);
  };

  return <View style={s.stack}>
    <Text accessibilityRole="header" style={s.heading}>{t("Widget background")}</Text>
    <Text style={s.hint}>{t(state.hasPicture ? "Your picture is behind the widget." : "The widget uses the plain card. Pick a picture from your phone to put behind it.")}</Text>
    <View style={s.buttons}>
      <Pressable onPress={() => { void choose(); }} disabled={busy} accessibilityRole="button" style={[s.button, s.primary, busy && s.disabled]}>
        <Text style={s.primaryText}>{t(state.hasPicture ? "Change picture" : "Choose picture")}</Text>
      </Pressable>
      {state.hasPicture && <Pressable onPress={() => { void remove(); }} disabled={busy} accessibilityRole="button" style={[s.button, busy && s.disabled]}>
        <Text style={s.buttonText}>{t("Remove picture")}</Text>
      </Pressable>}
    </View>
    {failed && <Text accessibilityRole="alert" style={s.error}>{t("That picture could not be used. Try another one.")}</Text>}
    {state.hasPicture && <HourStepper label={t("Picture fade")} valueText={`${state.veil}%`}
      decreaseLabel={t("Show more of the picture")} increaseLabel={t("Show less of the picture")}
      onDecrease={() => moveVeil(-VEIL_STEP)} onIncrease={() => moveVeil(VEIL_STEP)} />}
    {state.hasPicture && <Text style={s.hint}>{t("A higher fade keeps the task text easier to read.")}</Text>}
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  stack: { gap: 10, marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.hairline },
  heading: { color: c.foreground, fontSize: 13, fontWeight: "800" },
  hint: { color: c.mutedForeground, fontSize: 11, lineHeight: 16 },
  buttons: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  button: { minHeight: 44, paddingHorizontal: 16, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: c.card, borderWidth: 1, borderColor: c.inputBorder },
  primary: { backgroundColor: c.primary, borderColor: c.primary },
  disabled: { opacity: 0.5 },
  buttonText: { color: c.foreground, fontSize: 13, fontWeight: "700" },
  primaryText: { color: c.onPrimary, fontSize: 13, fontWeight: "700" },
  error: { color: c.destructive, fontSize: 12 },
});
