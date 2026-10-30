import { useEffect } from "react";
import { Slot } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { NamePrompt } from "../components/onboarding/NamePrompt";
import { NotificationActions } from "../components/NotificationActions";
import { RemindersBridge } from "../components/RemindersBridge";
import { SeriesExtender } from "../components/SeriesExtender";
import { SnapshotScheduler } from "../components/SnapshotScheduler";
import { UndoBar } from "../components/UndoBar";
import { AssistantOverlay } from "../components/assistant/AssistantOverlay";
import { OtaAutoCheck } from "../components/OtaAutoCheck";
import { UpdatePrompt } from "../components/update/UpdatePrompt";
import { OtaProvider } from "../lib/ota-context";
import { WidgetSync } from "../components/WidgetSync";
import { CategoriesProvider, useCategories } from "../lib/categories-context";
import { SpecialDaysProvider } from "../lib/special-days-context";
import { CycleProvider } from "../lib/cycle-context";
import { SettingsProvider, useSettings } from "../lib/settings-context";
import { TasksProvider } from "../lib/tasks-context";
import { UpdateProvider } from "../lib/update-context";
import { LanguageProvider, useLanguage } from "../lib/language";
import { ThemeProvider, useThemePreference } from "../lib/theme-context";

// Keep the native splash up until the stored theme and language are read, so the first frame is never the wrong one.
SplashScreen.preventAutoHideAsync().catch(() => {
  // The splash was already hidden (e.g. fast refresh); nothing to hold.
});

/** If storage never answers, show the app anyway after this long. */
const SPLASH_SAFETY_TIMEOUT_MS = 2000;

let splashHidden = false;
function hideSplashOnce() {
  if (splashHidden) return;
  splashHidden = true;
  SplashScreen.hideAsync().catch(() => {
    // Already hidden or no native splash on this platform.
  });
}

/** Hides the splash as soon as the theme, language and settings have loaded their stored value. Must sit inside all three. */
function AppReadyGate() {
  const themeReady = useThemePreference().ready;
  const languageReady = useLanguage().ready;
  const settingsReady = useSettings().ready;
  const categoriesReady = useCategories().ready;
  useEffect(() => {
    if (themeReady && languageReady && settingsReady && categoriesReady) hideSplashOnce();
  }, [themeReady, languageReady, settingsReady, categoriesReady]);
  return null;
}

/** Feeds the home-screen widget once the settings are loaded, so a hidden-titles choice is never briefly ignored. */
function WidgetBridge() {
  const { settings, ready } = useSettings();
  return ready ? <WidgetSync showTitles={settings.widget.showTitles} pet={settings.pet.kind} petWalks={settings.pet.walks} /> : null;
}

// Provider chain: ErrorBoundary → SafeArea → Settings → Theme → Language → Tasks → Updates → Ota → Slot (+ UndoBar, the assistant, helpers, the UpdatePrompt dialog and the OTA auto-check).
export default function RootLayout() {
  // Lives outside the providers so a provider that fails to mount can never leave the splash stuck.
  useEffect(() => {
    const timer = setTimeout(hideSplashOnce, SPLASH_SAFETY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <SettingsProvider>
          <ThemeProvider>
            <LanguageProvider>
              <CategoriesProvider>
              <SpecialDaysProvider>
              <CycleProvider>
              <TasksProvider>
                <UpdateProvider>
                  <OtaProvider>
                    <AppReadyGate />
                    <NamePrompt />
                    <Slot />
                    <UndoBar />
                    <AssistantOverlay />
                    <RemindersBridge />
                    <NotificationActions />
                    <SeriesExtender />
                    <SnapshotScheduler />
                    <WidgetBridge />
                    <UpdatePrompt />
                    <OtaAutoCheck />
                  </OtaProvider>
                </UpdateProvider>
              </TasksProvider>
              </CycleProvider>
              </SpecialDaysProvider>
              </CategoriesProvider>
            </LanguageProvider>
          </ThemeProvider>
        </SettingsProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
