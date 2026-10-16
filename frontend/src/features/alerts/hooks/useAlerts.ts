import { useQuery } from "@tanstack/react-query";

import { fetchApi } from "@/lib/api";
import type {
  AlertListResponse,
  AlertComment,
  PolicyFilter,
  QueueState,
  Severity,
  AlertType,
} from "@/lib/types";

interface AlertFilters {
  type?: AlertType;
  source?: string;
  network_id?: number;
  dismissed?: boolean;
  queue_state?: QueueState;
  policy_state?: PolicyFilter;
  ip?: string;
  port?: number;
  search?: string;
  severity?: Severity;
  sort_by?: string;
  sort_dir?: "asc" | "desc";
  offset?: number;
  limit?: number;
}

function buildAlertParams(filters: AlertFilters): string {
  const params = new URLSearchParams();
  if (filters.type) params.set("type", filters.type);
  if (filters.source) params.set("source", filters.source);
  if (filters.network_id) params.set("network_id", String(filters.network_id));
  if (filters.dismissed !== undefined)
    params.set("dismissed", String(filters.dismissed));
  if (filters.queue_state) params.set("queue_state", filters.queue_state);
  if (filters.policy_state) params.set("policy_state", filters.policy_state);
  if (filters.ip) params.set("ip", filters.ip);
  if (filters.port) params.set("port", String(filters.port));
  if (filters.search) params.set("search", filters.search);
  if (filters.sort_by) params.set("sort_by", filters.sort_by);
  if (filters.sort_dir) params.set("sort_dir", filters.sort_dir);
  if (filters.offset) params.set("offset", String(filters.offset));
  params.set("limit", String(filters.limit ?? 50));
  return params.toString();
}

export function useAlerts(filters: AlertFilters) {
  return useQuery({
    queryKey: ["alerts", filters],
    queryFn: () =>
      fetchApi<AlertListResponse>(`/api/alerts/?${buildAlertParams(filters)}`),
  });
}

export function useAlertComments(alertId: number) {
  return useQuery({
    queryKey: ["alerts", alertId, "comments"],
    queryFn: async () => {
      const res = await fetchApi<{ comments: AlertComment[] }>(
        `/api/alerts/${alertId}/comments`,
      );
      return res.comments;
    },
    enabled: alertId > 0,
  });
}
