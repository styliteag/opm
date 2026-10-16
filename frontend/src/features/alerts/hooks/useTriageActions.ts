import { useMutation, useQueryClient } from "@tanstack/react-query";

import { patchApi, postApi, putApi } from "@/lib/api";
import type { ExpectedScopeKey } from "@/lib/terminology";
import type {
  Alert,
  AlertAcceptRiskRequest,
  AlertBulkAcceptRequest,
  AlertBulkAcceptResponse,
  AlertBulkDismissResponse,
} from "@/lib/types";

/** Where an Expected rule applies (ADR 0012). */
export type ExpectedScope = ExpectedScopeKey;

export interface ExpectedInput {
  alertIds: number[];
  scope: ExpectedScope;
  reason?: string | null;
}

/**
 * Maps the UI scope to the backend call:
 * this host -> bulk-accept-network match=host, all hosts in this network ->
 * bulk-accept-network match=all_hosts, everywhere -> bulk-accept-global
 * match=all_hosts. The network endpoint groups alerts per network itself, so
 * one call covers a queue row spanning several networks.
 */
export function expectedRequest(input: ExpectedInput): {
  path: string;
  body: AlertBulkAcceptRequest;
} {
  const reason = input.reason?.trim();
  const body: AlertBulkAcceptRequest = {
    alert_ids: input.alertIds,
    match: input.scope === "host" ? "host" : "all_hosts",
    ...(reason ? { reason } : {}),
  };
  const path =
    input.scope === "global"
      ? "/api/alerts/bulk-accept-global"
      : "/api/alerts/bulk-accept-network";
  return { path, body };
}

/** v4 triage verbs: Expected, Snooze, Reopen, Accept risk, Assign. */
export function useTriageActions() {
  const qc = useQueryClient();
  const onSuccess = () => qc.invalidateQueries({ queryKey: ["alerts"] });

  const expected = useMutation({
    mutationFn: (input: ExpectedInput) => {
      const { path, body } = expectedRequest(input);
      return postApi<AlertBulkAcceptResponse>(path, body);
    },
    onSuccess,
  });

  const snooze = useMutation({
    mutationFn: ({ alertIds }: { alertIds: number[] }) =>
      postApi<AlertBulkDismissResponse>("/api/alerts/bulk-dismiss", {
        alert_ids: alertIds,
      }),
    onSuccess,
  });

  const reopen = useMutation({
    mutationFn: ({ alertIds }: { alertIds: number[] }) =>
      Promise.all(
        alertIds.map((id) => putApi<Alert>(`/api/alerts/${id}/reopen`, {})),
      ),
    onSuccess,
  });

  const acceptRisk = useMutation({
    mutationFn: ({ alertId, reason }: { alertId: number; reason: string }) => {
      const body: AlertAcceptRiskRequest = { reason: reason.trim() };
      return postApi<Alert>(`/api/alerts/${alertId}/accept-risk`, body);
    },
    onSuccess,
  });

  const assign = useMutation({
    mutationFn: ({
      alertIds,
      userId,
    }: {
      alertIds: number[];
      userId: number | null;
    }) =>
      Promise.all(
        alertIds.map((id) =>
          patchApi<Alert>(`/api/alerts/${id}/assign`, { user_id: userId }),
        ),
      ),
    onSuccess,
  });

  // Permanent removal; the UI keeps it behind bulk selection (ADR 0012).
  const remove = useMutation({
    mutationFn: ({ alertIds }: { alertIds: number[] }) =>
      postApi<{ deleted_ids: number[]; missing_ids: number[] }>(
        "/api/alerts/bulk-delete",
        { alert_ids: alertIds },
      ),
    onSuccess,
  });

  return { expected, snooze, reopen, acceptRisk, assign, remove };
}
