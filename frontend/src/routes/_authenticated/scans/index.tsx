import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";

import { LoadingState } from "@/components/data-display/LoadingState";
import { ErrorState } from "@/components/data-display/ErrorState";
import { EmptyState } from "@/components/data-display/EmptyState";
import { StatusBadge } from "@/components/data-display/StatusBadge";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-display/DataTable";
import { useScans } from "@/features/scans/hooks/useScans";
import { formatRelativeTime, scanStatusVariant } from "@/lib/utils";
import type { ScanSummary } from "@/lib/types";

interface ScansSearchParams {
  network_id?: number;
}

export const Route = createFileRoute("/_authenticated/scans/")({
  component: ScansPage,
  validateSearch: (search: Record<string, unknown>): ScansSearchParams => ({
    network_id: search.network_id ? Number(search.network_id) : undefined,
  }),
});

const SCAN_COLUMNS: DataTableColumn<ScanSummary>[] = [
  {
    key: "id",
    header: "ID",
    render: (scan) => (
      <Link
        to="/scans/$scanId"
        params={{ scanId: String(scan.id) }}
        className="text-sm text-primary hover:text-primary/80 transition-colors"
      >
        #{scan.id}
      </Link>
    ),
  },
  {
    key: "status",
    header: "Status",
    render: (scan) => (
      <StatusBadge
        label={scan.status}
        variant={scanStatusVariant(scan.status)}
        dot
      />
    ),
  },
  {
    key: "ports",
    header: "Ports",
    render: (scan) => (
      <span className="text-sm text-foreground">{scan.port_count}</span>
    ),
  },
  {
    key: "trigger",
    header: "Trigger",
    render: (scan) => (
      <span className="text-sm text-muted-foreground capitalize">
        {scan.trigger_type}
      </span>
    ),
  },
  {
    key: "started",
    header: "Started",
    render: (scan) => (
      <span className="text-sm text-muted-foreground">
        {scan.started_at ? formatRelativeTime(scan.started_at) : "-"}
      </span>
    ),
  },
  {
    key: "completed",
    header: "Completed",
    render: (scan) => (
      <span className="text-sm text-muted-foreground">
        {scan.completed_at ? formatRelativeTime(scan.completed_at) : "-"}
      </span>
    ),
  },
];

function ScansPage() {
  const searchParams = Route.useSearch();
  const [page, setPage] = useState(0);
  const limit = 50;
  const { data, isLoading, error, refetch } = useScans(
    page * limit,
    limit,
    searchParams.network_id,
  );

  const scanList = data?.scans ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-strong text-foreground">Scan History</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Historical record of all scan operations.
        </p>
      </div>

      {isLoading ? (
        <LoadingState rows={8} />
      ) : error ? (
        <ErrorState message={error.message} onRetry={refetch} />
      ) : scanList.length === 0 ? (
        <EmptyState title="No scans" message="No scans have been run yet." />
      ) : (
        <>
          <DataTable
            columns={SCAN_COLUMNS}
            rows={scanList}
            rowKey={(scan) => scan.id}
          />

          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded-md border border-border px-3 py-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={scanList.length < limit}
              className="rounded-md border border-border px-3 py-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
