import { useRef, useState } from "react";
import { useTasks } from "../../lib/tasks-context";
import { SAVE_ERROR } from "../../lib/tasks-store";
import { dateKey, type Category, type Repeat, type Status, type Task } from "../../lib/planner";
import type { EditScope } from "../../lib/recurrence";
import { allowedScopes, hasConflict, needsScopeChoice, planDelete, planSave, RULE_CHANGE_MESSAGE, validateForm, type SaveForm } from "../../lib/task-save";

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

/** `mode` stays put while the dialog fades out, so its title does not flicker. */
type ScopeDialogState = { mode: "edit" | "delete"; visible: boolean };

type Options = { task?: Task | null; values: EditorValues; onClose: () => void };

const CLOSED_DIALOG: ScopeDialogState = { mode: "edit", visible: false };
const ONLY_THIS: EditScope[] = ["this"];

const randomSuffix = () => Math.random().toString(36).slice(2);
const newTaskId = () => `${Date.now()}-${randomSuffix()}`;
const newSeriesId = () => `series-${Date.now()}-${randomSuffix()}`;

function toSaveForm(values: EditorValues): SaveForm {
  return { ...values, duration: Number(values.duration) };
}

/**
 * Save / delete orchestration for the task editor: validation, the series scope question, the
 * overlap warning, and committing through `store.mutate` so recurring edits are atomic.
 * Only one commit can be in flight (a ref guard, so two quick taps cannot create two tasks).
 */
export function useEditorActions({ task = null, values, onClose }: Options) {
  const { tasks, mutate, remove } = useTasks();
  const [validation, setValidation] = useState("");
  const [confirmConflict, setConfirmConflict] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scope, setScope] = useState<EditScope | null>(null);
  const [dialog, setDialog] = useState<ScopeDialogState>(CLOSED_DIALOG);
  const committing = useRef(false);

  /** Runs one write. The store resolves false (and sets its own error) when it could not save. */
  const finish = async (commit: () => Promise<boolean>) => {
    if (committing.current) return;
    committing.current = true;
    setSaving(true);
    try {
      if (await commit()) onClose();
      else setValidation(SAVE_ERROR);
    } catch {
      setValidation(SAVE_ERROR);
    } finally {
      committing.current = false;
      setSaving(false);
    }
  };

  const commitSave = async (chosen: EditScope) => {
    const plan = planSave(toSaveForm(values), {
      existing: task, scope: chosen, today: dateKey(new Date()), newId: newTaskId, newSeriesId, nowIso: new Date().toISOString(),
    });
    if (!plan.ok) return setValidation(RULE_CHANGE_MESSAGE);
    if (!confirmConflict && hasConflict(plan.candidate, tasks)) {
      setConfirmConflict(true);
      setValidation("");
      return;
    }
    await finish(() => mutate(plan.update));
  };

  const commitDelete = async (chosen: EditScope) => {
    if (!task) return;
    const plan = planDelete(task, chosen);
    await finish(() => (plan.kind === "remove" ? remove(plan.id) : mutate(plan.update)));
  };

  const openDialog = (mode: "edit" | "delete") => setDialog({ mode, visible: true });

  const save = async () => {
    if (committing.current) return;
    const error = validateForm(values);
    setValidation(error ?? "");
    if (error) return;
    if (scope === null && needsScopeChoice(task, toSaveForm(values))) return openDialog("edit");
    await commitSave(scope ?? "this");
  };

  const deleteTask = async () => {
    if (!task || committing.current) return;
    if (task.seriesId != null) return openDialog("delete");
    await commitDelete("this");
  };

  const chooseScope = async (chosen: EditScope) => {
    if (committing.current) return;
    const { mode } = dialog;
    setDialog(current => ({ ...current, visible: false }));
    if (mode === "delete") return commitDelete(chosen);
    setScope(chosen);
    await commitSave(chosen);
  };

  /** Call when a field that affects the overlap check, the scope question or the allowed scopes changes. */
  const resetConfirmations = () => { setConfirmConflict(false); setScope(null); };

  const scopeRepeat = dialog.mode === "delete" ? task?.repeat ?? null : values.repeat;
  const dialogScopes = task ? allowedScopes(task, { repeat: scopeRepeat }) : ONLY_THIS;

  return {
    save, deleteTask, chooseScope, resetConfirmations, saving, validation, setValidation, confirmConflict,
    dialog, dialogScopes, cancelDialog: () => setDialog(current => ({ ...current, visible: false })),
  };
}
