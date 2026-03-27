import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Trash2,
  Globe,
  Network,
  ChevronDown,
  Power,
  PowerOff,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/data-display/LoadingState";
import { ErrorState } from "@/components/data-display/ErrorState";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteApi, postApi } from "@/lib/api";
import { usePortRules } from "@/features/port-rules/hooks/usePortRules";
import { GlobalRuleAddForm } from "@/features/port-rules/components/GlobalRuleAddForm";
import { RuleSection } from "@/features/port-rules/components/RuleSection";
import type { PortRule } from "@/features/port-rules/types";

export const Route = createFileRoute("/_authenticated/port-rules")({
  component: PortRulesPage,
});

function PortRulesPage() {
  const [showAdd, setShowAdd] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const { data, isLoading, error, refetch } = usePortRules();
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
  const globalRules = allRules.filter((r) => r.network_id === null);
  const networkRules = allRules.filter((r) => r.network_id !== null);

  const networkGroups = networkRules.reduce<Record<string, PortRule[]>>(
    (acc, rule) => {
      const key = rule.network_name ?? `Network #${rule.network_id}`;
      return { ...acc, [key]: [...(acc[key] ?? []), rule] };
    },
    {},
  );

  const handleDeleteConfirm = (rule: PortRule, scope: "global" | "network") => {
    if (
      window.confirm(`Remove this ${rule.source} rule? This cannot be undone.`)
    ) {
      deleteRule.mutate({ scope, id: rule.id });
    }
  };

  const toggleIds = (ids: number[], selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (selected) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const selectedArray = Array.from(selectedIds);
  const isBulkPending =
    bulkDelete.isPending || bulkEnable.isPending || bulkDisable.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Alert Rules
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage global and per-network alert acceptance and criticality rules
            for port, SSH, and NSE alerts.
          </p>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-md border border-primary/30 bg-primary/5 px-4 py-2">
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
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        </div>
      )}

      {/* Global Rules */}
      <div>
        <RuleSection
          title="Global Rules"
          icon={<Globe className="h-4 w-4 text-muted-foreground" />}
          rules={globalRules}
          scope="global"
          selectedIds={selectedIds}
          onToggleSelect={(id, sel) => toggleIds([id], sel)}
          onToggleAll={toggleIds}
          onDelete={handleDeleteConfirm}
          isDeleting={deleteRule.isPending}
          headerRight={
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAdd(!showAdd)}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Rule
            </Button>
          }
        />
        {showAdd && (
          <GlobalRuleAddForm
            onAdded={() => {
              setShowAdd(false);
              invalidate();
            }}
          />
        )}
      </div>

      {/* Per-Network Rules */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Network className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-display text-lg font-semibold text-foreground">
            Per-Network Rules
          </h2>
        </div>

        {Object.keys(networkGroups).length === 0 ? (
          <div className="rounded-lg border border-border p-5 text-sm text-muted-foreground">
            No per-network rules configured.
          </div>
        ) : (
          Object.entries(networkGroups).map(([networkName, rules]) => (
            <RuleSection
              key={networkName}
              title={networkName}
              icon={null}
              rules={rules}
              scope="network"
              selectedIds={selectedIds}
              onToggleSelect={(id, sel) => toggleIds([id], sel)}
              onToggleAll={toggleIds}
              onDelete={handleDeleteConfirm}
              isDeleting={deleteRule.isPending}
            />
          ))
        )}
      </div>
    </div>
  );
}
