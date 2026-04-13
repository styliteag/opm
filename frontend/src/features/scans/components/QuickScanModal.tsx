import { useMemo, useState } from "react";
import { Zap, Clock, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useUiStore } from "@/stores/ui.store";
import { useNetworks } from "@/features/dashboard/hooks/useDashboardData";
import { useNseProfiles } from "@/features/nse/hooks/useNse";
import { useNetworkMutations } from "@/features/networks/hooks/useNetworkDetail";
import { computeScanEstimate } from "@/lib/scan-estimate";

type ScanType = "port" | "nse" | "discovery";

export function QuickScanModal() {
  const isOpen = useUiStore((s) => s.quickScanModalOpen);
  const close = useUiStore((s) => s.closeQuickScan);
  const [selectedNetwork, setSelectedNetwork] = useState<number | "">("");
  const [scanType, setScanType] = useState<ScanType>("port");
  const [selectedProfile, setSelectedProfile] = useState<number | "">("");

  const networks = useNetworks();
  const profiles = useNseProfiles();
  const { triggerScan, triggerDiscovery } = useNetworkMutations();

  const selectedNet = useMemo(
    () => (networks.data?.networks ?? []).find((n) => n.id === selectedNetwork),
    [networks.data, selectedNetwork],
  );

  const estimate = useMemo(() => {
    if (!selectedNet) return null;
    const pps = selectedNet.scan_rate ?? 1000;
    return computeScanEstimate(selectedNet.cidr, selectedNet.port_spec, pps);
  }, [selectedNet]);

  const handleScan = () => {
    if (!selectedNetwork) return;
    if (scanType === "nse" && !selectedProfile) {
      toast.error("Select an NSE profile");
      return;
    }
    const onSuccess = () => {
      toast.success(
        scanType === "discovery"
          ? "Host discovery triggered"
          : "Scan triggered successfully",
      );
      close();
      setSelectedNetwork("");
      setScanType("port");
      setSelectedProfile("");
    };
    const onError = (err: Error) => {
      toast.error(err.message);
    };
    const networkId = Number(selectedNetwork);
    if (scanType === "discovery") {
      triggerDiscovery.mutate(networkId, { onSuccess, onError });
    } else {
      triggerScan.mutate(networkId, { onSuccess, onError });
    }
  };

  const isPending = triggerScan.isPending || triggerDiscovery.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Quick Scan</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label>Select Network</Label>
            <Select
              value={selectedNetwork}
              onChange={(e) =>
                setSelectedNetwork(e.target.value ? Number(e.target.value) : "")
              }
            >
              <option value="">Choose a network...</option>
              {(networks.data?.networks ?? []).map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name} ({n.cidr})
                </option>
              ))}
            </Select>
          </div>

          {estimate && scanType === "port" && (
            <div
              className="rounded-md border border-border bg-accent/50 p-3"
              title={estimate.tooltip}
            >
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Est. Runtime:</span>
                <span className={`font-emphasis ${estimate.color}`}>
                  {estimate.display}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {estimate.ips.toLocaleString()} IPs &times;{" "}
                {estimate.ports.toLocaleString()} ports @{" "}
                {estimate.pps.toLocaleString()} pps
              </p>
            </div>
          )}

          <div>
            <Label>Scan Type</Label>
            <div className="flex gap-2">
              {(
                [
                  { value: "port", label: "Port Scan" },
                  { value: "discovery", label: "Host Discovery" },
                  { value: "nse", label: "NSE Vulnerability" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setScanType(opt.value)}
                  className={`flex-1 rounded-md px-3 py-2 text-sm font-emphasis transition-colors ${
                    scanType === opt.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-surface-2 text-text-quaternary hover:text-text-secondary"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {scanType === "nse" && (
            <div>
              <Label>NSE Profile</Label>
              <Select
                value={selectedProfile}
                onChange={(e) =>
                  setSelectedProfile(
                    e.target.value ? Number(e.target.value) : "",
                  )
                }
              >
                <option value="">Choose a profile...</option>
                {(profiles.data?.profiles ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.nse_scripts.length} scripts)
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button
            onClick={handleScan}
            disabled={
              !selectedNetwork ||
              (scanType === "nse" && !selectedProfile) ||
              isPending
            }
          >
            {scanType === "discovery" ? (
              <Search className="h-4 w-4" />
            ) : (
              <Zap className="h-4 w-4" />
            )}
            {isPending
              ? "Starting..."
              : scanType === "nse"
                ? "Start NSE Scan"
                : scanType === "discovery"
                  ? "Start Host Discovery"
                  : "Start Port Scan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
