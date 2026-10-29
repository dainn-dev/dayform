// System-managed layout — extend in place, never rewrite from scratch.
// Keep the provider chain intact: ErrorBoundary → OneDollarStats → SafeArea → QueryClient.
// To switch navigation, replace only the <Slot /> line with <Stack /> or <Tabs />.
import { useEffect, type ReactNode } from "react";
import { Slot } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "../components/__ErrorBoundary";
import { RemindersBridge } from "../components/RemindersBridge";
import { SeriesExtender } from "../components/SeriesExtender";
import { UndoBar } from "../components/UndoBar";
import { OneDollarStatsProvider } from "../lib/__analytics";
import { isWeb, startWebSafeArea } from "../lib/__web-safe-area";
import { TasksProvider } from "../lib/tasks-context";
import { LanguageProvider, useLanguage } from "../lib/language";
import { ThemeProvider, useThemePreference } from "../lib/theme-context";
import appJson from "../app.json";

// Keep the native splash up until the stored theme and language are read, so the first frame is never the wrong one.
SplashScreen.preventAutoHideAsync().catch(() => {
  // The splash was already hidden (e.g. fast refresh); nothing to hold.
});

/** If storage never answers, show the app anyway after this long. */
const SPLASH_SAFETY_TIMEOUT_MS = 2000;

const queryClient = new QueryClient();

const applicationId = appJson.expo.extra.applicationId ?? "";
const hostname = applicationId ? `${applicationId}-mobile` : "localhost";

// Dayform is local-first: native builds send no analytics unless app.json `extra.analytics` is true.
// The web preview keeps the Runable analytics provider.
const analyticsEnabled = isWeb || appJson.expo.extra.analytics === true;

function AnalyticsGate({ children }: { children: ReactNode }) {
  if (!analyticsEnabled) return <>{children}</>;
  return (
    <OneDollarStatsProvider
      config={{
        hostname,
        collectorUrl: "https://r.lilstts.com/events",
        devmode: true,
      }}
    >
      {children}
    </OneDollarStatsProvider>
  );
}

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

export default function RootLayout() {
  useEffect(() => {
    if (isWeb) startWebSafeArea();
  }, []);

  // Lives outside the providers so a provider that fails to mount can never leave the splash stuck.
  useEffect(() => {
    const timer = setTimeout(hideSplashOnce, SPLASH_SAFETY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <ErrorBoundary>
      {/* Runable analytics provider (gated by AnalyticsGate) — keep it in the chain */}
      <AnalyticsGate>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <ThemeProvider>
              <LanguageProvider>
                <TasksProvider>
                  <AppReadyGate />
                  <Slot />
                  <UndoBar />
                  <RemindersBridge />
                  <SeriesExtender />
                </TasksProvider>
              </LanguageProvider>
            </ThemeProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </AnalyticsGate>
    </ErrorBoundary>
  );
}
