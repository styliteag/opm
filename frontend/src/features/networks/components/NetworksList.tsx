import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/data-display/EmptyState";
import { buttonVariants } from "@/components/ui/button";
import type { Network, Scanner, ScanSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useNetworkMutations } from "../hooks/useNetworkDetail";
import {
  networkOverridesSsh,
  sortNetworks,
  type NetworkSortField,
  type SortDir,
} from "../lib/networkList";
import { NetworkRow } from "./NetworkRow";

const SORT_OPTIONS: { field: NetworkSortField; label: string }[] = [
  { field: "name", label: "Name" },
  { field: "next_run", label: "Next run" },
  { field: "last_run", label: "Last run" },
  { field: "scanner", label: "Scanner" },
];

interface NetworksListProps {
  networks: Network[];
  scanners: Scanner[];
  latestScans: { network_id: number; scan: ScanSummary | null }[];
  canOperate: boolean;
  sshOverrideOnly: boolean;
  onClearFilter: () => void;
}

export function NetworksList({
  networks,
  scanners,
  latestScans,
  canOperate,
  sshOverrideOnly,
  onClearFilter,
}: NetworksListProps) {
  const [sortField, setSortField] = useState<NetworkSortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const { triggerScan } = useNetworkMutations();

  const ctx = useMemo(
    () => ({
      latestScans: new Map(latestScans.map((l) => [l.network_id, l.scan])),
      scannerNames: new Map(scanners.map((s) => [s.id, s.name])),
    }),
    [latestScans, scanners],
  );
  const visible = useMemo(
    () =>
      sortNetworks(
        sshOverrideOnly ? networks.filter(networkOverridesSsh) : networks,
        sortField,
        sortDir,
        ctx,
      ),
    [networks, sshOverrideOnly, sortField, sortDir, ctx],
  );

  const toggleSort = (field: NetworkSortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const scanNow = (network: Network) =>
    triggerScan.mutate(network.id, {
      onSuccess: () => toast.success(`Scan started for ${network.name}`),
      onError: (err) => toast.error(err.message),
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-strong text-foreground">Networks</h1>
        {canOperate && (
          <Link to="/networks/new" className={buttonVariants({ size: "sm" })}>
            <Plus />
            Add network
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {visible.length > 1 && (
          <div className="flex items-center gap-1.5" role="group" aria-label="Sort">
            <span className="mr-1 text-xs text-muted-foreground">Sort</span>
            {SORT_OPTIONS.map((opt) => {
              const active = sortField === opt.field;
              const Arrow = sortDir === "asc" ? ArrowUp : ArrowDown;
              return (
                <button
                  key={opt.field}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleSort(opt.field)}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-surface-2 text-text-quaternary hover:text-text-secondary",
                  )}
                >
                  {opt.label}
                  {active && <Arrow className="h-3 w-3" />}
                </button>
              );
            })}
          </div>
        )}
        {sshOverrideOnly && (
          <button
            type="button"
            onClick={onClearFilter}
            title="Remove filter"
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-emphasis text-primary transition-colors hover:bg-primary/20"
          >
            SSH override active · {visible.length} of {networks.length}
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={sshOverrideOnly ? "No networks with SSH override" : "No networks"}
          message={
            sshOverrideOnly
              ? "No network currently overrides the global SSH defaults."
              : "Add a network to start scanning."
          }
        />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {visible.map((network) => (
            <NetworkRow
              key={network.id}
              network={network}
              lastScan={ctx.latestScans.get(network.id)}
              canOperate={canOperate}
              scanPending={
                triggerScan.isPending && triggerScan.variables === network.id
              }
              onScanNow={scanNow}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
