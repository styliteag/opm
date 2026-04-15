import { deleteApi, fetchApi, patchApi, postApi } from "@/lib/api";

export type SeverityLabel = "info" | "low" | "medium" | "high" | "critical";

export interface GvmSeverityRule {
  id: number;
  oid: string;
  network_id: number | null;
  network_name: string | null;
  severity_override: SeverityLabel;
  reason: string | null;
  created_by_user_id: number | null;
  created_by_username: string | null;
  created_at: string;
  updated_at: string;
}

export interface GvmSeverityRuleListResponse {
  rules: GvmSeverityRule[];
}

export interface GvmSeverityRuleCreate {
  oid: string;
  network_id: number | null;
  severity_override: SeverityLabel;
  reason?: string | null;
}

export interface GvmSeverityRuleUpdate {
  severity_override?: SeverityLabel;
  reason?: string | null;
}

export function listSeverityRules(params?: {
  network_id?: number | null;
  oid?: string;
}): Promise<GvmSeverityRuleListResponse> {
  const qs = new URLSearchParams();
  if (params?.network_id != null) qs.set("network_id", String(params.network_id));
  if (params?.oid) qs.set("oid", params.oid);
  const suffix = qs.toString() ? `?${qs}` : "";
  return fetchApi<GvmSeverityRuleListResponse>(
    `/api/gvm-severity-rules${suffix}`,
  );
}

export function createSeverityRule(
  payload: GvmSeverityRuleCreate,
): Promise<GvmSeverityRule> {
  return postApi<GvmSeverityRule>("/api/gvm-severity-rules", payload);
}

export function updateSeverityRule(
  id: number,
  payload: GvmSeverityRuleUpdate,
): Promise<GvmSeverityRule> {
  return patchApi<GvmSeverityRule>(`/api/gvm-severity-rules/${id}`, payload);
}

export function deleteSeverityRule(id: number): Promise<void> {
  return deleteApi(`/api/gvm-severity-rules/${id}`);
}
