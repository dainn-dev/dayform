import React from "react";
import { router } from "expo-router";
import { View } from "react-native";
import { useLanguage } from "../../lib/language";
import { menuGroups, rowHref, summaryFor } from "../../lib/settings-menu";
import { MenuGroupCard } from "./MenuGroupCard";
import { MenuRowItem } from "./MenuRowItem";
import { useMenuInputs } from "./use-menu-inputs";

/** The grouped menu under the profile header of the Personal tab. Each row opens its own page. */
export function PersonalMenu() {
  const { t } = useLanguage();
  const inputs = useMenuInputs();
  return <View>
    {menuGroups(inputs).map(group => <MenuGroupCard key={group.id} title={t(group.title)}>
      {group.rows.map((row, index) => <MenuRowItem key={row.id} title={t(row.title)} summary={summaryFor(row.id, inputs)}
        icon={row.icon} tint={row.tint} divider={index > 0} onPress={() => router.push(rowHref(row.id, inputs))} />)}
    </MenuGroupCard>)}
  </View>;
}
