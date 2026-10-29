// System-managed layout — extend in place, never rewrite from scratch.
// Keep the provider chain intact: ErrorBoundary → OneDollarStats → SafeArea → QueryClient.
// To switch navigation, replace only the <Slot /> line with <Stack /> or <Tabs />.
import { useEffect, type ReactNode } from "react";
import { Slot } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "../components/__ErrorBoundary";
import { RemindersBridge } from "../components/RemindersBridge";
import { SeriesExtender } from "../components/SeriesExtender";
import { UndoBar } from "../components/UndoBar";
import { OneDollarStatsProvider } from "../lib/__analytics";
import { isWeb, startWebSafeArea } from "../lib/__web-safe-area";
import { TasksProvider } from "../lib/tasks-context";
import { LanguageProvider } from "../lib/language";
import { ThemeProvider } from "../lib/theme-context";
import appJson from "../app.json";

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

export default function RootLayout() {
  useEffect(() => {
    if (isWeb) startWebSafeArea();
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
