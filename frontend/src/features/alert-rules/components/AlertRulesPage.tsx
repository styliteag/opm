import { useState } from "react";
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
import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";
import { HubTabs } from "@/components/layout/HubTabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteApi, postApi } from "@/lib/api";
import { useHasRole } from "@/lib/roles";
import { useAlertRules } from "@/features/alert-rules/hooks/useAlertRules";
import { GlobalRuleAddForm } from "@/features/alert-rules/components/GlobalRuleAddForm";
import { AlertRulesTable } from "@/features/alert-rules/components/AlertRulesTable";
import {
  countRulesByType,
  filterRulesByType,
  RULE_TYPE_LABELS,
  ruleSourceLabel,
  type RuleTypeFilter,
} from "@/features/alert-rules/lib/ruleLabels";
import type { PortRule } from "@/features/alert-rules/types";

type PendingDelete =
  | { kind: "none" }
  | { kind: "single"; rule: PortRule }
  | { kind: "bulk"; ids: number[] };

export function AlertRulesPage() {
  const canEdit = useHasRole("operator");
  const [addOpen, setAddOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [portFilter, setPortFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<RuleTypeFilter>("all");
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>({
    kind: "none",
  });
  const { data, isLoading, error, refetch } = useAlertRules();
  const qc = useQueryClient();

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["policy", "rules"] });

  const closeDelete = () => setPendingDelete({ kind: "none" });

  const deleteRule = useMutation({
    mutationFn: ({ scope, id }: { scope: "global" | "network"; id: number }) =>
      deleteApi(`/api/port-rules/${scope}/${id}`),
    onSuccess: () => {
      invalidate();
      closeDelete();
      toast.success("Rule deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const bulkDelete = useMutation({
    mutationFn: (rule_ids: number[]) =>
      postApi("/api/port-rules/bulk-delete", { rule_ids }),
    onSuccess: (_, ids) => {
      invalidate();
      setSelectedIds(new Set());
      closeDelete();
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
  const counts = countRulesByType(allRules);
  const visibleRules = filterRulesByType(allRules, typeFilter);

  const handleConfirmDelete = () => {
    if (pendingDelete.kind === "single") {
      const { rule } = pendingDelete;
      const scope = rule.network_id === null ? "global" : "network";
      deleteRule.mutate({ scope, id: rule.id });
    } else if (pendingDelete.kind === "bulk") {
      bulkDelete.mutate(pendingDelete.ids);
    }
  };

  const selectedArray = Array.from(selectedIds);
  const isBulkPending =
    bulkDelete.isPending || bulkEnable.isPending || bulkDisable.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-strong text-foreground">Port rules</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Ports that are expected to be open, and ports that always alert as
            critical.
          </p>
        </div>
        {canEdit && (
          <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add rule
          </Button>
        )}
      </div>

      <HubTabs
        tabs={[
          { key: "all", label: `All (${counts.all})` },
          {
            key: "accepted",
            label: `${RULE_TYPE_LABELS.accepted} (${counts.accepted})`,
          },
          {
            key: "critical",
            label: `${RULE_TYPE_LABELS.critical} (${counts.critical})`,
          },
        ]}
        active={typeFilter}
        onChange={(key) => {
          setTypeFilter(key);
          setSelectedIds(new Set());
        }}
      />

      {/* Search + Bulk Actions */}
      <div className="flex flex-wrap items-center gap-3">
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

        {canEdit && selectedIds.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-primary">
              {selectedIds.size} selected
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer">
                Bulk actions
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
                  onClick={() =>
                    setPendingDelete({ kind: "bulk", ids: selectedArray })
                  }
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
        rules={visibleRules}
        search={search}
        portFilter={portFilter}
        selectedIds={selectedIds}
        onSelectedIdsChange={setSelectedIds}
        onDelete={(rule) => setPendingDelete({ kind: "single", rule })}
        isDeleting={deleteRule.isPending}
        canEdit={canEdit}
      />

      {canEdit && (
        <GlobalRuleAddForm
          open={addOpen}
          onOpenChange={setAddOpen}
          onAdded={() => {
            setAddOpen(false);
            invalidate();
          }}
        />
      )}

      <ConfirmDialog
        open={pendingDelete.kind !== "none"}
        onOpenChange={(open) => !open && closeDelete()}
        title={
          pendingDelete.kind === "bulk"
            ? `Delete ${pendingDelete.ids.length} rule(s)?`
            : "Delete this rule?"
        }
        description={deleteDescription(pendingDelete)}
        confirmLabel="Delete"
        pending={deleteRule.isPending || bulkDelete.isPending}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}

function deleteDescription(pending: PendingDelete): string {
  if (pending.kind !== "single")
    return "Matching ports return to normal alerting. This cannot be undone.";
  const { rule } = pending;
  const effect =
    rule.rule_type === "accepted"
      ? "Future scans alert on it again."
      : "It no longer alerts as critical.";
  const target = `${rule.ip ? `${rule.ip}:` : ""}${rule.port || "*"}`;
  return `${RULE_TYPE_LABELS[rule.rule_type]} rule for ${target} (${ruleSourceLabel(
    rule.source,
  )}). ${effect} This cannot be undone.`;
}
