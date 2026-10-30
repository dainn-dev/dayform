import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useCategoryColors } from "../../hooks/use-category-colors";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { MAX_CUSTOM, allCategoryIds, reassignOnDelete } from "../../lib/categories";
import { useCategories } from "../../lib/categories-context";
import { countTasksByCategory, taskCountOf } from "../../lib/category-counts";
import { failureMessage } from "../../lib/category-labels";
import { deleteCategoryWithTasks } from "../../lib/category-reassign";
import { useLanguage } from "../../lib/language";
import { fillPlaceholders } from "../../lib/text-template";
import { useTasks } from "../../lib/tasks-context";
import { useFloatingAction } from "../menu/floating-action";
import { RecoveryConfirm } from "../settings/RecoveryConfirm";
import { CategoryEditorModal, type EditorTarget } from "./CategoryEditorModal";
import { CategoryRow, useTaskCountText } from "./CategoryRow";

const TASKS_NOT_MOVED ="Could not move the tasks, so nothing was deleted.";
const CATEGORY_NOT_DELETED = "The tasks were moved, but the category could not be deleted. Try again.";

/**
 * "Categories": every category (built-ins included) with its task count, plus rename/edit, hide/show, delete
 * (custom only) and add. Deleting moves the category's tasks to another category in one write first (not undoable).
 */
export function CategoriesSection() {
  const cats = useCategories();
  const { tasks, mutate } = useTasks();
  const { t } = useLanguage();
  const palette = useColors();
  const lookup = useCategoryColors();
  const countText = useTaskCountText();
  const s = useMemo(() => makeStyles(palette), [palette]);
  const [editing, setEditing] = useState<EditorTarget | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  /** The category whose swipe action (delete) is uncovered; only one row is open at a time. */
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const counts = useMemo(() => countTasksByCategory(tasks), [tasks]);
  const ids = allCategoryIds(cats.state);
  const disabled = cats.locked || busy;
  const atLimit = cats.state.custom.length >= MAX_CUSTOM;

  const toggleHidden = async (id: string, hidden: boolean) => {
    setNotice(null);
    setBusy(true);
    const result = await (hidden ? cats.show(id) : cats.hide(id));
    setBusy(false);
    if (!result.ok) setNotice(failureMessage(result.reason).key);
  };

  const confirmDelete = async (id: string) => {
    setNotice(null);
    setBusy(true);
    const outcome = await deleteCategoryWithTasks({
      id, targetId: reassignOnDelete(cats.state, id), mutateTasks: mutate, removeCategory: cats.remove,
    });
    setBusy(false);
    if (outcome.ok) { setConfirmId(null); return; }
    setNotice(outcome.stage === "tasks" ? TASKS_NOT_MOVED : CATEGORY_NOT_DELETED);
    if (outcome.stage === "category") setConfirmId(null);
  };

  const question = (id: string): string => {
    const category = cats.label(id);
    const used = taskCountOf(counts, id);
    if (used === 0) return fillPlaceholders(t("Delete {category}? No tasks use it."), { category });
    return fillPlaceholders(t("Delete {category}? {tasks} will move to {target}."), {
      category, tasks: countText(used), target: cats.label(reassignOnDelete(cats.state, id)),
    });
  };

  const lastVisible = (id: string) => cats.visible.length === 1 && cats.visible[0] === id;

  // The settings page floats this plus over the list, like "new task" on the Timeline.
  useFloatingAction({
    label: t("Add category"), disabled: disabled || atLimit,
    onPress: () => { setNotice(null); setOpenId(null); setEditing({ kind: "new" }); },
  });

  return <View>
    {cats.locked &&<Text accessibilityRole="alert" style={s.notice}>{t(failureMessage("locked").key)}</Text>}
    {!cats.locked && cats.saveError && <Text accessibilityRole="alert" style={s.notice}>{t("Could not save your categories. Please try again.")}</Text>}
    {ids.map(id => {
      const resolved = cats.resolve(id);
      const hidden = cats.state.hidden.includes(id);
      return <CategoryRow key={id} label={cats.label(id)} colors={lookup.get(id)} taskCount={taskCountOf(counts, id)}
        hidden={hidden} builtin={resolved.builtin} lastVisible={lastVisible(id)} disabled={disabled}
        open={openId === id} onOpenChange={next => setOpenId(current => next ? id : current === id ? null : current)}
        onEdit={() => { setNotice(null); setOpenId(null); setEditing({ kind: "edit", id }); }}
        onToggleHidden={() => { void toggleHidden(id, hidden); }}
        onDelete={() => { setNotice(null); setConfirmId(id); }}>
        {confirmId === id && <RecoveryConfirm question={question(id)} yes="Delete category" busy={busy}
          onYes={() => { void confirmDelete(id); }} onCancel={() => setConfirmId(null)} />}
      </CategoryRow>;
    })}
    {notice !== null && <Text accessibilityRole="alert" style={s.notice}>{t(notice)}</Text>}
    {atLimit && <Text style={s.hint}>{fillPlaceholders(t("You can add up to {count} categories"), { count: String(MAX_CUSTOM) })}</Text>}
    <Text style={s.hint}>{t(cats.state.custom.length > 0
      ? "Swipe a custom category to the left to delete it. The built-in ones can only be hidden."
      : "Categories you add can be deleted by swiping them to the left. The built-in ones can only be hidden.")}</Text>
    <CategoryEditorModal target={editing} onClose={() => setEditing(null)} />
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  notice: { color: c.warningText, backgroundColor: c.warningBg, fontSize: 12, lineHeight: 17, marginBottom: 6, marginTop: 4, padding: 10, borderRadius: 12, overflow: "hidden" },
  hint: { color: c.labelText, fontSize: 11, lineHeight: 16, marginTop: 4 },
});
