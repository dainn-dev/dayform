import React from "react";
import { useCycle } from "../../lib/cycle-context";
import { DEFAULT_CYCLE_STATE, type CycleState } from "../../lib/cycle-model";
import type { DialogTarget } from "../../lib/cycle-ui-actions";
import { useLanguage } from "../../lib/language";
import { ConfirmDialog } from "./ConfirmDialog";
import { DayDialog } from "./DayDialog";
import { PeriodEditor } from "./PeriodEditor";
import { useCycleFormat } from "./use-cycle-format";
import { useCycleReport } from "./use-cycle-report";

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
  const { removePeriod, importState } = useCycle();
  const { message, busy, run, clear } = useCycleReport();
  const close = () => { clear(); onChange(null); };

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
  return <ConfirmDialog visible title={t("Delete all cycle data?")} busy={busy} error={message}
    message={t("This removes every logged period and turns tracking off. It cannot be undone.")}
    confirmLabel={t("Delete everything")} onCancel={close}
    onConfirm={() => { void run(() => importState(DEFAULT_CYCLE_STATE, "replace")).then(done => { if (done) close(); }); }} />;
}
