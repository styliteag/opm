import { useCallback, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Download,
  Globe,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState } from "@/components/data-display/ErrorState";
import { LoadingState } from "@/components/data-display/LoadingState";
import {
  useDeleteHostnameCacheEntry,
  useHostnameLookupExport,
  useHostnameLookupStatus,
  useImportHostnameCache,
  useRefreshCacheEntry,
  useUpdateHostnameCacheEntry,
  type CacheExportDocument,
  type HostnameLookupEntry,
  type HostnameLookupStatus,
} from "@/features/hostname-lookup/hooks/useHostnameLookup";

export const Route = createFileRoute("/_authenticated/admin/hostname-lookup")({
  component: HostnameLookupPage,
});

const STATUS_LABELS: Record<HostnameLookupStatus, string> = {
  success: "Success",
  no_results: "No results",
  failed: "Failed",
};

const STATUS_COLORS: Record<HostnameLookupStatus, string> = {
  success: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  no_results: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  failed: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

// Source badge accents in the entries table — "manual" gets a distinct
// amber tone so hand-edited rows are visually obvious in long tables.
const SOURCE_BADGE_CLASSES: Record<string, string> = {
  manual: "text-amber-300 font-emphasis",
  hackertarget: "text-muted-foreground",
  rapiddns: "text-muted-foreground",
};

type SortKey = "ip" | "status" | "vhosts" | "source" | "queried" | "expires";
type SortDir = "asc" | "desc";

function HostnameLookupPage() {
  const {
    data: status,
    isLoading: statusLoading,
    error: statusError,
    refetch: refetchStatus,
  } = useHostnameLookupStatus();
  const {
    data: cache,
    isLoading: cacheLoading,
    refetch: refetchCache,
  } = useHostnameLookupExport();
  const importCache = useImportHostnameCache();
  const updateEntry = useUpdateHostnameCacheEntry();
  const deleteEntry = useDeleteHostnameCacheEntry();
  const refreshEntry = useRefreshCacheEntry();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | HostnameLookupStatus>(
    "all",
  );
  const [importStrategy, setImportStrategy] = useState<"skip" | "overwrite">(
    "skip",
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<HostnameLookupEntry | null>(null);
  const [editText, setEditText] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("ip");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const toggleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("asc");
      }
    },
    [sortKey],
  );

  const filteredEntries = useMemo(() => {
    const entries = cache?.entries ?? [];
    const term = search.trim().toLowerCase();

    const filtered = entries.filter((entry) => {
      if (statusFilter !== "all" && entry.status !== statusFilter) {
        return false;
      }
      if (!term) return true;
      if (entry.ip.toLowerCase().includes(term)) return true;
      return entry.hostnames.some((h) => h.toLowerCase().includes(term));
    });

    const sorted = [...filtered].sort((a, b) => {
      const mul = sortDir === "asc" ? 1 : -1;
      switch (sortKey) {
        case "ip":
          return mul * a.ip.localeCompare(b.ip);
        case "status":
          return mul * a.status.localeCompare(b.status);
        case "vhosts":
          return mul * (a.hostnames.length - b.hostnames.length);
        case "source":
          return mul * a.source.localeCompare(b.source);
        case "queried":
          return mul * ((a.queried_at ?? "").localeCompare(b.queried_at ?? ""));
        case "expires":
          return mul * ((a.expires_at ?? "").localeCompare(b.expires_at ?? ""));
        default:
          return 0;
      }
    });

    return sorted;
  }, [cache?.entries, search, statusFilter, sortKey, sortDir]);

  function handleExport() {
    if (!cache) return;
    const blob = new Blob([JSON.stringify(cache, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `opm-hostname-cache-${cache.exported_at.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${cache.entry_count} cache entries`);
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  async function handleImportFileChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    event.target.value = ""; // reset so the same file can be re-imported
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as CacheExportDocument;
      if (parsed.format_version !== 1) {
        toast.error(
          `Unsupported format_version=${parsed.format_version}; expected 1`,
        );
        return;
      }
      const summary = await importCache.mutateAsync({
        document: parsed,
        strategy: importStrategy,
      });
      toast.success(
        `Import: ${summary.inserted} inserted, ${summary.overwritten} overwritten, ${summary.skipped} skipped`,
      );
      await refetchCache();
      await refetchStatus();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Import failed",
      );
    }
  }

  async function refreshEntryByIp(ip: string) {
    try {
      await refreshEntry.mutateAsync(ip);
      toast.success(
        `Hostname lookup queued for ${ip} — results appear on next scanner poll (~10 s)`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Refresh failed");
    }
  }

  function openEditDialog(entry: HostnameLookupEntry) {
    setEditing(entry);
    setEditText(entry.hostnames.join("\n"));
  }

  function closeEditDialog() {
    setEditing(null);
    setEditText("");
  }

  async function saveEdit() {
    if (!editing) return;
    const hostnames = editText
      .split(/\r?\n/)
      .map((h) => h.trim())
      .filter((h) => h.length > 0);
    try {
      await updateEntry.mutateAsync({ ip: editing.ip, hostnames });
      toast.success(
        hostnames.length === 0
          ? `Cleared cache row for ${editing.ip}`
          : `Saved ${hostnames.length} hostname${hostnames.length === 1 ? "" : "s"} for ${editing.ip}`,
      );
      closeEditDialog();
      await refetchCache();
      await refetchStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function deleteEntryByIp(ip: string) {
    if (
      !window.confirm(
        `Delete hostname cache row for ${ip}? The next filler run will re-query this IP.`,
      )
    ) {
      return;
    }
    try {
      await deleteEntry.mutateAsync(ip);
      toast.success(`Deleted cache row for ${ip}`);
      await refetchCache();
      await refetchStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Globe className="h-6 w-6 text-primary" aria-hidden />
          <div>
            <h1 className="text-2xl font-strong text-foreground">
              Hostname Lookup Cache
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Cached reverse-IP vhost lists for nuclei SNI fan-out. Populated
              by the scanner via HackerTarget / RapidDNS. Use per-row
              Refresh to enqueue a manual re-lookup.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetchStatus();
              refetchCache();
            }}
            disabled={statusLoading || cacheLoading}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {statusLoading ? (
        <LoadingState rows={4} />
      ) : statusError ? (
        <ErrorState
          message={statusError.message}
          onRetry={() => refetchStatus()}
        />
      ) : status ? (
        <StatusOverview status={status} />
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Cache entries</CardTitle>
            <CardDescription>
              {cache
                ? `${filteredEntries.length} of ${cache.entry_count} entries shown`
                : "Loading..."}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={importStrategy}
              onChange={(e) =>
                setImportStrategy(e.target.value as "skip" | "overwrite")
              }
              className="w-auto"
              aria-label="Import strategy"
            >
              <option value="skip">Import: skip existing</option>
              <option value="overwrite">Import: overwrite</option>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={handleImportClick}
              disabled={importCache.isPending}
            >
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              Import
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={!cache || cache.entry_count === 0}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleImportFileChange}
              className="hidden"
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter by IP or hostname"
                className="pl-8"
              />
            </div>
            <Select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(
                  e.target.value as "all" | HostnameLookupStatus,
                )
              }
              className="w-auto"
              aria-label="Status filter"
            >
              <option value="all">All statuses</option>
              <option value="success">Success only</option>
              <option value="no_results">No results only</option>
              <option value="failed">Failed only</option>
            </Select>
          </div>

          {cacheLoading ? (
            <LoadingState rows={8} />
          ) : filteredEntries.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No entries match the current filter.
            </p>
          ) : (
            <EntriesTable
              entries={filteredEntries}
              onEdit={openEditDialog}
              onDelete={deleteEntryByIp}
              onRefresh={refreshEntryByIp}
              sortKey={sortKey}
              sortDir={sortDir}
              onToggleSort={toggleSort}
              searchTerm={search.trim().toLowerCase()}
            />
          )}
        </CardContent>
      </Card>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => !open && closeEditDialog()}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit hostname cache for {editing?.ip}</DialogTitle>
            <DialogDescription>
              One hostname per line. Whitespace and duplicates are stripped.
              Saving marks the row as <code>source=manual</code> with an
              8-week TTL so the filler won&apos;t overwrite it. Leave empty
              to mark this IP as &quot;nothing to scan&quot; (stored as
              no_results).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="hostname-edit">Hostnames</Label>
            <Textarea
              id="hostname-edit"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={10}
              placeholder="example.com&#10;www.example.com&#10;..."
              className="font-mono text-xs"
              disabled={updateEntry.isPending}
            />
            <p className="text-[11px] text-muted-foreground">
              {editText.split(/\r?\n/).filter((h) => h.trim().length > 0).length}{" "}
              non-empty line(s)
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={closeEditDialog}
              disabled={updateEntry.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={saveEdit}
              disabled={updateEntry.isPending}
            >
              {updateEntry.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface StatusOverviewProps {
  status: ReturnType<typeof useHostnameLookupStatus>["data"];
}

function StatusOverview({ status }: StatusOverviewProps) {
  if (!status) return null;
  const hackertargetBudget = status.budgets.find(
    (b) => b.source === "hackertarget",
  );

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="Cache coverage"
        primary={`${status.enriched_hosts} / ${status.total_hosts}`}
        secondary={`${status.coverage_percent.toFixed(1)}% of hosts enriched`}
      />
      <StatCard
        title="Total vhosts"
        primary={status.total_vhosts.toLocaleString()}
        secondary={`across ${status.entries_by_status.success} success rows`}
      />
      <StatCard
        title="HackerTarget budget"
        primary={
          hackertargetBudget
            ? `${hackertargetBudget.used} / ${hackertargetBudget.limit}`
            : "—"
        }
        secondary={
          hackertargetBudget
            ? `${hackertargetBudget.remaining} calls remaining today`
            : "no data"
        }
      />
      <StatCard
        title="Pending lookups"
        primary={status.pending_queue_count.toLocaleString()}
        secondary={
          status.pending_queue_count === 0
            ? "queue empty — scanner is idle"
            : `awaiting scanner poll (~10 s)`
        }
      />
    </div>
  );
}

function StatCard({
  title,
  primary,
  secondary,
}: {
  title: string;
  primary: string;
  secondary: string;
}) {
  return (
    <div className="rounded-md border border-border/40 bg-card/40 p-4">
      <p className="text-xs font-emphasis uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <p className="mt-1 text-xl font-strong text-foreground">{primary}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{secondary}</p>
    </div>
  );
}

interface EntriesTableProps {
  entries: HostnameLookupEntry[];
  onEdit: (entry: HostnameLookupEntry) => void;
  onDelete: (ip: string) => void;
  onRefresh: (ip: string) => void;
  sortKey: SortKey;
  sortDir: SortDir;
  onToggleSort: (key: SortKey) => void;
  searchTerm: string;
}

function SortHeader({
  label,
  field,
  sortKey,
  sortDir,
  onToggleSort,
  align,
}: {
  label: string;
  field: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onToggleSort: (key: SortKey) => void;
  align?: "right";
}) {
  const active = sortKey === field;
  const Icon = active
    ? sortDir === "asc"
      ? ArrowUp
      : ArrowDown
    : ArrowUpDown;
  return (
    <th className={`px-3 py-2 ${align === "right" ? "text-right" : ""}`}>
      <button
        type="button"
        onClick={() => onToggleSort(field)}
        className={`inline-flex items-center gap-1 text-xs cursor-pointer ${
          active ? "text-foreground" : ""
        }`}
      >
        {label} <Icon className="h-3 w-3" aria-hidden />
      </button>
    </th>
  );
}

function EntriesTable({
  entries,
  onEdit,
  onDelete,
  onRefresh,
  sortKey,
  sortDir,
  onToggleSort,
  searchTerm,
}: EntriesTableProps) {
  return (
    <div className="overflow-x-auto rounded-md border border-border/40">
      <table className="w-full text-sm">
        <thead className="bg-card/60 text-left text-xs font-emphasis uppercase tracking-wider text-muted-foreground">
          <tr>
            <SortHeader label="IP" field="ip" sortKey={sortKey} sortDir={sortDir} onToggleSort={onToggleSort} />
            <SortHeader label="Status" field="status" sortKey={sortKey} sortDir={sortDir} onToggleSort={onToggleSort} />
            <SortHeader label="Vhosts" field="vhosts" sortKey={sortKey} sortDir={sortDir} onToggleSort={onToggleSort} align="right" />
            <SortHeader label="Source" field="source" sortKey={sortKey} sortDir={sortDir} onToggleSort={onToggleSort} />
            <SortHeader label="Queried" field="queried" sortKey={sortKey} sortDir={sortDir} onToggleSort={onToggleSort} />
            <SortHeader label="Expires" field="expires" sortKey={sortKey} sortDir={sortDir} onToggleSort={onToggleSort} />
            <th className="px-3 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <EntryRow
              key={entry.ip}
              entry={entry}
              onEdit={onEdit}
              onDelete={onDelete}
              onRefresh={onRefresh}
              searchTerm={searchTerm}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface EntryRowProps {
  entry: HostnameLookupEntry;
  onEdit: (entry: HostnameLookupEntry) => void;
  onDelete: (ip: string) => void;
  onRefresh: (ip: string) => void;
  searchTerm: string;
}

function EntryRow({ entry, onEdit, onDelete, onRefresh, searchTerm }: EntryRowProps) {
  const [expanded, setExpanded] = useState(false);
  const canExpand = entry.hostnames.length > 0;
  const sourceClass =
    SOURCE_BADGE_CLASSES[entry.source] ?? "text-muted-foreground";

  // When searching by hostname (not IP), show the first matching domain inline
  const matchedHostname = useMemo(() => {
    if (!searchTerm) return null;
    if (entry.ip.toLowerCase().includes(searchTerm)) return null;
    return entry.hostnames.find((h) => h.toLowerCase().includes(searchTerm)) ?? null;
  }, [searchTerm, entry.ip, entry.hostnames]);

  return (
    <>
      <tr
        className={`border-t border-border/40 hover:bg-card/40 ${
          canExpand ? "cursor-pointer" : ""
        }`}
        onClick={() => canExpand && setExpanded((v) => !v)}
      >
        <td className="px-3 py-2">
          <span className="font-mono text-xs">{entry.ip}</span>
          {matchedHostname && (
            <span className="ml-2 text-[11px] text-primary/80">
              {matchedHostname}
            </span>
          )}
        </td>
        <td className="px-3 py-2">
          <span
            className={`inline-block rounded-md border px-1.5 py-0.5 text-[10px] font-emphasis uppercase tracking-wider ${STATUS_COLORS[entry.status]}`}
          >
            {STATUS_LABELS[entry.status]}
          </span>
        </td>
        <td className="px-3 py-2 text-right font-mono text-xs">
          {entry.hostnames.length}
        </td>
        <td className={`px-3 py-2 text-xs ${sourceClass}`}>{entry.source}</td>
        <td className="px-3 py-2 text-xs text-muted-foreground">
          {entry.queried_at
            ? new Date(entry.queried_at).toLocaleString()
            : "—"}
        </td>
        <td className="px-3 py-2 text-xs text-muted-foreground">
          {entry.expires_at
            ? new Date(entry.expires_at).toLocaleDateString()
            : "—"}
        </td>
        <td className="px-3 py-2 text-right">
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              className="rounded p-1 text-muted-foreground hover:bg-card/60 hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(entry);
              }}
              aria-label={`Edit ${entry.ip}`}
              title="Edit hostnames"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="rounded p-1 text-muted-foreground hover:bg-card/60 hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onRefresh(entry.ip);
              }}
              aria-label={`Refresh ${entry.ip}`}
              title="Enqueue reverse-IP lookup"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="rounded p-1 text-muted-foreground hover:bg-rose-500/15 hover:text-rose-300"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(entry.ip);
              }}
              aria-label={`Delete ${entry.ip}`}
              title="Delete cache row"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </td>
      </tr>
      {expanded && canExpand && (
        <tr className="border-t border-border/40 bg-card/20">
          <td colSpan={7} className="px-3 py-3">
            <p className="mb-1.5 text-xs font-emphasis text-muted-foreground">
              {entry.hostnames.length} hostname
              {entry.hostnames.length === 1 ? "" : "s"}:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {entry.hostnames.map((h) => (
                <span
                  key={h}
                  className="rounded-sm bg-card/60 px-2 py-0.5 font-mono text-[11px] text-foreground"
                >
                  {h}
                </span>
              ))}
            </div>
            {entry.error_message && (
              <p className="mt-2 text-[11px] text-rose-400">
                Error: {entry.error_message}
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
