import { useEffect } from "react";
import { Slot } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { NotificationActions } from "../components/NotificationActions";
import { RemindersBridge } from "../components/RemindersBridge";
import { SeriesExtender } from "../components/SeriesExtender";
import { SnapshotScheduler } from "../components/SnapshotScheduler";
import { UndoBar } from "../components/UndoBar";
import { UpdatePrompt } from "../components/update/UpdatePrompt";
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

/** Hides the splash as soon as both providers have loaded their stored value. Must sit inside both. */
function AppReadyGate() {
  const themeReady = useThemePreference().ready;
  const languageReady = useLanguage().ready;
  useEffect(() => {
    if (themeReady && languageReady) hideSplashOnce();
  }, [themeReady, languageReady]);
  return null;
}

// Provider chain: ErrorBoundary → SafeArea → Theme → Language → Tasks → Updates → Slot (+ UndoBar, helpers and the UpdatePrompt dialog).
export default function RootLayout() {
  // Lives outside the providers so a provider that fails to mount can never leave the splash stuck.
  useEffect(() => {
    const timer = setTimeout(hideSplashOnce, SPLASH_SAFETY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <ThemeProvider>
          <LanguageProvider>
            <TasksProvider>
              <UpdateProvider>
                <AppReadyGate />
                <Slot />
                <UndoBar />
                <RemindersBridge />
                <NotificationActions />
                <SeriesExtender />
                <SnapshotScheduler />
                <UpdatePrompt />
              </UpdateProvider>
            </TasksProvider>
          </LanguageProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
