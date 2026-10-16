import { useState } from "react";
import type { SortingState } from "@tanstack/react-table";
import { Download, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/data-display/EmptyState";
import { ErrorState } from "@/components/data-display/ErrorState";
import { LoadingState } from "@/components/data-display/LoadingState";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useNetworks } from "@/features/dashboard/hooks/useDashboardData";
import { HostsTable } from "@/features/hosts/components/HostsTable";
import { useHostMutations, useHosts } from "@/features/hosts/hooks/useHosts";
import { exportHostsCsv } from "@/features/hosts/lib/exportHosts";
import { Pager } from "@/features/ports/components/ListControls";

const PAGE_SIZE = 50;

interface HostsTabProps {
  initialSearch?: string;
  initialNetworkId?: number;
}

/** Host inventory: search, network filter, inline hostname/comment, bulk delete. */
export function HostsTab({ initialSearch, initialNetworkId }: HostsTabProps) {
  const [search, setSearch] = useState(initialSearch ?? "");
  const [networkId, setNetworkId] = useState(initialNetworkId);
  const [page, setPage] = useState(0);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "last_seen_at", desc: true },
  ]);
  const [selected, setSelected] = useState<number[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const hosts = useHosts({
    ip_search: search || undefined,
    network_id: networkId,
    sort_by: sorting[0]?.id,
    sort_dir: sorting[0]?.desc ? "desc" : "asc",
    offset: page * PAGE_SIZE,
    limit: PAGE_SIZE,
  });
  const networks = useNetworks();
  const { bulkDelete } = useHostMutations();
  const list = hosts.data?.hosts ?? [];
  const total = hosts.data?.total_count ?? 0;

  const handleDelete = () =>
    bulkDelete.mutate(
      { host_ids: selected },
      {
        onSuccess: () => {
          toast.success(`Deleted ${selected.length} host(s)`);
          setSelected([]);
          setConfirmOpen(false);
        },
        onError: (e) => toast.error(e.message),
      },
    );

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportHostsCsv(networkId);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            aria-label="Search hosts"
            placeholder="Search IPs, hostnames, comments…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="w-72 rounded-md border border-border bg-background py-1.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <Select
          aria-label="Network"
          className="w-48"
          value={networkId ?? ""}
          onChange={(e) => {
            setNetworkId(e.target.value ? Number(e.target.value) : undefined);
            setPage(0);
          }}
        >
          <option value="">All networks</option>
          {(networks.data?.networks ?? []).map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </Select>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          disabled={exporting}
          onClick={handleExport}
        >
          <Download />
          {exporting ? "Exporting…" : "Export CSV"}
        </Button>
      </div>

      {selected.length > 0 && (
        <div className="flex items-center gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-2">
          <span className="text-sm text-destructive">
            {selected.length} selected
          </span>
          <Button
            variant="destructive"
            size="sm"
            disabled={bulkDelete.isPending}
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 />
            Delete
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
            Clear
          </Button>
        </div>
      )}

      {hosts.isLoading ? (
        <LoadingState rows={8} />
      ) : hosts.error ? (
        <ErrorState
          message={hosts.error.message}
          onRetry={() => hosts.refetch()}
        />
      ) : list.length === 0 ? (
        <EmptyState
          title="No hosts found"
          message="No hosts match the current filters."
        />
      ) : (
        <>
          <HostsTable
            hosts={list}
            selectedIds={selected}
            onSelectChange={setSelected}
            sorting={sorting}
            onSortingChange={(s) => {
              setSorting(s);
              setPage(0);
            }}
          />
          <Pager
            page={page}
            pageSize={PAGE_SIZE}
            shown={list.length}
            total={total}
            hasNext={page * PAGE_SIZE + list.length < total}
            noun="hosts"
            onPage={setPage}
          />
        </>
      )}

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => !open && setConfirmOpen(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selected.length} host{selected.length === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The host records (hostname, comment) are removed permanently.
              Their open ports stay; a later scan that finds them creates the
              hosts again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDelete.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={bulkDelete.isPending}
              onClick={handleDelete}
            >
              {bulkDelete.isPending ? "Deleting…" : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
