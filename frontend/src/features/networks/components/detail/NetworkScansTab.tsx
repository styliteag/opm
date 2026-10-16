import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { EyeOff, Radar } from "lucide-react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/data-display/StatusBadge";
import { Button } from "@/components/ui/button";
import type { ScanSummary } from "@/lib/types";
import { formatRelativeTime, scanStatusVariant } from "@/lib/utils";
import {
  useHostDiscoveryScans,
  useNetworkMutations,
  useNetworkScans,
} from "../../hooks/useNetworkDetail";
import { formatDuration, triggerLabel } from "../../lib/networkLabels";
import { visibleScans } from "../../lib/networkList";

const MAX_SCANS = 50;

function ScanRow({ scan }: { scan: ScanSummary }) {
  const at = scan.started_at ?? scan.completed_at;
  return (
    <tr className="border-b border-border last:border-0 hover:bg-accent/40">
      <td className="px-4 py-2">
        <Link
          to="/scans/$scanId"
          params={{ scanId: String(scan.id) }}
          className="text-sm text-primary hover:text-primary/80"
        >
          #{scan.id}
        </Link>
        {scan.hidden && (
          <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
            <EyeOff className="h-3 w-3" />
            hidden
          </span>
        )}
      </td>
      <td className="px-4 py-2">
        <StatusBadge
          label={scan.status}
          variant={scanStatusVariant(scan.status)}
          dot
        />
      </td>
      <td className="px-4 py-2 text-sm text-muted-foreground">
        {triggerLabel(scan.trigger_type)}
      </td>
      <td className="px-4 py-2 text-sm tabular-nums text-foreground">
        {scan.port_count}
      </td>
      <td className="px-4 py-2 text-sm text-muted-foreground">
        {formatDuration(scan) ?? "—"}
      </td>
      <td className="px-4 py-2 text-sm text-muted-foreground">
        {at ? formatRelativeTime(at) : "—"}
      </td>
    </tr>
  );
}

function ScanHistory({ networkId }: { networkId: number }) {
  const [showHidden, setShowHidden] = useState(false);
  const scans = useNetworkScans(networkId);
  const all = scans.data?.scans ?? [];
  const hiddenCount = all.filter((s) => s.hidden).length;
  const list = visibleScans(all, showHidden).slice(0, MAX_SCANS);

  return (
    <section className="rounded-lg border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-4 py-3">
        <h3 className="text-sm font-strong text-foreground">Scans</h3>
        <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 rounded border-border bg-background"
            checked={showHidden}
            onChange={(e) => setShowHidden(e.target.checked)}
          />
          Show hidden scans ({hiddenCount})
        </label>
      </div>
      {scans.isLoading ? (
        <p className="p-4 text-sm text-muted-foreground">Loading scans…</p>
      ) : list.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No scans yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-4 py-2 font-emphasis">Scan</th>
                <th className="px-4 py-2 font-emphasis">Status</th>
                <th className="px-4 py-2 font-emphasis">Trigger</th>
                <th className="px-4 py-2 font-emphasis">Open ports</th>
                <th className="px-4 py-2 font-emphasis">Duration</th>
                <th className="px-4 py-2 font-emphasis">Started</th>
              </tr>
            </thead>
            <tbody>
              {list.map((scan) => (
                <ScanRow key={scan.id} scan={scan} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function HostDiscoveryRuns({
  networkId,
  canOperate,
}: {
  networkId: number;
  canOperate: boolean;
}) {
  const runs = useHostDiscoveryScans(networkId);
  const { triggerDiscovery } = useNetworkMutations();
  const list = (runs.data?.scans ?? []).slice(0, 10);

  return (
    <section className="rounded-lg border border-border">
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <div>
          <h3 className="text-sm font-strong text-foreground">Host discovery</h3>
          <p className="text-xs text-muted-foreground">
            Ping sweep that fills the host list (nmap).
          </p>
        </div>
        {canOperate && (
          <Button
            variant="outline"
            size="sm"
            disabled={triggerDiscovery.isPending}
            onClick={() =>
              triggerDiscovery.mutate(networkId, {
                onSuccess: () => toast.success("Host discovery started"),
                onError: (e) => toast.error(e.message),
              })
            }
          >
            <Radar />
            {triggerDiscovery.isPending ? "Starting…" : "Discover hosts"}
          </Button>
        )}
      </div>
      {list.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">
          No host discovery runs yet.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {list.map((run) => (
            <li
              key={run.id}
              className="flex items-center justify-between px-4 py-2 text-sm"
            >
              <span className="text-foreground">
                {run.hosts_discovered} hosts found
                <span className="ml-2 text-xs text-muted-foreground">
                  {triggerLabel(run.trigger_type)}
                </span>
              </span>
              <span className="flex items-center gap-3 text-xs text-muted-foreground">
                {run.completed_at && formatRelativeTime(run.completed_at)}
                <StatusBadge
                  label={run.status}
                  variant={scanStatusVariant(run.status)}
                  dot
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function NetworkScansTab({
  networkId,
  canOperate,
}: {
  networkId: number;
  canOperate: boolean;
}) {
  return (
    <div className="space-y-6">
      <ScanHistory networkId={networkId} />
      <HostDiscoveryRuns networkId={networkId} canOperate={canOperate} />
    </div>
  );
}
