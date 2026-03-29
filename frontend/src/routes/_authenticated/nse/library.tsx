import { useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Search,
  ArrowLeft,
  FileCode,
  Upload,
  Copy,
  Trash2,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { LoadingState } from "@/components/data-display/LoadingState";
import { ErrorState } from "@/components/data-display/ErrorState";
import { EmptyState } from "@/components/data-display/EmptyState";
import { useNseScripts, useNseMutations } from "@/features/nse/hooks/useNse";
import { useDebounce } from "@/hooks/useDebounce";
import { postApi } from "@/lib/api";
import { useAuthStore } from "@/stores/auth.store";
import { ScriptUploadModal } from "@/features/nse/components/ScriptUploadModal";

export const Route = createFileRoute("/_authenticated/nse/library")({
  component: NseLibraryPage,
});

function NseLibraryPage() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const { data, isLoading, error, refetch } = useNseScripts(debouncedSearch);
  const { cloneScript, deleteScript, restoreScript } = useNseMutations();
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const userRole = useAuthStore((s) => s.user?.role);
  const isAdmin = userRole === "admin";

  const scripts = useMemo(() => data?.scripts ?? [], [data?.scripts]);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    scripts.forEach((s) => s.categories?.forEach((c) => cats.add(c)));
    return Array.from(cats).sort();
  }, [scripts]);

  const filtered = useMemo(() => {
    return scripts.filter((s) => {
      const matchesCategory =
        !selectedCategory || s.categories?.includes(selectedCategory);
      return matchesCategory;
    });
  }, [scripts, selectedCategory]);

  const handleClone = (e: React.MouseEvent, scriptName: string) => {
    e.preventDefault();
    e.stopPropagation();
    cloneScript.mutate(scriptName, {
      onSuccess: () => {
        toast.success(`Cloned "${scriptName}"`);
        refetch();
      },
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : "Clone failed");
      },
    });
  };

  const handleDelete = (e: React.MouseEvent, scriptName: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (
      !confirm(
        `Delete custom script "${scriptName}"? It will be automatically removed from any profiles that use it.`,
      )
    )
      return;
    deleteScript.mutate(scriptName, {
      onSuccess: () => {
        toast.success(`Deleted "${scriptName}"`);
        refetch();
      },
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : "Delete failed");
      },
    });
  };

  const handleRestore = (e: React.MouseEvent, scriptName: string) => {
    e.preventDefault();
    e.stopPropagation();
    restoreScript.mutate(scriptName, {
      onSuccess: () => {
        toast.success(`Restored "${scriptName}" to original`);
        refetch();
      },
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : "Restore failed");
      },
    });
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await postApi<{
        added: number;
        updated: number;
        unchanged: number;
        errors: string[];
      }>("/api/nse/sync", {});
      toast.success(
        `Sync complete: ${result.added} added, ${result.updated} updated, ${result.unchanged} unchanged`,
      );
      if (result.errors.length > 0) {
        toast.warning(`${result.errors.length} errors during sync`);
      }
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const isCustomScript = (type: string) => type === "custom";

  if (isLoading) return <LoadingState rows={8} />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            to="/nse/profiles"
            className="rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">
              NSE Script Library
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Curated: {data?.total ?? 0} scripts · Showing: {filtered.length}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={syncing}
            >
              <RefreshCw
                className={`h-4 w-4 mr-1.5 ${syncing ? "animate-spin" : ""}`}
              />
              {syncing ? "Syncing..." : "Sync with Nmap"}
            </Button>
          )}
          <Button size="sm" onClick={() => setUploadOpen(true)}>
            <Upload className="h-4 w-4 mr-1.5" />
            Upload Script
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search scripts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-border bg-background py-1.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <Select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
        >
          <option value="">All Categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No scripts found"
          message="Try a different search or category."
          icon={FileCode}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((script) => (
            <Link
              key={script.name}
              to="/nse/editor/$scriptName"
              params={{ scriptName: script.name }}
              className="block rounded-lg border border-border bg-card p-4 hover:border-primary/30 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <p className="font-mono text-sm font-medium text-primary">
                    {script.name}
                  </p>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      isCustomScript(script.type)
                        ? "bg-blue-500/10 text-blue-500"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {script.type}
                  </span>
                  {script.cloned_from && (
                    <span className="text-[10px] text-muted-foreground">
                      cloned from {script.cloned_from}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 ml-4">
                  <div className="flex flex-wrap gap-1 mr-2">
                    {script.categories?.slice(0, 3).map((cat) => (
                      <span
                        key={cat}
                        className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                      >
                        {cat}
                      </span>
                    ))}
                  </div>
                  {!isCustomScript(script.type) && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={(e) => handleClone(e, script.name)}
                      title="Clone script"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {isCustomScript(script.type) && script.cloned_from && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={(e) => handleRestore(e, script.name)}
                      title="Restore to original"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {isCustomScript(script.type) && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={(e) => handleDelete(e, script.name)}
                      title="Delete custom script"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
              {script.description && (
                <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                  {script.description}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}

      <ScriptUploadModal
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onSuccess={refetch}
      />
    </div>
  );
}
