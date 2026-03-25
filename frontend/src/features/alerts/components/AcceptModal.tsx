import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAlertMutations } from "@/features/alerts/hooks/useAlerts";

type AcceptScope = "global" | "network";

interface AcceptModalProps {
  alertIds: number[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  networks?: { id: number; name: string }[];
  defaultScope?: AcceptScope;
}

export function AcceptModal({
  alertIds,
  open,
  onOpenChange,
  onSuccess,
  networks = [],
  defaultScope = "global",
}: AcceptModalProps) {
  const [reason, setReason] = useState("");
  const [scope, setScope] = useState<AcceptScope>(defaultScope);
  const [networkId, setNetworkId] = useState<number | "">("");
  const { bulkAcceptGlobal, bulkAcceptNetwork } = useAlertMutations();

  const isBulk = alertIds.length > 1;

  const handleAccept = () => {
    const trimmed = reason.trim();
    if (!trimmed) return;

    if (scope === "network") {
      if (!networkId) return;
      bulkAcceptNetwork.mutate(
        {
          alert_ids: alertIds,
          network_id: Number(networkId),
          reason: trimmed,
        },
        {
          onSuccess: () => {
            toast.success(`${alertIds.length} alert(s) accepted for network`);
            handleClose();
          },
          onError: (e) => toast.error(e.message),
        },
      );
    } else {
      bulkAcceptGlobal.mutate(
        { alert_ids: alertIds, reason: trimmed },
        {
          onSuccess: () => {
            toast.success(`${alertIds.length} alert(s) accepted globally`);
            handleClose();
          },
          onError: (e) => toast.error(e.message),
        },
      );
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setReason("");
    setScope(defaultScope);
    setNetworkId("");
    onSuccess?.();
  };

  const isPending = bulkAcceptGlobal.isPending || bulkAcceptNetwork.isPending;
  const canSubmit =
    reason.trim().length > 0 && (scope === "global" || networkId !== "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isBulk ? `Accept ${alertIds.length} Alerts` : "Accept Alert"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Accepting creates a{" "}
            <span className="font-medium text-foreground">permanent rule</span>{" "}
            that suppresses future alerts for the same port/condition.
            {isBulk ? " This applies to all selected alerts." : ""} Unlike
            dismiss, accepted ports{" "}
            <span className="font-medium text-foreground">
              will not trigger alerts on future scans
            </span>
            .
          </p>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Scope
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setScope("global")}
                className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors ${
                  scope === "global"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <div className="font-medium">Global</div>
                <div className="text-xs mt-0.5 opacity-80">
                  Suppresses across all networks
                </div>
              </button>
              <button
                onClick={() => setScope("network")}
                className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors ${
                  scope === "network"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <div className="font-medium">Network</div>
                <div className="text-xs mt-0.5 opacity-80">
                  Suppresses only in one network
                </div>
              </button>
            </div>
          </div>

          {scope === "network" && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Network <span className="text-destructive">*</span>
              </label>
              <select
                value={networkId}
                onChange={(e) =>
                  setNetworkId(e.target.value ? Number(e.target.value) : "")
                }
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Choose a network...</option>
                {networks.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Reason <span className="text-destructive">*</span>
            </label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this port/condition being accepted? (e.g. 'Known SMTP relay, monitored by ops team')"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleAccept} disabled={isPending || !canSubmit}>
            {isPending
              ? "Accepting..."
              : scope === "global"
                ? "Accept Globally"
                : "Accept for Network"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
