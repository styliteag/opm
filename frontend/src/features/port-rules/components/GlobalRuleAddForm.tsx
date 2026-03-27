import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { postApi } from "@/lib/api";
import { SSH_ALERT_TYPES, NSE_ALERT_TYPES } from "@/lib/alert-types";
import type { RuleSource } from "../types";

const SELECT_CLASS =
  "rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

interface GlobalRuleAddFormProps {
  onAdded: () => void;
}

export function GlobalRuleAddForm({ onAdded }: GlobalRuleAddFormProps) {
  const [source, setSource] = useState<RuleSource>("port");
  const [port, setPort] = useState("");
  const [ip, setIp] = useState("");
  const [ruleType, setRuleType] = useState<"accepted" | "critical">("accepted");
  const [alertType, setAlertType] = useState("");
  const [scriptName, setScriptName] = useState("");
  const [description, setDescription] = useState("");

  const addRule = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      postApi("/api/port-rules", data),
    onSuccess: () => {
      toast.success("Rule added");
      setPort("");
      setIp("");
      setAlertType("");
      setScriptName("");
      setDescription("");
      onAdded();
    },
    onError: (e) => toast.error(e.message),
  });

  const canSubmit = source === "port" ? Boolean(port) : true;

  return (
    <div className="border-b border-border bg-accent/30 px-5 py-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            Source
          </label>
          <select
            value={source}
            onChange={(e) => {
              setSource(e.target.value as RuleSource);
              setAlertType("");
              setScriptName("");
            }}
            className={SELECT_CLASS}
          >
            <option value="port">Port</option>
            <option value="ssh">SSH</option>
            <option value="nse">NSE</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            Port{source !== "port" ? " (optional)" : ""}
          </label>
          <Input
            value={port}
            onChange={(e) => setPort(e.target.value)}
            placeholder={source === "ssh" ? "22" : "80"}
            className="w-24 font-mono"
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
            className="w-36 font-mono"
          />
        </div>

        {source === "ssh" && (
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Alert Type (optional)
            </label>
            <select
              value={alertType}
              onChange={(e) => setAlertType(e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="">Any SSH alert</option>
              {SSH_ALERT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {source === "nse" && (
          <>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                Alert Type (optional)
              </label>
              <select
                value={alertType}
                onChange={(e) => setAlertType(e.target.value)}
                className={SELECT_CLASS}
              >
                <option value="">Any NSE alert</option>
                {NSE_ALERT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                Script Name (optional)
              </label>
              <Input
                value={scriptName}
                onChange={(e) => setScriptName(e.target.value)}
                placeholder="http-vuln-cve2017-5638"
                className="w-52 font-mono"
              />
            </div>
          </>
        )}

        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            Type
          </label>
          <select
            value={ruleType}
            onChange={(e) =>
              setRuleType(e.target.value as "accepted" | "critical")
            }
            className={SELECT_CLASS}
          >
            <option value="accepted">Accepted</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs text-muted-foreground mb-1">
            Description
          </label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Why this rule exists"
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
      </div>
    </div>
  );
}
