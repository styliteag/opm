import { useState, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import type { SortingState } from "@tanstack/react-table";
import { Download, ChevronDown, FileText, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { LoadingState } from "@/components/data-display/LoadingState";
import { ErrorState } from "@/components/data-display/ErrorState";
import { EmptyState } from "@/components/data-display/EmptyState";
import { SeverityBadge } from "@/components/data-display/SeverityBadge";
import { Select } from "@/components/ui/select";
import { AlertsTable } from "@/features/alerts/components/AlertsTable";
import { AlertFilters } from "@/features/alerts/components/AlertFilters";
import { DismissModal } from "@/features/alerts/components/DismissModal";
import { AcceptModal } from "@/features/alerts/components/AcceptModal";
import { DeleteConfirmModal } from "@/features/alerts/components/DeleteConfirmModal";
import {
  useAlerts,
  useAlertMutations,
} from "@/features/alerts/hooks/useAlerts";
import { useNetworks } from "@/features/dashboard/hooks/useDashboardData";
import { useAuthStore } from "@/stores/auth.store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AlertType, Severity } from "@/lib/types";

interface SearchParams {
  severity?: Severity;
  type?: AlertType;
  source?: "port" | "ssh" | "nse";
  network_id?: number;
  dismissed?: boolean;
  search?: string;
  port?: number;
}

export const Route = createFileRoute("/_authenticated/alerts/")({
  component: AlertsPage,
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    severity: search.severity as Severity | undefined,
    type: search.type as AlertType | undefined,
    source: search.source as "port" | "ssh" | "nse" | undefined,
    network_id: search.network_id ? Number(search.network_id) : undefined,
    dismissed:
      search.dismissed !== undefined
        ? search.dismissed === "true" || search.dismissed === true
        : undefined,
    search: search.search as string | undefined,
    port: search.port ? Number(search.port) : undefined,
  }),
});

type FilterState = SearchParams;

function AlertsPage() {
  const searchParams = Route.useSearch();
  const initialFilters: FilterState = {
    dismissed: false,
    ...Object.fromEntries(
      Object.entries(searchParams).filter(([, v]) => v !== undefined),
    ),
  };
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "created_at", desc: true },
  ]);

  const [dismissTarget, setDismissTarget] = useState<{
    ids: number[];
    port?: number;
  } | null>(null);
  const [acceptTarget, setAcceptTarget] = useState<{
    ids: number[];
  } | null>(null);

  const sortBy = sorting[0]?.id;
  const sortDir = sorting[0]?.desc ? ("desc" as const) : ("asc" as const);

  const limit = pageSize === 0 ? 200 : pageSize;
  const alerts = useAlerts({
    ...filters,
    sort_by: sortBy,
    sort_dir: sortDir,
    offset: page * limit,
    limit,
  });
  const networks = useNetworks();
  const { bulkDelete, reopen } = useAlertMutations();

  const [deleteTarget, setDeleteTarget] = useState<number[] | null>(null);

  const alertList = alerts.data?.alerts ?? [];
  const totalAlerts = alerts.data?.total ?? 0;
  const severityCounts = alerts.data?.severity_counts ?? {};
  const criticalCount = severityCounts.critical ?? 0;
  const highCount = severityCounts.high ?? 0;

  const networkList = (networks.data?.networks ?? []).map((n) => ({
    id: n.id,
    name: n.name,
  }));

  const handleReopen = (alertId: number) => {
    reopen.mutate(alertId, {
      onSuccess: () => toast.success("Alert reopened"),
      onError: (e) => toast.error(e.message),
    });
  };

  const handleDelete = (alertId: number) => {
    // Compute severity for the single alert being deleted
    const alert = alertList.find((a) => a.id === alertId);
    const singleSeverity: Record<string, number> = {};
    if (alert) singleSeverity[alert.severity] = 1;
    setDeleteTarget([alertId]);
  };

  const exportAlerts = useCallback(
    async (format: "csv" | "pdf") => {
      const params = new URLSearchParams();
      if (filters.type) params.set("type", filters.type);
      if (filters.source) params.set("source", filters.source);
      if (filters.network_id)
        params.set("network_id", String(filters.network_id));
      if (filters.dismissed !== undefined)
        params.set("dismissed", String(filters.dismissed));
      if (filters.port) params.set("port", String(filters.port));
      if (filters.search) params.set("search", filters.search);
      const qs = params.toString();
      const url = `/api/alerts/export/${format}${qs ? `?${qs}` : ""}`;
      const token = useAuthStore.getState().token;
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        toast.error(`Export failed: ${res.statusText}`);
        return;
      }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `alerts.${format}`;
      a.click();
      URL.revokeObjectURL(a.href);
    },
    [filters],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-strong text-foreground">
            Alert Triage Center
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Intelligence-led prioritization of surface findings.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <SeverityBadge severity="critical" />
            <span className="text-sm font-emphasis text-foreground">
              {criticalCount}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <SeverityBadge severity="high" />
            <span className="text-sm font-emphasis text-foreground">
              {highCount}
            </span>
          </div>
          <button
            onClick={() => alerts.refetch()}
            disabled={alerts.isFetching}
            className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
            title="Refresh"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${alerts.isFetching ? "animate-spin" : ""}`}
            />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <Download className="h-3.5 w-3.5" />
              Export
              <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => exportAlerts("csv")}>
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Export CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportAlerts("pdf")}>
                <FileText className="h-3.5 w-3.5 mr-1.5" />
                Export PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <AlertFilters
          filters={filters}
          onChange={(f) => {
            setFilters(f);
            setPage(0);
          }}
          networks={networkList}
        />
        <Select
          value={String(pageSize)}
          onChange={(e) => {
            setPageSize(Number(e.target.value));
            setPage(0);
          }}
          className="w-auto shrink-0 text-xs"
        >
          <option value="50">50 per page</option>
          <option value="100">100 per page</option>
          <option value="200">200 per page</option>
          <option value="0">All</option>
        </Select>
      </div>

      {selectedIds.length > 0 && (
        <div className="flex items-center gap-3 rounded-md border border-primary/30 bg-primary/5 px-4 py-2">
          <span className="text-sm text-primary">
            {selectedIds.length} selected
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1 text-xs text-white hover:bg-primary/90 transition-colors">
              Bulk Actions
              <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                onClick={() => setDismissTarget({ ids: selectedIds })}
              >
                Bulk Dismiss
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setAcceptTarget({ ids: selectedIds })}
              >
                Accept (create rule)
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => setDeleteTarget(selectedIds)}
              >
                Delete Permanently
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            onClick={() => setSelectedIds([])}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        </div>
      )}

      {alerts.isLoading ? (
        <LoadingState rows={8} />
      ) : alerts.error ? (
        <ErrorState
          message={alerts.error.message}
          onRetry={() => alerts.refetch()}
        />
      ) : alertList.length === 0 ? (
        <EmptyState
          title="No alerts"
          message="No alerts match the current filters."
        />
      ) : (
        <>
          <AlertsTable
            alerts={alertList}
            selectedIds={selectedIds}
            onSelectChange={setSelectedIds}
            sorting={sorting}
            onSortingChange={(s) => {
              setSorting(s);
              setPage(0);
            }}
            onDismiss={(alert) =>
              setDismissTarget({
                ids: [alert.id],
                port: alert.port ?? undefined,
              })
            }
            onReopen={handleReopen}
            onAccept={(alertIds) => setAcceptTarget({ ids: alertIds })}
            onDelete={handleDelete}
          />
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {page * limit + 1}-
              {Math.min(page * limit + alertList.length, totalAlerts)} of{" "}
              {totalAlerts}
            </p>
            {pageSize !== 0 && (
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
                  disabled={page * limit + alertList.length >= totalAlerts}
                  className="rounded-md border border-border px-3 py-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {dismissTarget && (
        <DismissModal
          alertIds={dismissTarget.ids}
          port={dismissTarget.port}
          open={!!dismissTarget}
          onOpenChange={(open) => {
            if (!open) setDismissTarget(null);
          }}
          onSuccess={() => setSelectedIds([])}
        />
      )}

      {acceptTarget && (
        <AcceptModal
          alertIds={acceptTarget.ids}
          open={!!acceptTarget}
          onOpenChange={(open) => {
            if (!open) setAcceptTarget(null);
          }}
          onSuccess={() => setSelectedIds([])}
          networks={networkList}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          alertCount={deleteTarget.length}
          severityCounts={
            deleteTarget.reduce<Record<string, number>>((acc, id) => {
              const a = alertList.find((x) => x.id === id);
              if (a) acc[a.severity] = (acc[a.severity] ?? 0) + 1;
              return acc;
            }, {})
          }
          open={!!deleteTarget}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
          onConfirm={() => {
            bulkDelete.mutate(
              { alert_ids: deleteTarget },
              {
                onSuccess: () => {
                  setSelectedIds([]);
                  setDeleteTarget(null);
                  toast.success(`Deleted ${deleteTarget.length} alert(s)`);
                },
                onError: (e) => toast.error(e.message),
              },
            );
          }}
        />
      )}
    </div>
  );
}
