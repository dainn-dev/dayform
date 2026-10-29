import React from "react";
import { useCycle } from "../../lib/cycle-context";
import type { CycleState } from "../../lib/cycle-model";
import type { DialogTarget } from "../../lib/cycle-ui-actions";
import { useLanguage } from "../../lib/language";
import { ConfirmDialog } from "./ConfirmDialog";
import { DayDialog } from "./DayDialog";
import { PeriodEditor } from "./PeriodEditor";
import { useCycleFormat } from "./use-cycle-format";
import { useCycleReport } from "./use-cycle-report";
import { useDeleteAll } from "./use-delete-all";

/** Second part of the delete-all text: the automatic copies go too, an exported file is out of the app's reach. */
const DELETE_ALL_COPIES_NOTE =
  "It is also removed from the automatic copies kept on this device. A backup file you exported earlier is not deleted.";

type Props = {
  target: DialogTarget | null;
  state: CycleState;
  today: string;
  onChange: (target: DialogTarget | null) => void;
};

/** The one dialog the cycle screen has open: a day, the period editor, or a delete confirmation. */
export function CycleDialogs({ target, state, today, onChange }: Props) {
  const { t } = useLanguage();
  const format = useCycleFormat();
  const { removePeriod } = useCycle();
  const { message, busy, run, clear } = useCycleReport();
  const deleteAll = useDeleteAll();
  const close = () => { clear(); deleteAll.clear(); onChange(null); };

  if (target === null) return null;
  if (target.kind === "day") {
    return <DayDialog date={target.date} state={state} today={today} onClose={close} onOpen={onChange} />;
  }
  if (target.kind === "edit") {
    return <PeriodEditor period={target.period} today={today} periodLength={state.defaults.periodLength} onClose={close} />;
  }
  if (target.kind === "remove") {
    const { period } = target;
    return <ConfirmDialog visible title={t("Delete this period?")} busy={busy} error={message}
      message={format.sayText("The period starting {date} will be removed from your history.", { date: format.withYear(period.start) })}
      confirmLabel={t("Delete period")} onCancel={close}
      onConfirm={() => { void run(() => removePeriod(period.start)).then(done => { if (done) close(); }); }} />;
  }
  return <ConfirmDialog visible title={t("Delete all cycle data?")} busy={deleteAll.busy} error={deleteAll.message}
    message={`${t("This removes every logged period and turns tracking off. It cannot be undone.")} ${t(DELETE_ALL_COPIES_NOTE)}`}
    confirmLabel={t("Delete everything")} onCancel={close}
    onConfirm={() => { void deleteAll.confirm().then(done => { if (done) close(); }); }} />;
}
