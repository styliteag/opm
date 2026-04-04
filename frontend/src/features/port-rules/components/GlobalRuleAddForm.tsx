import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

  const resetForm = () => {
    setSource("port");
    setPort("");
    setIp("");
    setRuleType("accepted");
    setAlertType("");
    setScriptName("");
    setDescription("");
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
          <DialogTitle>Add Global Rule</DialogTitle>
          <DialogDescription>
            Create a new global alert acceptance or criticality rule.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
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
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                Port{source !== "port" ? " (optional)" : ""}
              </label>
              <Input
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder={source === "ssh" ? "22" : "80"}
                className="font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                IP (optional)
              </label>
              <Input
                value={ip}
                onChange={(e) => setIp(e.target.value)}
                placeholder="192.168.1.1"
                className="font-mono"
              />
            </div>
          </div>

          {source === "ssh" && (
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                Alert Type (optional)
              </label>
              <Select
                value={alertType}
                onChange={(e) => setAlertType(e.target.value)}
              >
                <option value="">Any SSH alert</option>
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
                  Alert Type (optional)
                </label>
                <Select
                  value={alertType}
                  onChange={(e) => setAlertType(e.target.value)}
                >
                  <option value="">Any NSE alert</option>
                  {NSE_ALERT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">
                  Script Name (optional)
                </label>
                <Input
                  value={scriptName}
                  onChange={(e) => setScriptName(e.target.value)}
                  placeholder="http-vuln-cve2017-5638"
                  className="font-mono"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Description
            </label>
            <Input
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
            {addRule.isPending ? "Adding..." : "Add Rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
