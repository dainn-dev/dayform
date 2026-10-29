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
import { UpdatePrompt } from "../components/update/UpdatePrompt";
import { WidgetSync } from "../components/WidgetSync";
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
  useEffect(() => {
    if (themeReady && languageReady && settingsReady) hideSplashOnce();
  }, [themeReady, languageReady, settingsReady]);
  return null;
}

/** Feeds the home-screen widget once the settings are loaded, so a hidden-titles choice is never briefly ignored. */
function WidgetBridge() {
  const { settings, ready } = useSettings();
  return ready ? <WidgetSync showTitles={settings.widget.showTitles} /> : null;
}

// Provider chain: ErrorBoundary → SafeArea → Settings → Theme → Language → Tasks → Updates → Slot (+ UndoBar, helpers and the UpdatePrompt dialog).
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
              <TasksProvider>
                <UpdateProvider>
                  <AppReadyGate />
                  <NamePrompt />
                  <Slot />
                  <UndoBar />
                  <RemindersBridge />
                  <NotificationActions />
                  <SeriesExtender />
                  <SnapshotScheduler />
                  <WidgetBridge />
                  <UpdatePrompt />
                </UpdateProvider>
              </TasksProvider>
            </LanguageProvider>
          </ThemeProvider>
        </SettingsProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
