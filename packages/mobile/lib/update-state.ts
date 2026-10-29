import { z } from "zod";
import type { KeyValueStorage } from "./task-storage";

export const UPDATE_STORAGE_KEY = "dayform.update.v1";
const MAX_SKIPPED_LENGTH = 40;

export type UpdateState = {
  /** Check on launch (at most once per interval). */
  auto: boolean;
  /** Epoch ms of the last check that reached the server. */
  lastCheckAt: number | null;
  /** Version the user chose "Skip this version" for. */
  skipped: string | null;
  /** Epoch ms before which the automatic check stays quiet after a network error. */
  retryAt: number | null;
};
export type SaveUpdateStateResult = { ok: true } | { ok: false; reason: "write-failed" };

export const DEFAULT_UPDATE_STATE: UpdateState = { auto: true, lastCheckAt: null, skipped: null, retryAt: null };

// Each field recovers on its own so one bad value does not reset the others.
const stateSchema = z.object({
  auto: z.boolean().catch(DEFAULT_UPDATE_STATE.auto),
  lastCheckAt: z.number().finite().min(0).nullable().catch(null),
  skipped: z.string().min(1).max(MAX_SKIPPED_LENGTH).nullable().catch(null),
  // Absent in state saved by older builds: that recovers to null as well.
  retryAt: z.number().finite().min(0).nullable().catch(null),
});

/** Never writes: a missing, invalid or unreadable value just means "defaults". */
export async function loadUpdateState(storage: KeyValueStorage): Promise<UpdateState> {
  try {
    const raw = await storage.getItem(UPDATE_STORAGE_KEY);
    if (raw === null) return DEFAULT_UPDATE_STATE;
    const parsed = stateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_UPDATE_STATE;
  } catch {
    return DEFAULT_UPDATE_STATE;
  }
}

export async function saveUpdateState(storage: KeyValueStorage, state: UpdateState): Promise<SaveUpdateStateResult> {
  try {
    await storage.setItem(UPDATE_STORAGE_KEY, JSON.stringify(state));
    return { ok: true };
  } catch {
    return { ok: false, reason: "write-failed" };
  }
}
