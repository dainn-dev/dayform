import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { useThemedStyles, type Theme } from "../../hooks/use-theme";
import { useLanguage } from "../../lib/language";
import {
  clearWidgetBackground,
  getWidgetBackground,
  isWidgetSupported,
  MAX_BACKGROUND_VEIL,
  setWidgetBackground,
  setWidgetBackgroundVeil,
} from "../../modules/dayform-widget";
import { Button } from "../ui/Button";
import { HourStepper } from "./HourStepper";

const VEIL_STEP = 10;

/**
 * The widget's own picture behind its card. The picture is copied (shrunk) into the app's private files by the native
 * module, which also draws it; nothing about it is stored in the settings or leaves the device.
 */
export function WidgetBackgroundSection() {
  const { t } = useLanguage();
  const s = useThemedStyles(makeStyles);
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
      <Button label={t(state.hasPicture ? "Change picture" : "Choose picture")} disabled={busy} onPress={() => { void choose(); }} />
      {state.hasPicture && <Button variant="secondary" label={t("Remove picture")} disabled={busy} onPress={() => { void remove(); }} />}
    </View>
    {failed && <Text accessibilityRole="alert" style={s.error}>{t("That picture could not be used. Try another one.")}</Text>}
    {state.hasPicture && <HourStepper label={t("Picture fade")} valueText={`${state.veil}%`}
      decreaseLabel={t("Show more of the picture")} increaseLabel={t("Show less of the picture")}
      onDecrease={() => moveVeil(-VEIL_STEP)} onIncrease={() => moveVeil(VEIL_STEP)} />}
    {state.hasPicture && <Text style={s.hint}>{t("A higher fade keeps the task text easier to read.")}</Text>}
  </View>;
}

const makeStyles = (t: Theme) => {
  const c = t.colors;
  return StyleSheet.create({
    stack: { gap: 10, marginTop: t.space.md, paddingTop: t.space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.hairline },
    heading: { ...t.type.label, ...t.font.heavy, color: c.foreground },
    hint: { ...t.type.caption, ...t.font.regular, color: c.mutedForeground },
    buttons: { flexDirection: "row", flexWrap: "wrap", gap: t.space.sm },
    error: { ...t.type.meta, ...t.font.regular, color: c.destructive },
  });
};
