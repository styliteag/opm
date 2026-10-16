import { toast } from "sonner";

import {
  useTriageActions,
  type ExpectedInput,
} from "@/features/alerts/hooks/useTriageActions";
import { EXPECTED_SCOPES, TRIAGE_ACTIONS } from "@/lib/terminology";

type Done = () => void;

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** Triage verbs with user feedback (toasts); callers pass an optional onDone. */
export function useTriage() {
  const actions = useTriageActions();

  const markExpected = (input: ExpectedInput, onDone?: Done) =>
    actions.expected.mutate(input, {
      onSuccess: (res) => {
        if (res.errors.length > 0) {
          toast.warning(`${TRIAGE_ACTIONS.expected.label} with problems`, {
            description: res.errors.join("; "),
          });
        } else {
          toast.success(
            `${plural(input.alertIds.length, "alert")} marked ${TRIAGE_ACTIONS.expected.label} — ${EXPECTED_SCOPES[input.scope].toLowerCase()}`,
          );
        }
        onDone?.();
      },
      onError: (e) => toast.error(e.message),
    });

  const snooze = (alertIds: number[], onDone?: Done) =>
    actions.snooze.mutate(
      { alertIds },
      {
        onSuccess: () => {
          toast.success(`${plural(alertIds.length, "alert")} snoozed`);
          onDone?.();
        },
        onError: (e) => toast.error(e.message),
      },
    );

  const reopen = (alertIds: number[], onDone?: Done) =>
    actions.reopen.mutate(
      { alertIds },
      {
        onSuccess: () => {
          toast.success(`${plural(alertIds.length, "alert")} reopened`);
          onDone?.();
        },
        onError: (e) => toast.error(e.message),
      },
    );

  const acceptRisk = (alertId: number, reason: string, onDone?: Done) =>
    actions.acceptRisk.mutate(
      { alertId, reason },
      {
        onSuccess: () => {
          toast.success("Risk accepted");
          onDone?.();
        },
        onError: (e) => toast.error(e.message),
      },
    );

  const assign = (alertIds: number[], userId: number | null) =>
    actions.assign.mutate(
      { alertIds, userId },
      {
        onSuccess: () =>
          toast.success(userId === null ? "Unassigned" : "Assigned"),
        onError: (e) => toast.error(e.message),
      },
    );

  const remove = (alertIds: number[], onDone?: Done) =>
    actions.remove.mutate(
      { alertIds },
      {
        onSuccess: () => {
          toast.success(`${plural(alertIds.length, "alert")} deleted`);
          onDone?.();
        },
        onError: (e) => toast.error(e.message),
      },
    );

  const pending =
    actions.expected.isPending ||
    actions.snooze.isPending ||
    actions.reopen.isPending ||
    actions.acceptRisk.isPending ||
    actions.remove.isPending;

  return { markExpected, snooze, reopen, acceptRisk, assign, remove, pending };
}
