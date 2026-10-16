import { useMemo, useState } from "react";
import { Clock, Search, Zap } from "lucide-react";
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
import { AdvancedSettings } from "@/components/disclosure/AdvancedSettings";
import { useNetworks } from "@/features/dashboard/hooks/useDashboardData";
import { useNseProfiles } from "@/features/nse/hooks/useNse";
import { useNetworkMutations } from "@/features/networks/hooks/useNetworkDetail";
import { scanTypeLabel } from "@/features/networks/lib/networkLabels";
import { computeScanEstimate } from "@/lib/scan-estimate";
import { TOOL_LABELS } from "@/lib/terminology";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui.store";
import { useScanMutations } from "../hooks/useScans";

// The v3 "NSE" mode never sent its profile (inventory bug #1). The profile
// now lives under advanced settings and goes to POST /api/nse/scan.
type ScanKind = "scan" | "discovery";

const KINDS: { value: ScanKind; label: string; help: string }[] = [
  {
    value: "scan",
    label: "Scan now",
    help: "Runs the network's normal scan with all its settings.",
  },
  {
    value: "discovery",
    label: "Find live hosts",
    help: "Ping sweep only (host discovery); no port scan.",
  },
];

/** Sidebar "Scan Now": start a scan of any network (operator+). */
export function QuickScanModal() {
  const isOpen = useUiStore((s) => s.quickScanModalOpen);
  const close = useUiStore((s) => s.closeQuickScan);
  const [networkId, setNetworkId] = useState<number | "">("");
  const [kind, setKind] = useState<ScanKind>("scan");
  const [profileId, setProfileId] = useState<number | "">("");

  const networks = useNetworks();
  const profiles = useNseProfiles();
  const { triggerScan, triggerDiscovery } = useNetworkMutations();
  const { triggerNse } = useScanMutations();

  const selected = useMemo(
    () => (networks.data?.networks ?? []).find((n) => n.id === networkId),
    [networks.data, networkId],
  );
  const estimate = useMemo(
    () =>
      selected && selected.scanner_type !== "greenbone"
        ? computeScanEstimate(
            selected.cidr,
            selected.port_spec,
            selected.scan_rate ?? 1000,
          )
        : null,
    [selected],
  );

  const reset = () => {
    setNetworkId("");
    setKind("scan");
    setProfileId("");
  };
  // NSE does not run in the Greenbone pipeline, so no profile choice there.
  const canPickProfile = selected?.scanner_type !== "greenbone";

  const start = () => {
    if (!networkId) return;
    const options = {
      onSuccess: () => {
        toast.success(
          kind === "discovery" ? "Host discovery started" : "Scan started",
        );
        close();
        reset();
      },
      onError: (err: Error) => toast.error(err.message),
    };
    if (kind === "discovery") triggerDiscovery.mutate(networkId, options);
    else if (profileId && canPickProfile)
      triggerNse.mutate({ networkId, profileId }, options);
    else triggerScan.mutate(networkId, options);
  };

  const pending =
    triggerScan.isPending || triggerDiscovery.isPending || triggerNse.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Scan a network</DialogTitle>
          <DialogDescription>
            Starts right away on the network&apos;s scanner.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="quick-scan-network">Network</Label>
            <Select
              id="quick-scan-network"
              value={networkId}
              onChange={(e) =>
                setNetworkId(e.target.value ? Number(e.target.value) : "")
              }
            >
              <option value="">Choose a network…</option>
              {(networks.data?.networks ?? []).map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name} ({n.cidr})
                </option>
              ))}
            </Select>
            {selected && (
              <p className="mt-1 text-xs text-muted-foreground">
                {scanTypeLabel(selected.scanner_type)}
                {selected.nuclei_enabled && " + web vulnerability check"}
              </p>
            )}
          </div>

          <div role="radiogroup" aria-label="What to run" className="space-y-2">
            {KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                role="radio"
                aria-checked={kind === k.value}
                onClick={() => setKind(k.value)}
                className={cn(
                  "w-full cursor-pointer rounded-md border px-3 py-2 text-left transition-colors",
                  kind === k.value
                    ? "border-primary/40 bg-primary/10"
                    : "border-border hover:bg-accent",
                )}
              >
                <span className="block text-sm font-emphasis text-foreground">
                  {k.label}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {k.help}
                </span>
              </button>
            ))}
          </div>

          {kind === "scan" && canPickProfile && (
            <AdvancedSettings
              summary={
                profileId
                  ? `${TOOL_LABELS.nse}: ${profiles.data?.profiles.find((p) => p.id === profileId)?.name ?? ""}`
                  : `${TOOL_LABELS.nse}: network default`
              }
            >
              <div>
                <Label htmlFor="quick-scan-profile">
                  NSE profile — {TOOL_LABELS.nse}
                </Label>
                <Select
                  id="quick-scan-profile"
                  value={profileId}
                  onChange={(e) =>
                    setProfileId(e.target.value ? Number(e.target.value) : "")
                  }
                >
                  <option value="">Network default</option>
                  {(profiles.data?.profiles ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.nse_scripts.length} scripts)
                    </option>
                  ))}
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Runs these nmap NSE scripts after the port scan, for this scan
                  only. Not applied if the network has its {TOOL_LABELS.nse}{" "}
                  phase switched off.
                </p>
              </div>
            </AdvancedSettings>
          )}

          {estimate && kind === "scan" && estimate.ips > 0 && (
            <div
              className="flex items-center gap-2 rounded-md border border-border bg-accent/50 p-3 text-sm"
              title={estimate.tooltip}
            >
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Estimated runtime:</span>
              <span className={cn("font-emphasis", estimate.color)}>
                {estimate.display}
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button onClick={start} disabled={!networkId || pending}>
            {kind === "discovery" ? <Search /> : <Zap />}
            {pending
              ? "Starting…"
              : kind === "discovery"
                ? "Find live hosts"
                : "Start scan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
