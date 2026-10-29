import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLanguage } from "../../lib/language";
import { useColors } from "../../hooks/use-colors";
import { TAB_BAR_PADDING_TOP, tabBarHeight } from "../../lib/shell-layout";

export default function TabLayout() {
  const { t } = useLanguage();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        // An explicit height replaces React Navigation's own (inset-aware) one, so the system navigation
        // inset (~24dp gesture bar, ~48dp 3-button nav, edge-to-edge) must be added here, not just padded.
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          height: tabBarHeight(insets.bottom),
          paddingTop: TAB_BAR_PADDING_TOP,
          paddingBottom: insets.bottom,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: "700" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("Timeline"),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "calendar" : "calendar-outline"} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: t("Tasks"),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "checkbox" : "checkbox-outline"} size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
