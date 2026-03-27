import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";

import { LoadingState } from "@/components/data-display/LoadingState";
import { ErrorState } from "@/components/data-display/ErrorState";
import { EmptyState } from "@/components/data-display/EmptyState";
import { StatusBadge } from "@/components/data-display/StatusBadge";
import { useScans } from "@/features/scans/hooks/useScans";
import { formatRelativeTime, scanStatusVariant } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/scans/")({
  component: ScansPage,
});

function ScansPage() {
  const [page, setPage] = useState(0);
  const limit = 50;
  const { data, isLoading, error, refetch } = useScans(page * limit, limit);

  const scanList = data?.scans ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">
          Scan History
        </h1>
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
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-card">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                    ID
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                    Ports
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                    Trigger
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                    Started
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                    Completed
                  </th>
                </tr>
              </thead>
              <tbody>
                {scanList.map((scan) => (
                  <tr
                    key={scan.id}
                    className="border-b border-border hover:bg-accent/50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Link
                        to="/scans/$scanId"
                        params={{ scanId: String(scan.id) }}
                        className="text-sm text-primary hover:text-primary/80 transition-colors"
                      >
                        #{scan.id}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        label={scan.status}
                        variant={scanStatusVariant(scan.status)}
                        dot
                      />
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground">
                      {scan.port_count}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground capitalize">
                      {scan.trigger_type}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {scan.started_at
                        ? formatRelativeTime(scan.started_at)
                        : "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {scan.completed_at
                        ? formatRelativeTime(scan.completed_at)
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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
