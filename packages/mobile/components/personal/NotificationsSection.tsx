import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLanguage } from "../../lib/language";
import { useSettings } from "../../lib/settings-context";
import { SNOOZE_OPTIONS, type Settings } from "../../lib/settings";
import { fillPlaceholders } from "../../lib/text-template";
import { ChoiceChips } from "../editor/ChoiceChips";
import { useFieldStyles } from "../editor/field-styles";
import { NotificationPermissionHint } from "./NotificationPermissionHint";
import { NotificationTimeFields } from "./NotificationTimeFields";
import { SwitchRow } from "./SwitchRow";

type NotificationSettings = Settings["notifications"];

const HIDE_TITLES_HINT = "Notifications say \"Upcoming task\" instead of the title.";

/** "Notifications": quiet hours, hidden titles, snooze length and the morning summary (settings.notifications). */
export function NotificationsSection() {
  const { t } = useLanguage();
  const { settings, update } = useSettings();
  const f = useFieldStyles();
  const n = settings.notifications;
  const write = (patch: Partial<NotificationSettings>) => { void update({ notifications: patch }); };
  const snoozeChoices = SNOOZE_OPTIONS.map(minutes => ({
    value: minutes,
    label: fillPlaceholders(t("{n} min"), { n: String(minutes) }),
  }));

  return <View style={styles.stack}>
    <NotificationPermissionHint />
    <SwitchRow label={t("Quiet hours")} hint={t("Reminders inside this window wait until it ends.")}
      value={n.quietEnabled} onChange={quietEnabled => write({ quietEnabled })} />
    {n.quietEnabled && <NotificationTimeFields
      fields={[
        { id: "quietFrom", label: t("QUIET FROM"), accessibilityLabel: t("Quiet hours start"), value: n.quietFrom },
        { id: "quietTo", label: t("QUIET UNTIL"), accessibilityLabel: t("Quiet hours end"), value: n.quietTo },
      ]}
      onChange={(id, value) => write(id === "quietFrom" ? { quietFrom: value } : { quietTo: value })} />}
    <SwitchRow label={t("Hide task titles in notifications")} hint={t(HIDE_TITLES_HINT)}
      value={n.hideTitles} onChange={hideTitles => write({ hideTitles })} />
    <View>
      <Text style={[f.label, styles.chipLabel]}>{t("SNOOZE LENGTH")}</Text>
      <ChoiceChips choices={snoozeChoices} value={n.snoozeMinutes} onChange={snoozeMinutes => write({ snoozeMinutes })} />
    </View>
    <SwitchRow label={t("Morning summary")} hint={t("A daily note with how many tasks you have today.")}
      value={n.summaryEnabled} onChange={summaryEnabled => write({ summaryEnabled })} />
    {n.summaryEnabled && <NotificationTimeFields
      fields={[{ id: "summaryTime", label: t("SUMMARY TIME"), accessibilityLabel: t("Summary time"), value: n.summaryTime }]}
      onChange={(_id, summaryTime) => write({ summaryTime })} />}
  </View>;
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  chipLabel: { marginTop: 0 },
});
