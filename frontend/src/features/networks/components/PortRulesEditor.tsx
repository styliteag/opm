import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/data-display/StatusBadge";
import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";
import { postApi, deleteApi } from "@/lib/api";
import {
  SSH_ALERT_TYPES,
  NSE_ALERT_TYPES,
  RULE_SOURCE_BADGES,
  getAlertTypeLabel,
} from "@/lib/alert-types";

import type { PortRule } from "../hooks/useNetworkDetail";
import { RULE_TYPE_LABELS, ruleTarget } from "../lib/networkLabels";

type RuleSource = "port" | "ssh" | "nse";

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
  const [pendingDelete, setPendingDelete] = useState<PortRule | null>(null);

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
      setPendingDelete(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const canSubmit = source === "port" ? Boolean(port) : true;

  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center justify-between border-b border-border bg-card px-5 py-3">
        <h3 className="text-sm font-strong text-foreground">
          Rules ({rules.length})
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAdd(!showAdd)}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add rule
        </Button>
      </div>

      {showAdd && (
        <div className="border-b border-border bg-accent/30 px-5 py-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor={`port-rule-${networkId}-source`}>Source</Label>
              <Select
                id={`port-rule-${networkId}-source`}
                value={source}
                onChange={(e) => {
                  setSource(e.target.value as RuleSource);
                  setAlertType("");
                  setScriptName("");
                }}
              >
                <option value="port">Port</option>
                <option value="ssh">SSH check</option>
                <option value="nse">Vulnerability scripts (NSE)</option>
              </Select>
            </div>
            <div>
              <Label htmlFor={`port-rule-${networkId}-port`}>
                Port{source !== "port" ? " (opt)" : ""}
              </Label>
              <Input
                id={`port-rule-${networkId}-port`}
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="80"
                className="w-24 font-mono"
              />
            </div>
            <div>
              <Label htmlFor={`port-rule-${networkId}-ip`}>IP (opt)</Label>
              <Input
                id={`port-rule-${networkId}-ip`}
                value={ip}
                onChange={(e) => setIp(e.target.value)}
                placeholder="192.168.1.1"
                className="w-36 font-mono"
              />
            </div>
            {source === "ssh" && (
              <div>
                <Label htmlFor={`port-rule-${networkId}-alert-type`}>
                  Alert Type
                </Label>
                <Select
                  id={`port-rule-${networkId}-alert-type`}
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
                  <Label htmlFor={`port-rule-${networkId}-alert-type`}>
                    Alert Type
                  </Label>
                  <Select
                    id={`port-rule-${networkId}-alert-type`}
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
                  <Label htmlFor={`port-rule-${networkId}-script`}>
                    Script
                  </Label>
                  <Input
                    id={`port-rule-${networkId}-script`}
                    value={scriptName}
                    onChange={(e) => setScriptName(e.target.value)}
                    placeholder="script-name"
                    className="w-40 font-mono"
                  />
                </div>
              </>
            )}
            <div>
              <Label htmlFor={`port-rule-${networkId}-rule-type`}>Type</Label>
              <Select
                id={`port-rule-${networkId}-rule-type`}
                value={ruleType}
                onChange={(e) =>
                  setRuleType(e.target.value as "accepted" | "critical")
                }
              >
                <option value="accepted">{RULE_TYPE_LABELS.accepted}</option>
                <option value="critical">{RULE_TYPE_LABELS.critical}</option>
              </Select>
            </div>
            <div className="flex-1 min-w-[120px]">
              <Label htmlFor={`port-rule-${networkId}-description`}>
                Why
              </Label>
              <Input
                id={`port-rule-${networkId}-description`}
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
          No rules for this network. Ports marked Expected from Home or the
          Ports list with "all hosts in this network" show up here.
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
                    className={`rounded px-1.5 py-0.5 text-[10px] font-strong uppercase ${badge.className}`}
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
                    label={RULE_TYPE_LABELS[rule.rule_type]}
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
                  type="button"
                  onClick={() => setPendingDelete(rule)}
                  className="rounded p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all cursor-pointer"
                  title="Remove rule"
                  aria-label={`Remove rule for ${rule.match_criteria.ip ?? "any IP"}:${rule.match_criteria.port ?? "any port"}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={`Remove rule for ${pendingDelete ? ruleTarget(pendingDelete) : ""}?`}
        description={
          pendingDelete?.rule_type === "accepted"
            ? "Future scans alert on this port again."
            : "This port no longer alerts as critical."
        }
        confirmLabel="Remove rule"
        pending={removeRule.isPending}
        onConfirm={() => pendingDelete && removeRule.mutate(pendingDelete.id)}
      />
    </div>
  );
}
