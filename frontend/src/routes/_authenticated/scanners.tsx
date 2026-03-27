import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Server, Plus, Key, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { LoadingState } from "@/components/data-display/LoadingState";
import { ErrorState } from "@/components/data-display/ErrorState";
import { EmptyState } from "@/components/data-display/EmptyState";
import { StatusBadge } from "@/components/data-display/StatusBadge";
import { useScanners } from "@/features/dashboard/hooks/useDashboardData";
import { useScannerMutations } from "@/features/scanners/hooks/useScanners";
import { CreateScannerModal } from "@/features/scanners/components/CreateScannerModal";
import { ApiKeyDisplay } from "@/components/feedback/ApiKeyDisplay";
import { formatRelativeTime, parseUTC } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/scanners")({
  component: ScannersPage,
});

function ScannersPage() {
  const { data, isLoading, error, refetch } = useScanners();
  const { regenerateKey, remove } = useScannerMutations();
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const scannerList = data?.scanners ?? [];
  // eslint-disable-next-line react-hooks/purity -- Date.now() is impure but needed for online status display
  const now = Date.now();
  const onlineCount = scannerList.filter(
    (s) =>
      s.last_seen_at &&
      now - parseUTC(s.last_seen_at).getTime() < 5 * 60 * 1000,
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
        <div className="rounded-lg border border-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-card">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                  Version
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                  Last Seen
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {scannerList.map((scanner) => {
                const isOnline =
                  scanner.last_seen_at &&
                  now - parseUTC(scanner.last_seen_at).getTime() <
                    5 * 60 * 1000;
                return (
                  <tr
                    key={scanner.id}
                    className="border-b border-border hover:bg-accent/50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-foreground">
                        {scanner.name}
                      </p>
                      {scanner.description && (
                        <p className="text-xs text-muted-foreground">
                          {scanner.description}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        label={isOnline ? "Online" : "Offline"}
                        variant={isOnline ? "success" : "danger"}
                        dot
                      />
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {scanner.scanner_version ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {scanner.last_seen_at
                        ? formatRelativeTime(scanner.last_seen_at)
                        : "Never"}
                    </td>
                    <td className="px-4 py-3">
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
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <CreateScannerModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(key) => setRevealedKey(key)}
      />
    </div>
  );
}
