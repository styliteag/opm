import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { postApi } from "@/lib/api";
import { SSH_ALERT_TYPES, NSE_ALERT_TYPES } from "@/lib/alert-types";
import { EXPECTED_SCOPES } from "@/lib/terminology";
import { useNetworks } from "@/features/dashboard/hooks/useDashboardData";
import { RULE_TYPE_LABELS, ruleSourceLabel } from "../lib/ruleLabels";
import type { RuleSource } from "../types";

interface GlobalRuleAddFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: () => void;
}

export function GlobalRuleAddForm({
  open,
  onOpenChange,
  onAdded,
}: GlobalRuleAddFormProps) {
  const [source, setSource] = useState<RuleSource>("port");
  const [port, setPort] = useState("");
  const [ip, setIp] = useState("");
  const [ruleType, setRuleType] = useState<"accepted" | "critical">("accepted");
  const [alertType, setAlertType] = useState("");
  const [scriptName, setScriptName] = useState("");
  const [description, setDescription] = useState("");
  const [networkId, setNetworkId] = useState<number | null>(null);
  const networks = useNetworks().data?.networks ?? [];

  const resetForm = () => {
    setSource("port");
    setPort("");
    setIp("");
    setRuleType("accepted");
    setAlertType("");
    setScriptName("");
    setDescription("");
    setNetworkId(null);
  };

  const addRule = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      postApi("/api/port-rules", data),
    onSuccess: () => {
      toast.success("Rule added");
      resetForm();
      onAdded();
    },
    onError: (e) => toast.error(e.message),
  });

  const canSubmit = source === "port" ? Boolean(port) : true;

  const handleSubmit = () => {
    addRule.mutate({
      network_id: networkId,
      port: port || undefined,
      ip: ip || undefined,
      rule_type: ruleType,
      description: description || undefined,
      source,
      alert_type: alertType || undefined,
      script_name: scriptName || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add rule</DialogTitle>
          <DialogDescription>
            {RULE_TYPE_LABELS.accepted} ports don't alert again;{" "}
            {RULE_TYPE_LABELS.critical.toLowerCase()} ports alert as critical
            whenever they are open. Applies to every network unless you pick
            one.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="global-rule-source">Source</Label>
              <Select
                id="global-rule-source"
                value={source}
                onChange={(e) => {
                  setSource(e.target.value as RuleSource);
                  setAlertType("");
                  setScriptName("");
                }}
              >
                <option value="port">{ruleSourceLabel("port")}</option>
                <option value="ssh">{ruleSourceLabel("ssh")}</option>
                <option value="nse">{ruleSourceLabel("nse")}</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="global-rule-type">Rule</Label>
              <Select
                id="global-rule-type"
                value={ruleType}
                onChange={(e) =>
                  setRuleType(e.target.value as "accepted" | "critical")
                }
              >
                <option value="accepted">{RULE_TYPE_LABELS.accepted}</option>
                <option value="critical">{RULE_TYPE_LABELS.critical}</option>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="global-rule-scope">Applies to</Label>
            <Select
              id="global-rule-scope"
              value={networkId == null ? "" : String(networkId)}
              onChange={(e) =>
                setNetworkId(
                  e.target.value === "" ? null : Number(e.target.value),
                )
              }
            >
              <option value="">{EXPECTED_SCOPES.global}</option>
              {networks.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="global-rule-port">
                Port{source !== "port" ? " (optional)" : ""}
              </Label>
              <Input
                id="global-rule-port"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder={source === "ssh" ? "22" : "80"}
                className="font-mono"
              />
            </div>
            <div>
              <Label htmlFor="global-rule-ip">IP (optional)</Label>
              <Input
                id="global-rule-ip"
                value={ip}
                onChange={(e) => setIp(e.target.value)}
                placeholder="192.168.1.1"
                className="font-mono"
              />
            </div>
          </div>

          {source === "ssh" && (
            <div>
              <Label htmlFor="global-rule-alert-type">
                Alert type (optional)
              </Label>
              <Select
                id="global-rule-alert-type"
                value={alertType}
                onChange={(e) => setAlertType(e.target.value)}
              >
                <option value="">Any SSH check alert</option>
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
                <Label htmlFor="global-rule-alert-type">
                  Alert type (optional)
                </Label>
                <Select
                  id="global-rule-alert-type"
                  value={alertType}
                  onChange={(e) => setAlertType(e.target.value)}
                >
                  <option value="">Any vulnerability script alert</option>
                  {NSE_ALERT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="global-rule-script">
                  Script name (optional)
                </Label>
                <Input
                  id="global-rule-script"
                  value={scriptName}
                  onChange={(e) => setScriptName(e.target.value)}
                  placeholder="http-vuln-cve2017-5638"
                  className="font-mono"
                />
              </div>
            </>
          )}

          <div>
            <Label htmlFor="global-rule-description">Why (optional)</Label>
            <Input
              id="global-rule-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Why this rule exists"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!canSubmit || addRule.isPending}
          >
            {addRule.isPending ? "Adding..." : "Add rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
