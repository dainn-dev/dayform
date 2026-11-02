import type { Category } from "./planner";
import { dateKey } from "./planner";
import { newTaskDefaults } from "./new-task-defaults";
import { parseQuickAdd, quickAddForm, type QuickAddResult } from "./quick-add";
import type { Settings } from "./settings";
import { planSave, type SaveForm, type SavePlan } from "./task-save";

/**
 * From a sentence to something the store can write: the parsed words, the editor form (the user's defaults fill what
 * the text left out) and the save plan, the same one the task editor would make. Shared by the quick add sheet and the
 * assistant, so a sentence means the same thing in both. Pure: the clock and the ids are parameters.
 */
export type QuickAddPlan = {
  parsed: QuickAddResult;
  /** Null when the text has no title. */
  form: SaveForm | null;
  /** Null when there is no form, or the editor itself would refuse the save. */
  plan: SavePlan | null;
};

export type PlanContext = {
  now: Date;
  /** Visible categories with the names the user sees, so `#tag` and the defaults can name them. */
  categories: readonly { id: Category; name: string }[];
  settings: Settings;
  newId: () => string;
  newSeriesId: () => string;
};

export function planQuickAdd(text: string, ctx: PlanContext): QuickAddPlan {
  const { now, categories, settings } = ctx;
  const today = dateKey(now);
  const parsed = parseQuickAdd(text, { now, categories });
  const defaults = newTaskDefaults(settings, { now, slotTime: null, selectedDate: parsed.date ?? today, knownCategories: categories.map(c => c.id) });
  const form = quickAddForm(parsed, { duration: defaults.duration, category: defaults.category, remind: settings.defaults.remind, startTime: defaults.time });
  if (form === null) return { parsed, form: null, plan: null };
  const saved = planSave(form, { existing: null, scope: "this", today, nowIso: now.toISOString(), newId: ctx.newId, newSeriesId: ctx.newSeriesId });
  return { parsed, form, plan: saved.ok ? saved : null };
}
