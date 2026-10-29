import { useState } from "react";
import { useTasks } from "../../lib/tasks-context";
import { dateKey, type Category, type Repeat, type Status, type Task } from "../../lib/planner";
import type { EditScope } from "../../lib/recurrence";
import { hasConflict, needsScopeChoice, planDelete, planSave, validateForm, type SaveForm } from "../../lib/task-save";

/** Everything the editor shell holds in state; `duration` is still the raw text. */
export type EditorValues = {
  title: string;
  duration: string;
  scheduled: boolean;
  date: string;
  time: string;
  category: Category;
  status: Status;
  notes: string;
  remind: number | null;
  repeat: Repeat | null;
};

type ScopeDialogState = { mode: "edit" | "delete" } | null;

type Options = { task?: Task | null; values: EditorValues; onClose: () => void };

const randomSuffix = () => Math.random().toString(36).slice(2);
const newTaskId = () => `${Date.now()}-${randomSuffix()}`;
const newSeriesId = () => `series-${Date.now()}-${randomSuffix()}`;

function toSaveForm(values: EditorValues): SaveForm {
  return { ...values, duration: Number(values.duration) };
}

/**
 * Save / delete orchestration for the task editor: validation, the series scope question, the
 * overlap warning, and committing through `store.mutate` so recurring edits are atomic.
 */
export function useEditorActions({ task = null, values, onClose }: Options) {
  const { tasks, mutate, remove } = useTasks();
  const [validation, setValidation] = useState("");
  const [confirmConflict, setConfirmConflict] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scope, setScope] = useState<EditScope | null>(null);
  const [dialog, setDialog] = useState<ScopeDialogState>(null);

  const finish = async (commit: () => Promise<boolean>) => {
    setSaving(true);
    try {
      if (await commit()) onClose();
    } finally {
      setSaving(false);
    }
  };

  const commitSave = async (chosen: EditScope) => {
    const plan = planSave(toSaveForm(values), {
      existing: task, scope: chosen, today: dateKey(new Date()), newId: newTaskId, newSeriesId, nowIso: new Date().toISOString(),
    });
    if (!confirmConflict && hasConflict(plan.candidate, tasks)) {
      setConfirmConflict(true);
      setValidation("");
      return;
    }
    await finish(() => mutate(plan.update));
  };

  const commitDelete = async (chosen: EditScope) => {
    if (!task) return;
    const plan = planDelete(task, chosen, dateKey(new Date()), newSeriesId);
    await finish(() => (plan.kind === "remove" ? remove(plan.id) : mutate(plan.update)));
  };

  const save = async () => {
    const error = validateForm(values);
    setValidation(error ?? "");
    if (error) return;
    if (scope === null && needsScopeChoice(task, toSaveForm(values))) return setDialog({ mode: "edit" });
    await commitSave(scope ?? "this");
  };

  const deleteTask = async () => {
    if (!task) return;
    if (task.seriesId != null) return setDialog({ mode: "delete" });
    await commitDelete("this");
  };

  const chooseScope = async (chosen: EditScope) => {
    const mode = dialog?.mode;
    setDialog(null);
    if (mode === "delete") return commitDelete(chosen);
    setScope(chosen);
    if (mode === "edit") await commitSave(chosen);
  };

  /** Call when a field that affects the overlap check or the scope question changes. */
  const resetConfirmations = () => { setConfirmConflict(false); setScope(null); };

  return {
    save, deleteTask, chooseScope, resetConfirmations, saving, validation, setValidation, confirmConflict,
    dialog, cancelDialog: () => setDialog(null),
  };
}
