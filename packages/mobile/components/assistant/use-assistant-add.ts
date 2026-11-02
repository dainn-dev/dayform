import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { describeParts, readAddRequest, shouldAdd } from "../../lib/assistant-add";
import { useCategories } from "../../lib/categories-context";
import { useLanguage } from "../../lib/language";
import { fromKey, dateKey } from "../../lib/planner";
import { planQuickAdd } from "../../lib/quick-add-plan";
import { useSettings } from "../../lib/settings-context";
import type { SavePlan } from "../../lib/task-save";
import { useTasks } from "../../lib/tasks-context";

/** A task the assistant has understood and is waiting for a yes to. */
export type PendingAdd = { title: string; parts: string[]; plan: SavePlan };

/** How long a proposal waits for an answer before it is dropped. */
const PROPOSAL_TTL_MS = 90_000;

const randomSuffix = () => Math.random().toString(36).slice(2);

/**
 * Adding a task by talking to the assistant when the AI chat is off: the sentence is read on the device by the quick
 * add parser (lib/quick-add.ts), shown and read out, and written only after the user says yes or taps Agree.
 * The write is one undoable `mutate`, through the same save plan the task editor makes.
 */
export function useAssistantAdd() {
  const { settings } = useSettings();
  const { visible, label } = useCategories();
  const { mutate } = useTasks();
  const { t, time, duration, locale } = useLanguage();
  const [pending, setPending] = useState<PendingAdd | null>(null);
  const pendingRef = useRef<PendingAdd | null>(null);
  const categories = useMemo(() => visible.map(id => ({ id, name: label(id) })), [visible, label]);

  const hold = useCallback((next: PendingAdd | null) => {
    pendingRef.current = next;
    setPending(next);
  }, []);

  useEffect(() => {
    if (pending === null) return undefined;
    const timer = setTimeout(() => hold(null), PROPOSAL_TTL_MS);
    return () => clearTimeout(timer);
  }, [pending, hold]);

  /**
   * "none": not a request to add. "empty": it was ("thêm ...") but no title followed. Otherwise the task that was
   * understood, which is now waiting for an answer.
   */
  const propose = useCallback((text: string): PendingAdd | "none" | "empty" => {
    const request = readAddRequest(text);
    const now = new Date();
    const planned = planQuickAdd(request.text, {
      now, categories, settings, newId: () => `${Date.now()}-${randomSuffix()}`, newSeriesId: () => `series-${Date.now()}-${randomSuffix()}`,
    });
    if (!shouldAdd(request, planned) || planned.form === null || planned.plan === null) return request.explicit ? "empty" : "none";
    const parts = describeParts(planned.form, {
      today: dateKey(now), t, time, duration, category: label,
      date: key => fromKey(key).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" }),
    });
    const proposal = { title: planned.form.title, parts, plan: planned.plan };
    hold(proposal);
    return proposal;
  }, [categories, settings, t, time, duration, label, locale, hold]);

  /** The user's answer. Resolves true when the task was written (a "no" resolves false). */
  const answer = useCallback(async (yes: boolean): Promise<boolean> => {
    const current = pendingRef.current;
    if (current === null) return false;
    hold(null);
    if (!yes) return false;
    return mutate(current.plan.update, { undo: "bulk" });
  }, [mutate, hold]);

  const cancel = useCallback(() => hold(null), [hold]);

  return { pending, propose, answer, cancel };
}
