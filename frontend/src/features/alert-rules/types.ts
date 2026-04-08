export interface PortRule {
  id: number;
  network_id: number | null;
  network_name?: string | null;
  rule_type: "accepted" | "critical";
  ip: string | null;
  port: string;
  source: string;
  alert_type: string | null;
  script_name: string | null;
  description: string | null;
  enabled: boolean;
  created_at: string;
  hit_count: number;
}

export interface PolicyResponse {
  rules: PortRule[];
}

export type RuleSource = "port" | "ssh" | "nse";
