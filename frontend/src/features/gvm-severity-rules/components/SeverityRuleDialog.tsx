import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { useSeverityRuleMutations, useSeverityRules } from "../hooks/useSeverityRules";
import type { GvmSeverityRule, SeverityLabel } from "../api";

interface SeverityRuleDialogProps {
  open: boolean;
  onClose: () => void;
  oid: string;
  findingName?: string;
  nativeSeverity?: string | null;
  networkId?: number | null;
  networkName?: string | null;
}

const SEVERITY_OPTIONS: SeverityLabel[] = [
  "info",
  "low",
  "medium",
  "high",
  "critical",
];

export function SeverityRuleDialog(props: SeverityRuleDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change severity for this finding</DialogTitle>
          <DialogDescription>
            {props.findingName ? `${props.findingName} · ` : ""}
            OID {props.oid}
            {props.nativeSeverity
              ? ` · scanner reports "${props.nativeSeverity}"`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <SeverityRuleDialogBody {...props} />
      </DialogContent>
    </Dialog>
  );
}

function SeverityRuleDialogBody({
  onClose,
  oid,
  networkId,
  networkName,
}: SeverityRuleDialogProps) {
  const [scope, setScope] = useState<"network" | "global">("global");

  const rulesQuery = useSeverityRules({ oid });
  const rules = rulesQuery.data?.rules ?? [];
  const networkRule: GvmSeverityRule | null =
    networkId != null
      ? rules.find((r) => r.network_id === networkId) ?? null
      : null;
  const globalRule: GvmSeverityRule | null =
    rules.find((r) => r.network_id == null) ?? null;
  const activeRule = scope === "network" ? networkRule : globalRule;

  // Keyed child: resets severity/reason when the scope or underlying rule changes.
  const formKey = `${scope}-${activeRule?.id ?? "new"}`;

  return (
    <>
      <div className="space-y-4 py-2">
        <div>
          <Label>Scope</Label>
          <div className="mt-1 flex gap-2">
            <Button
              type="button"
              variant={scope === "network" ? "default" : "outline"}
              size="sm"
              disabled={networkId == null}
              onClick={() => setScope("network")}
            >
              This network{networkName ? ` (${networkName})` : ""}
            </Button>
            <Button
              type="button"
              variant={scope === "global" ? "default" : "outline"}
              size="sm"
              onClick={() => setScope("global")}
            >
              All networks (global)
            </Button>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Network-scoped rules override the global rule for that network.
          </p>
        </div>

        <RuleEditor
          key={formKey}
          oid={oid}
          scope={scope}
          networkId={networkId ?? null}
          activeRule={activeRule}
          onClose={onClose}
        />
      </div>
    </>
  );
}

interface RuleEditorProps {
  oid: string;
  scope: "network" | "global";
  networkId: number | null;
  activeRule: GvmSeverityRule | null;
  onClose: () => void;
}

function RuleEditor({
  oid,
  scope,
  networkId,
  activeRule,
  onClose,
}: RuleEditorProps) {
  const [severity, setSeverity] = useState<SeverityLabel>(
    activeRule?.severity_override ?? "high",
  );
  const [reason, setReason] = useState<string>(activeRule?.reason ?? "");
  const { create, remove } = useSeverityRuleMutations();

  const onSave = () => {
    create.mutate(
      {
        oid,
        network_id: scope === "network" ? networkId : null,
        severity_override: severity,
        reason: reason || null,
      },
      {
        onSuccess: () => {
          toast.success("Severity rule saved");
          onClose();
        },
        onError: (e: unknown) =>
          toast.error(e instanceof Error ? e.message : "Failed to save rule"),
      },
    );
  };

  const onReset = () => {
    if (!activeRule) return;
    remove.mutate(activeRule.id, {
      onSuccess: () => {
        toast.success("Rule removed — reverts to scanner default");
        onClose();
      },
      onError: (e: unknown) =>
        toast.error(e instanceof Error ? e.message : "Failed to delete rule"),
    });
  };

  return (
    <>
      <div>
        <Label htmlFor="severity-override">Effective severity</Label>
        <Select
          id="severity-override"
          value={severity}
          onChange={(e) => setSeverity(e.target.value as SeverityLabel)}
        >
          {SEVERITY_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Findings are stored at the scanner's original severity; this only
          changes what triggers alerts.
        </p>
      </div>

      <div>
        <Label htmlFor="severity-reason">Reason (optional)</Label>
        <Textarea
          id="severity-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why is this severity changed?"
          rows={3}
        />
      </div>

      {activeRule && (
        <p className="text-xs text-muted-foreground">
          Existing rule: set to{" "}
          <strong>{activeRule.severity_override}</strong> by{" "}
          {activeRule.created_by_username ?? "unknown"} on{" "}
          {new Date(activeRule.created_at).toLocaleDateString()}
        </p>
      )}

      <DialogFooter>
        {activeRule && (
          <Button
            type="button"
            variant="outline"
            onClick={onReset}
            disabled={remove.isPending}
          >
            Reset to scanner default
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" onClick={onSave} disabled={create.isPending}>
          Save rule
        </Button>
      </DialogFooter>
    </>
  );
}
