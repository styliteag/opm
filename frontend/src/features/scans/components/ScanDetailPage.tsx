import { Link } from "@tanstack/react-router";
import { ArrowLeft, Eye, EyeOff, XCircle } from "lucide-react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/data-display/StatusBadge";
import { AdvancedSettings } from "@/components/disclosure/AdvancedSettings";
import { Button } from "@/components/ui/button";
import {
  formatDuration,
  triggerLabel,
} from "@/features/networks/lib/networkLabels";
import { useNetworkDetail } from "@/features/networks/hooks/useNetworkDetail";
import { useHasRole } from "@/lib/roles";
import { formatDate, formatRate, scanStatusVariant } from "@/lib/utils";
import { useHostIdsByIp } from "../hooks/useScanHosts";
import { useScanMutations, type ScanDetail } from "../hooks/useScans";
import { NucleiSummaryCard } from "./NucleiSummaryCard";
import { ScanDiffView } from "./ScanDiffView";
import { ScanEngineLogs } from "./ScanEngineLogs";
import { ScanFindings } from "./ScanFindings";
import { ScanPortsTable } from "./ScanPortsTable";

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-emphasis text-foreground">{value}</p>
    </div>
  );
}

export function ScanDetailPage({ scan }: { scan: ScanDetail }) {
  const { cancel, toggleVisibility } = useScanMutations();
  const canOperate = useHasRole("operator");
  const hostIds = useHostIdsByIp(scan.network_id);
  const isActive = scan.status === "running" || scan.status === "planned";
  // The scan detail response carries no network name; fetch it.
  const network = useNetworkDetail(scan.network_id);
  const networkName = scan.network_name ?? network.data?.name ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Link
          to="/networks/$networkId"
          params={{ networkId: String(scan.network_id) }}
          search={{ tab: "scans" }}
          aria-label="Back to the network's scans"
          className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-strong text-foreground">
            Scan #{scan.id}
          </h1>
          <p className="text-sm text-muted-foreground">
            <Link
              to="/networks/$networkId"
              params={{ networkId: String(scan.network_id) }}
              className="transition-colors hover:text-primary"
            >
              {networkName ?? `Network #${scan.network_id}`}
            </Link>
            {scan.scanner_name && ` · scanner ${scan.scanner_name}`}
            {scan.hidden && " · hidden from the scan list"}
          </p>
        </div>
        <StatusBadge
          label={scan.status}
          variant={scanStatusVariant(scan.status)}
          dot
        />
        {canOperate && (
          <Button
            variant="outline"
            size="sm"
            disabled={toggleVisibility.isPending}
            onClick={() =>
              toggleVisibility.mutate(
                { scanId: scan.id, hidden: !scan.hidden },
                {
                  onSuccess: () =>
                    toast.success(scan.hidden ? "Scan shown" : "Scan hidden"),
                  onError: (e) => toast.error(e.message),
                },
              )
            }
          >
            {scan.hidden ? <Eye /> : <EyeOff />}
            {scan.hidden ? "Show in list" : "Hide from list"}
          </Button>
        )}
        {canOperate && isActive && (
          <Button
            variant="destructive"
            size="sm"
            disabled={cancel.isPending}
            onClick={() =>
              cancel.mutate(scan.id, {
                onSuccess: () => toast.success("Scan cancelled"),
                onError: (e) => toast.error(e.message),
              })
            }
          >
            <XCircle />
            Cancel scan
          </Button>
        )}
      </div>

      {isActive && scan.progress_percent != null && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-2 flex justify-between text-sm text-muted-foreground">
            <span>{scan.progress_message ?? "Scanning…"}</span>
            <span>{scan.progress_percent}%</span>
          </div>
          <div className="h-2 rounded-full bg-border">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${scan.progress_percent}%` }}
            />
          </div>
          {scan.actual_rate != null && scan.actual_rate > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Scan rate: {formatRate(scan.actual_rate)}
            </p>
          )}
        </div>
      )}

      {scan.status === "failed" && scan.error_message && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
          {scan.error_message}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Info
          label="Open ports found"
          value={String(scan.port_count ?? scan.open_ports?.length ?? 0)}
        />
        <Info label="Trigger" value={triggerLabel(scan.trigger_type)} />
        <Info
          label="Started"
          value={scan.started_at ? formatDate(scan.started_at) : "—"}
        />
        <Info label="Duration" value={formatDuration(scan) ?? "—"} />
      </div>

      {scan.status === "completed" && <ScanDiffView scanId={scan.id} />}

      <ScanFindings
        scanId={scan.id}
        networkId={scan.network_id}
        networkName={networkName}
        hostIds={hostIds}
        canOperate={canOperate}
      />

      {scan.nuclei_summary && (
        <NucleiSummaryCard summary={scan.nuclei_summary} scanStatus={scan.status} />
      )}

      <ScanPortsTable ports={scan.open_ports ?? []} hostIds={hostIds} />

      <AdvancedSettings summary="Engine logs">
        <ScanEngineLogs scanId={scan.id} />
      </AdvancedSettings>
    </div>
  );
}
