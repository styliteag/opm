import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/data-display/StatusBadge";
import { postApi, deleteApi } from "@/lib/api";
import {
  SSH_ALERT_TYPES,
  NSE_ALERT_TYPES,
  RULE_SOURCE_BADGES,
  getAlertTypeLabel,
} from "@/lib/alert-types";

type RuleSource = "port" | "ssh" | "nse";

interface PortRule {
  id: number;
  network_id: number | null;
  rule_type: "accepted" | "critical";
  match_criteria: {
    port?: number;
    ip?: string;
    alert_type?: string;
    script_name?: string;
  };
  source?: string;
  description: string | null;
  created_at: string;
}

interface PortRulesEditorProps {
  networkId: number;
  rules: PortRule[];
}

export function PortRulesEditor({ networkId, rules }: PortRulesEditorProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [source, setSource] = useState<RuleSource>("port");
  const [port, setPort] = useState("");
  const [ip, setIp] = useState("");
  const [ruleType, setRuleType] = useState<"accepted" | "critical">("accepted");
  const [alertType, setAlertType] = useState("");
  const [scriptName, setScriptName] = useState("");
  const [description, setDescription] = useState("");

  const qc = useQueryClient();

  const addRule = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      postApi(`/api/networks/${networkId}/rules`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["networks", networkId, "rules"] });
      toast.success("Rule added");
      setShowAdd(false);
      setPort("");
      setIp("");
      setAlertType("");
      setScriptName("");
      setDescription("");
    },
    onError: (e) => toast.error(e.message),
  });

  const removeRule = useMutation({
    mutationFn: (ruleId: number) =>
      deleteApi(`/api/networks/${networkId}/rules/${ruleId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["networks", networkId, "rules"] });
      toast.success("Rule removed");
    },
    onError: (e) => toast.error(e.message),
  });

  const canSubmit = source === "port" ? Boolean(port) : true;

  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center justify-between border-b border-border bg-card px-5 py-3">
        <h3 className="font-display text-sm font-semibold text-foreground">
          Alert Rules ({rules.length})
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAdd(!showAdd)}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add Rule
        </Button>
      </div>

      {showAdd && (
        <div className="border-b border-border bg-accent/30 px-5 py-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                Source
              </label>
              <Select
                value={source}
                onChange={(e) => {
                  setSource(e.target.value as RuleSource);
                  setAlertType("");
                  setScriptName("");
                }}
              >
                <option value="port">Port</option>
                <option value="ssh">SSH</option>
                <option value="nse">NSE</option>
              </Select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                Port{source !== "port" ? " (opt)" : ""}
              </label>
              <Input
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="80"
                className="w-24 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                IP (opt)
              </label>
              <Input
                value={ip}
                onChange={(e) => setIp(e.target.value)}
                placeholder="192.168.1.1"
                className="w-36 font-mono"
              />
            </div>
            {source === "ssh" && (
              <div>
                <label className="block text-xs text-muted-foreground mb-1">
                  Alert Type
                </label>
                <Select
                  value={alertType}
                  onChange={(e) => setAlertType(e.target.value)}
                >
                  <option value="">Any</option>
                  {SSH_ALERT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            {source === "nse" && (
              <>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">
                    Alert Type
                  </label>
                  <Select
                    value={alertType}
                    onChange={(e) => setAlertType(e.target.value)}
                  >
                    <option value="">Any</option>
                    {NSE_ALERT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">
                    Script
                  </label>
                  <Input
                    value={scriptName}
                    onChange={(e) => setScriptName(e.target.value)}
                    placeholder="script-name"
                    className="w-40 font-mono"
                  />
                </div>
              </>
            )}
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                Type
              </label>
              <Select
                value={ruleType}
                onChange={(e) =>
                  setRuleType(e.target.value as "accepted" | "critical")
                }
              >
                <option value="accepted">Accepted</option>
                <option value="critical">Critical</option>
              </Select>
            </div>
            <div className="flex-1 min-w-[120px]">
              <label className="block text-xs text-muted-foreground mb-1">
                Description
              </label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Reason"
              />
            </div>
            <Button
              size="sm"
              onClick={() =>
                addRule.mutate({
                  port: port || undefined,
                  ip: ip || undefined,
                  rule_type: ruleType,
                  description: description || undefined,
                  source,
                  alert_type: alertType || undefined,
                  script_name: scriptName || undefined,
                })
              }
              disabled={!canSubmit || addRule.isPending}
            >
              {addRule.isPending ? "Adding..." : "Add"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {rules.length === 0 && !showAdd ? (
        <div className="p-5 text-sm text-muted-foreground">
          No alert rules configured.
        </div>
      ) : (
        <div className="divide-y divide-border">
          {rules.map((rule) => {
            const src = rule.source ?? "port";
            const badge = RULE_SOURCE_BADGES[src] ?? RULE_SOURCE_BADGES.port;
            const extras: string[] = [];
            if (rule.match_criteria.alert_type) {
              const label = getAlertTypeLabel(rule.match_criteria.alert_type);
              extras.push(label);
            }
            if (rule.match_criteria.script_name)
              extras.push(rule.match_criteria.script_name);

            return (
              <div
                key={rule.id}
                className="flex items-center justify-between px-5 py-3 group"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                  <span className="font-mono text-sm text-foreground">
                    {rule.match_criteria.ip ? `${rule.match_criteria.ip}:` : ""}
                    {rule.match_criteria.port ?? "*"}
                  </span>
                  {extras.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {extras.join(" · ")}
                    </span>
                  )}
                  <StatusBadge
                    label={rule.rule_type}
                    variant={
                      rule.rule_type === "accepted" ? "success" : "danger"
                    }
                  />
                  {rule.description && (
                    <span className="text-sm text-muted-foreground">
                      — {rule.description}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => removeRule.mutate(rule.id)}
                  className="rounded p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                  title="Remove rule"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
