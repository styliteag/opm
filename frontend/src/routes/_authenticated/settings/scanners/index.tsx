import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
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
import {
  useNetworks,
  useScanners,
} from "@/features/dashboard/hooks/useDashboardData";
import { useScannerMutations } from "@/features/scanners/hooks/useScanners";
import { CreateScannerModal } from "@/features/scanners/components/CreateScannerModal";
import { ApiKeyDisplay } from "@/components/feedback/ApiKeyDisplay";
import { ScannerActionConfirm } from "@/features/scanners/components/ScannerActionConfirm";
import type { ScannerActionTarget } from "@/features/scanners/lib/scannerConfirmCopy";
import {
  formatRelativeTime,
  formatScannerVersion,
  isOnline,
} from "@/lib/utils";
import type { Scanner } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/settings/scanners/")({
  component: ScannersPage,
});

function ScannersPage() {
  const { data, isLoading, error, refetch } = useScanners();
  const { regenerateKey, remove } = useScannerMutations();
  const networks = useNetworks();
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [confirm, setConfirm] = useState<ScannerActionTarget | null>(null);

  const runConfirmed = () => {
    if (!confirm) return;
    const { action, scanner } = confirm;
    if (action === "regenerate") {
      regenerateKey.mutate(scanner.id, {
        onSuccess: (res) => {
          setRevealedKey(res.api_key);
          setConfirm(null);
          toast.success("API key regenerated");
        },
        onError: (e) => toast.error(e.message),
      });
    } else {
      remove.mutate(scanner.id, {
        onSuccess: () => {
          setConfirm(null);
          toast.success("Scanner deleted");
        },
        onError: (e) => toast.error(e.message),
      });
    }
  };

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
          <h2 className="text-xl font-strong text-foreground">Scanners</h2>
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
          <p className="mt-1 text-2xl font-strong text-foreground">
            {scannerList.length}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Online</p>
          <p className="mt-1 text-2xl font-strong text-emerald-400">
            {onlineCount}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Offline</p>
          <p className="mt-1 text-2xl font-strong text-red-400">
            {scannerList.length - onlineCount}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Uptime</p>
          <p className="mt-1 text-2xl font-strong text-foreground">
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
                    <Link
                      to="/settings/scanners/$scannerId"
                      params={{ scannerId: String(scanner.id) }}
                      className="text-sm font-medium text-foreground hover:text-primary transition-colors"
                    >
                      {scanner.name}
                    </Link>
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
                key: "kind",
                header: "Type",
                render: (scanner) => (
                  <StatusBadge
                    label={scanner.kind === "gvm" ? "GVM" : scanner.kind === "unified" ? "Unified" : "Standard"}
                    variant={scanner.kind === "gvm" ? "warning" : scanner.kind === "unified" ? "info" : "neutral"}
                  />
                ),
              },
              {
                key: "version",
                header: "Version",
                render: (scanner) => (
                  <span className="text-sm font-mono text-muted-foreground">
                    {formatScannerVersion(scanner.scanner_version, scanner.kind)}
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
                        setConfirm({ action: "regenerate", scanner })
                      }
                      className="rounded p-1 text-muted-foreground hover:text-primary transition-colors"
                      title="Regenerate API key"
                      aria-label={`Regenerate API key for ${scanner.name}`}
                    >
                      <Key className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setConfirm({ action: "delete", scanner })}
                      className="rounded p-1 text-muted-foreground hover:text-red-400 transition-colors"
                      title="Delete scanner"
                      aria-label={`Delete scanner ${scanner.name}`}
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

      <ScannerActionConfirm
        target={confirm}
        networkCount={
          (networks.data?.networks ?? []).filter(
            (n) => n.scanner_id === confirm?.scanner.id,
          ).length
        }
        pending={regenerateKey.isPending || remove.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={runConfirmed}
      />

      <CreateScannerModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(key) => setRevealedKey(key)}
      />
    </div>
  );
}
