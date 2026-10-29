import { useSafeAreaInsets } from "react-native-safe-area-context";
import { tabBarHeight } from "@/lib/shell-layout";

/**
 * Full height of the bottom tab bar including the system navigation inset (gesture bar or 3-button nav).
 * Use it to place anything that floats above the bar when you are outside the tab navigator
 * (inside a tab screen the scene already ends at the bar, so FABs only need their own margin).
 */
export function useTabBarHeight(): number {
  return tabBarHeight(useSafeAreaInsets().bottom);
}
