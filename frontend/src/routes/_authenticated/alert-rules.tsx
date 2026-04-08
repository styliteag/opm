import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Trash2,
  ChevronDown,
  Power,
  PowerOff,
  Search,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/data-display/LoadingState";
import { ErrorState } from "@/components/data-display/ErrorState";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteApi, postApi } from "@/lib/api";
import { useAlertRules } from "@/features/alert-rules/hooks/useAlertRules";
import { GlobalRuleAddForm } from "@/features/alert-rules/components/GlobalRuleAddForm";
import { AlertRulesTable } from "@/features/alert-rules/components/AlertRulesTable";
import type { PortRule } from "@/features/alert-rules/types";

export const Route = createFileRoute("/_authenticated/alert-rules")({
  component: AlertRulesPage,
});

function AlertRulesPage() {
  const [addOpen, setAddOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [portFilter, setPortFilter] = useState("");
  const { data, isLoading, error, refetch } = useAlertRules();
  const qc = useQueryClient();

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["policy", "rules"] });

  const deleteRule = useMutation({
    mutationFn: ({ scope, id }: { scope: "global" | "network"; id: number }) =>
      deleteApi(`/api/port-rules/${scope}/${id}`),
    onSuccess: () => {
      invalidate();
      toast.success("Rule removed");
    },
    onError: (e) => toast.error(e.message),
  });

  const bulkDelete = useMutation({
    mutationFn: (rule_ids: number[]) =>
      postApi("/api/port-rules/bulk-delete", { rule_ids }),
    onSuccess: (_, ids) => {
      invalidate();
      setSelectedIds(new Set());
      toast.success(`${ids.length} rule(s) deleted`);
    },
    onError: (e) => toast.error(e.message),
  });

  const bulkEnable = useMutation({
    mutationFn: (rule_ids: number[]) =>
      postApi("/api/port-rules/bulk-enable", { rule_ids }),
    onSuccess: () => {
      invalidate();
      setSelectedIds(new Set());
      toast.success("Rules enabled");
    },
    onError: (e) => toast.error(e.message),
  });

  const bulkDisable = useMutation({
    mutationFn: (rule_ids: number[]) =>
      postApi("/api/port-rules/bulk-disable", { rule_ids }),
    onSuccess: () => {
      invalidate();
      setSelectedIds(new Set());
      toast.success("Rules disabled");
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <LoadingState rows={8} />;
  if (error)
    return <ErrorState message={error.message} onRetry={() => refetch()} />;

  const allRules = data?.rules ?? [];

  const handleDeleteConfirm = (rule: PortRule) => {
    const scope = rule.network_id === null ? "global" : "network";
    if (
      window.confirm(`Remove this ${rule.source} rule? This cannot be undone.`)
    ) {
      deleteRule.mutate({ scope, id: rule.id });
    }
  };

  const selectedArray = Array.from(selectedIds);
  const isBulkPending =
    bulkDelete.isPending || bulkEnable.isPending || bulkDisable.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-strong text-foreground">Alert Rules</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage global and per-network alert acceptance and criticality rules
            for port, SSH, and NSE alerts.
          </p>
          {allRules.length > 0 && (
            <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
              <span>{allRules.length} rules</span>
              <span>·</span>
              <span>{allRules.filter((r) => r.enabled).length} active</span>
              <span>·</span>
              <span>
                {allRules.reduce((sum, r) => sum + r.hit_count, 0)} total hits
              </span>
            </div>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add Rule
        </Button>
      </div>

      {/* Search + Bulk Actions */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search rules..."
            className="pl-8 h-8 text-sm"
          />
        </div>
        <Input
          value={portFilter}
          onChange={(e) => setPortFilter(e.target.value)}
          placeholder="Port..."
          className="h-8 w-24 text-sm font-mono"
        />

        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-primary">
              {selectedIds.size} selected
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer">
                Bulk Actions
                <ChevronDown className="h-3 w-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  disabled={isBulkPending}
                  onClick={() => bulkEnable.mutate(selectedArray)}
                >
                  <Power className="h-3.5 w-3.5 mr-1.5" />
                  Enable
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={isBulkPending}
                  onClick={() => bulkDisable.mutate(selectedArray)}
                >
                  <PowerOff className="h-3.5 w-3.5 mr-1.5" />
                  Disable
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  disabled={isBulkPending}
                  onClick={() => {
                    if (
                      confirm(`Delete ${selectedIds.size} rule(s) permanently?`)
                    ) {
                      bulkDelete.mutate(selectedArray);
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      <AlertRulesTable
        rules={allRules}
        search={search}
        portFilter={portFilter}
        selectedIds={selectedIds}
        onSelectedIdsChange={setSelectedIds}
        onDelete={handleDeleteConfirm}
        isDeleting={deleteRule.isPending}
      />

      <GlobalRuleAddForm
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdded={() => {
          setAddOpen(false);
          invalidate();
        }}
      />
    </div>
  );
}
