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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useNetworks } from "@/features/dashboard/hooks/useDashboardData";

import { useSeverityRuleMutations } from "../hooks/useSeverityRules";
import type { GvmSeverityRule, SeverityLabel } from "../api";

const SEVERITY_OPTIONS: SeverityLabel[] = [
  "info",
  "low",
  "medium",
  "high",
  "critical",
];

type FormMode = { kind: "add" } | { kind: "edit"; rule: GvmSeverityRule };

interface SeverityRuleFormDialogProps {
  open: boolean;
  onClose: () => void;
  mode: FormMode;
}

export function SeverityRuleFormDialog({
  open,
  onClose,
  mode,
}: SeverityRuleFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode.kind === "add" ? "Add severity rule" : "Edit severity rule"}
          </DialogTitle>
          <DialogDescription>
            Overrides the severity reported by GVM, NSE, or nuclei for findings
            matching this OID. Network-scoped rules take precedence over global
            rules.
          </DialogDescription>
        </DialogHeader>
        <SeverityRuleFormBody mode={mode} onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
}

function SeverityRuleFormBody({
  mode,
  onClose,
}: {
  mode: FormMode;
  onClose: () => void;
}) {
  const isEdit = mode.kind === "edit";
  const initialRule = isEdit ? mode.rule : null;

  const [oid, setOid] = useState<string>(initialRule?.oid ?? "");
  const [networkId, setNetworkId] = useState<number | null>(
    initialRule?.network_id ?? null,
  );
  const [severity, setSeverity] = useState<SeverityLabel>(
    initialRule?.severity_override ?? "high",
  );
  const [reason, setReason] = useState<string>(initialRule?.reason ?? "");

  const networksQuery = useNetworks();
  const networks = networksQuery.data?.networks ?? [];
  const { create } = useSeverityRuleMutations();

  const onSave = () => {
    const trimmed = oid.trim();
    if (!trimmed) {
      toast.error("OID is required");
      return;
    }
    create.mutate(
      {
        oid: trimmed,
        network_id: networkId,
        severity_override: severity,
        reason: reason.trim() || null,
      },
      {
        onSuccess: () => {
          toast.success(isEdit ? "Rule updated" : "Rule added");
          onClose();
        },
        onError: (e: unknown) =>
          toast.error(e instanceof Error ? e.message : "Failed to save rule"),
      },
    );
  };

  return (
    <>
      <div className="space-y-4 py-2">
        <div>
          <Label htmlFor="rule-oid">OID</Label>
          <Input
            id="rule-oid"
            value={oid}
            onChange={(e) => setOid(e.target.value)}
            disabled={isEdit}
            placeholder="e.g. 1.3.6.1.4.1.25623.1.0.147232 or nse:dns-recursion"
            className="font-mono text-xs"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            GVM uses numeric OIDs; NSE uses <code>nse:&lt;script-name&gt;</code>;
            nuclei uses <code>&lt;template-id&gt;:&lt;matcher-name&gt;</code>.
          </p>
        </div>

        <div>
          <Label htmlFor="rule-scope">Scope</Label>
          <Select
            id="rule-scope"
            value={networkId == null ? "" : String(networkId)}
            onChange={(e) =>
              setNetworkId(e.target.value === "" ? null : Number(e.target.value))
            }
            disabled={isEdit}
          >
            <option value="">All networks (global)</option>
            {networks.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {isEdit
              ? "Scope is fixed for an existing rule — delete and re-add to change it."
              : "Network scope overrides the global rule for that network only."}
          </p>
        </div>

        <div>
          <Label htmlFor="rule-severity">Effective severity</Label>
          <Select
            id="rule-severity"
            value={severity}
            onChange={(e) => setSeverity(e.target.value as SeverityLabel)}
          >
            {SEVERITY_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor="rule-reason">Reason (optional)</Label>
          <Textarea
            id="rule-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this severity changed?"
            rows={3}
          />
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" onClick={onSave} disabled={create.isPending}>
          {isEdit ? "Save changes" : "Add rule"}
        </Button>
      </DialogFooter>
    </>
  );
}
