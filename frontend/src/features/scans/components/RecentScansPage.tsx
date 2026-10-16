import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { EyeOff } from "lucide-react";

import { ErrorState } from "@/components/data-display/ErrorState";
import { LoadingState } from "@/components/data-display/LoadingState";
import { StatusBadge } from "@/components/data-display/StatusBadge";
import { formatDuration, triggerLabel } from "@/features/networks/lib/networkLabels";
import { Pager, SegmentedControl } from "@/features/ports/components/ListControls";
import type { Network, ScanListItem } from "@/lib/types";
import { formatRelativeTime, scanStatusVariant } from "@/lib/utils";

import { useRecentScans } from "../hooks/useRecentScans";
import { activeScanLabel } from "../lib/activeScans";
import {
  SCAN_STATUS_PRESET_LABEL,
  SCAN_STATUS_PRESETS,
  SCANS_PAGE_SIZE,
  type ScanStatusPreset,
} from "../lib/scansQuery";

const STATUS_OPTIONS = SCAN_STATUS_PRESETS.map((key) => ({
  key,
  label: SCAN_STATUS_PRESET_LABEL[key],
}));

interface RecentScansPageProps {
  networks: Network[];
  status: ScanStatusPreset;
  networkId?: number;
  onFiltersChange: (filters: { status: ScanStatusPreset; networkId?: number }) => void;
}

function ScanRow({ scan }: { scan: ScanListItem }) {
  const at = scan.started_at ?? scan.completed_at;
  const active = scan.status === "planned" || scan.status === "running";
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
            <EyeOff className="h-3 w-3" aria-hidden />
            hidden
          </span>
        )}
      </td>
      <td className="px-4 py-2">
        <Link
          to="/networks/$networkId"
          params={{ networkId: String(scan.network_id) }}
          className="text-sm text-foreground hover:text-primary"
        >
          {scan.network_name}
        </Link>
      </td>
      <td className="px-4 py-2">
        {active ? (
          <span className="text-sm text-primary">{activeScanLabel(scan)}</span>
        ) : (
          <StatusBadge label={scan.status} variant={scanStatusVariant(scan.status)} dot />
        )}
      </td>
      <td className="px-4 py-2 text-sm tabular-nums text-foreground">{scan.port_count}</td>
      <td className="px-4 py-2 text-sm text-muted-foreground">{formatDuration(scan) ?? "—"}</td>
      <td className="px-4 py-2 text-sm text-muted-foreground">{at ? formatRelativeTime(at) : "—"}</td>
      <td className="px-4 py-2 text-sm text-muted-foreground">{triggerLabel(scan.trigger_type)}</td>
      <td className="px-4 py-2 text-sm text-muted-foreground">{scan.scanner_name}</td>
    </tr>
  );
}

/** Recent scans across all networks — linked from Home and Networks, not in the sidebar. */
export function RecentScansPage({
  networks,
  status,
  networkId,
  onFiltersChange,
}: RecentScansPageProps) {
  const [page, setPage] = useState(0);
  const [showHidden, setShowHidden] = useState(false);
  const scans = useRecentScans({ status, networkId, showHidden, page });
  const list = scans.data?.scans ?? [];

  const setFilters = (next: { status: ScanStatusPreset; networkId?: number }) => {
    setPage(0);
    onFiltersChange(next);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-strong tracking-tight text-foreground">Recent scans</h1>
        <p className="text-sm text-muted-foreground">
          Every scan across all networks, newest first.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl
          label="Scan status"
          options={STATUS_OPTIONS}
          value={status}
          onChange={(s) => setFilters({ status: s, networkId })}
        />
        <select
          aria-label="Network"
          value={networkId ?? ""}
          onChange={(e) =>
            setFilters({ status, networkId: e.target.value ? Number(e.target.value) : undefined })
          }
          className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground"
        >
          <option value="">All networks</option>
          {networks.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
        <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 rounded border-border bg-background"
            checked={showHidden}
            onChange={(e) => {
              setPage(0);
              setShowHidden(e.target.checked);
            }}
          />
          Show hidden scans
        </label>
      </div>

      {scans.isLoading ? (
        <LoadingState rows={6} />
      ) : scans.error ? (
        <ErrorState message={scans.error.message} onRetry={() => void scans.refetch()} />
      ) : list.length === 0 ? (
        <p className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">
          No scans match these filters.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-card text-xs text-muted-foreground">
                <th className="px-4 py-2 font-emphasis">Scan</th>
                <th className="px-4 py-2 font-emphasis">Network</th>
                <th className="px-4 py-2 font-emphasis">Status</th>
                <th className="px-4 py-2 font-emphasis">Open ports</th>
                <th className="px-4 py-2 font-emphasis">Duration</th>
                <th className="px-4 py-2 font-emphasis">Started</th>
                <th className="px-4 py-2 font-emphasis">Trigger</th>
                <th className="px-4 py-2 font-emphasis">Scanner</th>
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

      {list.length > 0 && (
        <Pager
          page={page}
          pageSize={SCANS_PAGE_SIZE}
          shown={list.length}
          hasNext={list.length === SCANS_PAGE_SIZE}
          noun="scans"
          onPage={setPage}
        />
      )}
    </div>
  );
}
