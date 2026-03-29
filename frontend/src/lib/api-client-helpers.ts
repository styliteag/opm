import { fetchApi, patchApi } from "@/lib/api";
import type { AlertTimelineResponse, HostTimelineResponse } from "@/lib/types";

export interface PortCommentUpdateRequest {
  user_comment: string | null;
}

export interface GlobalOpenPort {
  id: number;
  ip: string;
  port: number;
  protocol: string;
  banner: string | null;
  service_guess: string | null;
  user_comment: string | null;
  first_seen_at: string;
  last_seen_at: string;
  is_stale: boolean;
}

export function fetchAlertTimeline(
  alertId: number,
): Promise<AlertTimelineResponse> {
  return fetchApi<AlertTimelineResponse>(`/api/alerts/${alertId}/timeline`);
}

export function fetchHostTimeline(
  hostId: number,
  params?: { limit?: number; before?: string },
): Promise<HostTimelineResponse> {
  const searchParams = new URLSearchParams();
  if (params?.limit) {
    searchParams.set("limit", String(params.limit));
  }
  if (params?.before) {
    searchParams.set("before", params.before);
  }
  const qs = searchParams.toString();
  return fetchApi<HostTimelineResponse>(
    `/api/hosts/${hostId}/timeline${qs ? `?${qs}` : ""}`,
  );
}

export function patchPortComment(
  portId: number,
  body: PortCommentUpdateRequest,
): Promise<GlobalOpenPort> {
  return patchApi<GlobalOpenPort>(`/api/global-ports/${portId}/comment`, body);
}
