import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import type { SortingState } from "@tanstack/react-table";
import { Download, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Select } from "@/components/ui/select";
import { LoadingState } from "@/components/data-display/LoadingState";
import { ErrorState } from "@/components/data-display/ErrorState";
import { EmptyState } from "@/components/data-display/EmptyState";
import { HostsTable } from "@/features/hosts/components/HostsTable";
import { GlobalPortsTable } from "@/features/hosts/components/GlobalPortsTable";
import { useHosts, useHostMutations } from "@/features/hosts/hooks/useHosts";
import { useGlobalPorts } from "@/features/hosts/hooks/useGlobalPorts";
import { useNetworks } from "@/features/dashboard/hooks/useDashboardData";

export const Route = createFileRoute("/_authenticated/hosts/")({
  component: HostsPage,
});

type ViewMode = "hosts" | "global-ports";

function HostsPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("hosts");
  const [search, setSearch] = useState("");
  const [networkId, setNetworkId] = useState<number | undefined>();
  const [staleness, setStaleness] = useState<"all" | "active" | "stale">("all");
  const [selectedHostIds, setSelectedHostIds] = useState<number[]>([]);
  const [page, setPage] = useState(0);
  const [hostsSorting, setHostsSorting] = useState<SortingState>([
    { id: "last_seen_at", desc: true },
  ]);
  const [portsSorting, setPortsSorting] = useState<SortingState>([
    { id: "ip", desc: false },
  ]);
  const limit = 50;

  const hostSortBy = hostsSorting[0]?.id;
  const hostSortDir = hostsSorting[0]?.desc
    ? ("desc" as const)
    : ("asc" as const);
  const portSortBy = portsSorting[0]?.id;
  const portSortDir = portsSorting[0]?.desc
    ? ("desc" as const)
    : ("asc" as const);

  const hosts = useHosts({
    ip_search: search || undefined,
    network_id: networkId,
    sort_by: hostSortBy,
    sort_dir: hostSortDir,
    offset: page * limit,
    limit,
  });
  const globalPorts = useGlobalPorts({
    network_id: networkId,
    service: search || undefined,
    staleness,
    sort_by: portSortBy,
    sort_dir: portSortDir,
    offset: page * limit,
    limit,
  });
  const networks = useNetworks();
  const { bulkDelete } = useHostMutations();

  const hostList = hosts.data?.hosts ?? [];
  const totalCount = hosts.data?.total_count ?? 0;
  const portList = globalPorts.data?.ports ?? [];

  const activeData = viewMode === "hosts" ? hosts : globalPorts;
  const isLoading = activeData.isLoading;
  const error = activeData.error;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-strong text-foreground">
            Host Inventory
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Discovered endpoints across monitored environments.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {totalCount > 0 && (
            <span className="text-sm text-emerald-400">
              {totalCount.toLocaleString()} Active
            </span>
          )}
          <a
            href="/api/hosts/export/csv"
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </a>
        </div>
      </div>

      {/* View Toggle */}
      <div className="flex items-center gap-1 rounded-lg border border-border p-1 w-fit">
        <button
          onClick={() => {
            setViewMode("hosts");
            setPage(0);
          }}
          className={`rounded-md px-3 py-1 text-sm font-emphasis transition-colors ${
            viewMode === "hosts"
              ? "bg-primary text-white"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Hosts
        </button>
        <button
          onClick={() => {
            setViewMode("global-ports");
            setPage(0);
          }}
          className={`rounded-md px-3 py-1 text-sm font-emphasis transition-colors ${
            viewMode === "global-ports"
              ? "bg-primary text-white"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Global Ports
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search hosts, IPs, or services..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="rounded-md border border-border bg-background py-1.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring w-72"
          />
        </div>
        <Select
          value={networkId ?? ""}
          onChange={(e) => {
            setNetworkId(e.target.value ? Number(e.target.value) : undefined);
            setPage(0);
          }}
        >
          <option value="">All Networks</option>
          {(networks.data?.networks ?? []).map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </Select>
        {viewMode === "hosts" && (
          <>
            <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
              <button
                onClick={() => setPage(0)}
                className="rounded px-2 py-1 text-xs font-emphasis text-muted-foreground"
                title="IPv4 + IPv6"
              >
                All
              </button>
              <button
                onClick={() => setPage(0)}
                className="rounded px-2 py-1 text-xs font-emphasis text-muted-foreground"
                title="IPv4 only"
              >
                IPv4
              </button>
              <button
                onClick={() => setPage(0)}
                className="rounded px-2 py-1 text-xs font-emphasis text-muted-foreground"
                title="IPv6 only"
              >
                IPv6
              </button>
            </div>
          </>
        )}
        {viewMode === "global-ports" && (
          <>
            <div className="flex gap-1">
              {["HTTP", "SSH", "DNS", "FTP", "SMB"].map((svc) => (
                <button
                  key={svc}
                  onClick={() => {
                    setSearch(
                      search === svc.toLowerCase() ? "" : svc.toLowerCase(),
                    );
                    setPage(0);
                  }}
                  className={`rounded-md px-2 py-1 text-xs font-emphasis transition-colors ${
                    search === svc.toLowerCase()
                      ? "bg-primary text-white"
                      : "bg-accent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {svc}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
              {(["all", "active", "stale"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setStaleness(s);
                    setPage(0);
                  }}
                  className={`rounded px-2 py-1 text-xs font-emphasis capitalize transition-colors ${
                    staleness === s
                      ? "bg-primary text-white"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {viewMode === "hosts" && selectedHostIds.length > 0 && (
        <div className="flex items-center gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-2">
          <span className="text-sm text-destructive">
            {selectedHostIds.length} selected
          </span>
          <button
            onClick={() => {
              if (
                confirm(`Delete ${selectedHostIds.length} host(s) permanently?`)
              ) {
                bulkDelete.mutate(
                  { host_ids: selectedHostIds },
                  {
                    onSuccess: () => {
                      toast.success(
                        `Deleted ${selectedHostIds.length} host(s)`,
                      );
                      setSelectedHostIds([]);
                    },
                    onError: (e) => toast.error(e.message),
                  },
                );
              }
            }}
            disabled={bulkDelete.isPending}
            className="flex items-center gap-1.5 rounded-md bg-destructive px-3 py-1 text-xs text-white hover:bg-destructive/90 transition-colors disabled:opacity-50"
          >
            <Trash2 className="h-3 w-3" />
            {bulkDelete.isPending ? "Deleting..." : "Delete"}
          </button>
          <button
            onClick={() => setSelectedHostIds([])}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        </div>
      )}

      {isLoading ? (
        <LoadingState rows={8} />
      ) : error ? (
        <ErrorState
          message={error.message}
          onRetry={() => activeData.refetch()}
        />
      ) : viewMode === "hosts" && hostList.length === 0 ? (
        <EmptyState
          title="No hosts found"
          message="No hosts match the current filters."
        />
      ) : viewMode === "global-ports" && portList.length === 0 ? (
        <EmptyState
          title="No open ports"
          message="No global ports match the current filters."
        />
      ) : (
        <>
          {viewMode === "hosts" ? (
            <HostsTable
              hosts={hostList}
              selectedIds={selectedHostIds}
              onSelectChange={setSelectedHostIds}
              sorting={hostsSorting}
              onSortingChange={(s) => {
                setHostsSorting(s);
                setPage(0);
              }}
            />
          ) : (
            <GlobalPortsTable
              ports={portList}
              sorting={portsSorting}
              onSortingChange={(s) => {
                setPortsSorting(s);
                setPage(0);
              }}
            />
          )}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {viewMode === "hosts"
                ? `Showing ${page * limit + 1}-${page * limit + hostList.length} of ${totalCount.toLocaleString()} hosts`
                : `Showing ${page * limit + 1}-${page * limit + portList.length} ports`}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="rounded-md border border-border px-3 py-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={
                  viewMode === "hosts"
                    ? page * limit + hostList.length >= totalCount
                    : portList.length < limit
                }
                className="rounded-md border border-border px-3 py-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
