import * as Updates from "expo-updates";
import type { OtaAdapter } from "./ota";

/**
 * Glue between lib/ota.ts and expo-updates (not unit tested: it only forwards calls; the checker guards every call).
 * `Updates.isEnabled` is false in development builds, Expo Go and web, which makes the checker report "unsupported".
 * A rollback to the embedded bundle counts as available content, and fetching it counts as a successful download.
 * Nothing here ever reloads the app: a downloaded update applies at the next launch.
 */
export const expoOtaAdapter: OtaAdapter = {
  isEnabled: () => Updates.isEnabled === true,
  async check() {
    const result = await Updates.checkForUpdateAsync();
    return { available: result.isAvailable || result.isRollBackToEmbedded };
  },
  async fetch() {
    const result = await Updates.fetchUpdateAsync();
    return { ok: result.isNew || result.isRollBackToEmbedded };
  },
  current: () => ({
    updateId: Updates.updateId,
    createdAt: Updates.createdAt,
    isEmbedded: Updates.isEmbeddedLaunch,
  }),
};
