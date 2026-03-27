import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Server, Plus, Key, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { LoadingState } from "@/components/data-display/LoadingState";
import { ErrorState } from "@/components/data-display/ErrorState";
import { EmptyState } from "@/components/data-display/EmptyState";
import { StatusBadge } from "@/components/data-display/StatusBadge";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-display/DataTable";
import { useScanners } from "@/features/dashboard/hooks/useDashboardData";
import { useScannerMutations } from "@/features/scanners/hooks/useScanners";
import { CreateScannerModal } from "@/features/scanners/components/CreateScannerModal";
import { ApiKeyDisplay } from "@/components/feedback/ApiKeyDisplay";
import { formatRelativeTime, isOnline } from "@/lib/utils";
import type { Scanner } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/scanners")({
  component: ScannersPage,
});

function ScannersPage() {
  const { data, isLoading, error, refetch } = useScanners();
  const { regenerateKey, remove } = useScannerMutations();
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const scannerList = data?.scanners ?? [];
  const onlineCount = scannerList.filter((s) =>
    isOnline(s.last_seen_at),
  ).length;

  if (isLoading) return <LoadingState rows={6} />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Scanner Fleet Management
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monitor and manage distributed scanning infrastructure.
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Register Scanner
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total Scanners</p>
          <p className="mt-1 font-display text-2xl font-bold text-foreground">
            {scannerList.length}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Online</p>
          <p className="mt-1 font-display text-2xl font-bold text-emerald-400">
            {onlineCount}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Offline</p>
          <p className="mt-1 font-display text-2xl font-bold text-red-400">
            {scannerList.length - onlineCount}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Uptime</p>
          <p className="mt-1 font-display text-2xl font-bold text-foreground">
            {scannerList.length > 0
              ? `${Math.round((onlineCount / scannerList.length) * 100)}%`
              : "-"}
          </p>
        </div>
      </div>

      {/* Revealed API Key */}
      {revealedKey && (
        <ApiKeyDisplay
          apiKey={revealedKey}
          onDismiss={() => setRevealedKey(null)}
        />
      )}

      {/* Scanner List */}
      {scannerList.length === 0 ? (
        <EmptyState
          title="No scanners registered"
          message="Register a scanner to start scanning networks."
          icon={Server}
        />
      ) : (
        <DataTable<Scanner>
          columns={
            [
              {
                key: "name",
                header: "Name",
                render: (scanner) => (
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {scanner.name}
                    </p>
                    {scanner.description && (
                      <p className="text-xs text-muted-foreground">
                        {scanner.description}
                      </p>
                    )}
                  </div>
                ),
              },
              {
                key: "status",
                header: "Status",
                render: (scanner) => {
                  const online = isOnline(scanner.last_seen_at);
                  return (
                    <StatusBadge
                      label={online ? "Online" : "Offline"}
                      variant={online ? "success" : "danger"}
                      dot
                    />
                  );
                },
              },
              {
                key: "version",
                header: "Version",
                render: (scanner) => (
                  <span className="text-sm text-muted-foreground">
                    {scanner.scanner_version ?? "-"}
                  </span>
                ),
              },
              {
                key: "last_seen",
                header: "Last Seen",
                render: (scanner) => (
                  <span className="text-sm text-muted-foreground">
                    {scanner.last_seen_at
                      ? formatRelativeTime(scanner.last_seen_at)
                      : "Never"}
                  </span>
                ),
              },
              {
                key: "actions",
                header: "Actions",
                render: (scanner) => (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        regenerateKey.mutate(scanner.id, {
                          onSuccess: (res) => {
                            setRevealedKey(res.api_key);
                            toast.success("API key regenerated");
                          },
                          onError: (e) => toast.error(e.message),
                        })
                      }
                      className="rounded p-1 text-muted-foreground hover:text-primary transition-colors"
                      title="Regenerate API key"
                    >
                      <Key className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() =>
                        remove.mutate(scanner.id, {
                          onSuccess: () => toast.success("Scanner deleted"),
                          onError: (e) => toast.error(e.message),
                        })
                      }
                      className="rounded p-1 text-muted-foreground hover:text-red-400 transition-colors"
                      title="Delete scanner"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ),
              },
            ] satisfies DataTableColumn<Scanner>[]
          }
          rows={scannerList}
          rowKey={(s) => s.id}
        />
      )}

      <CreateScannerModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(key) => setRevealedKey(key)}
      />
    </div>
  );
}
