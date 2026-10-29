import { resolveCategory, visibleCategories, type CategoriesState } from "./categories";
import type { Task } from "./planner";

/** Tasks per category id. Ids that no longer exist are counted like any other. */
export function countByCategory(tasks: readonly Task[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const task of tasks) counts.set(task.category, (counts.get(task.category) ?? 0) + 1);
  return counts;
}

function byNameThenId(state: CategoriesState): (a: string, b: string) => number {
  return (a, b) => {
    const named = resolveCategory(a, state).name.localeCompare(resolveCategory(b, state).name);
    return named !== 0 ? named : a < b ? -1 : a > b ? 1 : 0;
  };
}

/**
 * Category ids a filter should offer: every visible category (built-ins, then custom), then any other id that
 * tasks still use (hidden built-ins, deleted custom ids) ordered by display name. `alsoInclude` keeps ids that
 * are selected but no longer used, so a selection can always be cleared.
 */
export function categoriesInUse(
  tasks: readonly Task[],
  state: CategoriesState,
  alsoInclude: readonly string[] = [],
): string[] {
  const visible = visibleCategories(state);
  const shown = new Set(visible);
  const extra = new Set<string>();
  for (const id of [...countByCategory(tasks).keys(), ...alsoInclude]) if (!shown.has(id)) extra.add(id);
  return [...visible, ...[...extra].sort(byNameThenId(state))];
}

/** Chips for the task editor: the visible categories plus the task's own, so an old task keeps its category. */
export function categoryChoices(visible: readonly string[], current: string): string[] {
  return visible.includes(current) ? [...visible] : [...visible, current];
}
