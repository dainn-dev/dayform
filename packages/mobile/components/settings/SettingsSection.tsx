import { View } from "react-native";
import { useLanguage } from "../../lib/language";
import { AccentPicker } from "../personal/AccentPicker";
import { PersonalCard } from "../personal/PersonalCard";
import { PERSONAL_SECTIONS } from "../personal/sections";
import { UpdateSection } from "../update/UpdateSection";
import { ArchiveSection } from "./ArchiveSection";
import { BackupSection } from "./BackupSection";
import { RecoverySection } from "./RecoverySection";
import { ThemeSwitch } from "./ThemeSwitch";

/**
 * The settings cards of the Personal tab, under the profile card: appearance and accent, the preference cards
 * registered in components/personal/sections.tsx, then updates, backup, archive and data recovery.
 */
export function SettingsSection() {
  const { t } = useLanguage();
  return <View>
    <PersonalCard title={t("Appearance")}>
      <ThemeSwitch />
      <AccentPicker />
    </PersonalCard>
    {PERSONAL_SECTIONS.map(({ key, title, Component }) => <PersonalCard key={key} title={t(title)}>
      <Component />
    </PersonalCard>)}
    <PersonalCard title={t("Updates")}><UpdateSection /></PersonalCard>
    <PersonalCard title={t("Backup")}><BackupSection /></PersonalCard>
    <PersonalCard title={t("Archive")}><ArchiveSection /></PersonalCard>
    <PersonalCard title={t("Data recovery")}><RecoverySection /></PersonalCard>
  </View>;
}
