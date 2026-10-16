import { Download, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { ErrorState } from "@/components/data-display/ErrorState";
import { LoadingState } from "@/components/data-display/LoadingState";
import { AdvancedSettings } from "@/components/disclosure/AdvancedSettings";
import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNetworks } from "@/features/dashboard/hooks/useDashboardData";
import type { GvmSeverityRule } from "@/features/severity-rules/api";
import { createSeverityRule } from "@/features/severity-rules/api";
import { SeverityRuleFormDialog } from "@/features/severity-rules/components/SeverityRuleFormDialog";
import {
  useSeverityRuleMutations,
  useSeverityRules,
} from "@/features/severity-rules/hooks/useSeverityRules";
import {
  exportToDownload,
  parseAndResolve,
} from "@/features/severity-rules/lib/importExport";
import {
  ACCEPTED_RISK_LABEL,
  findingSourceLabel,
  isAcceptedRisk,
} from "@/features/severity-rules/lib/ruleKind";
import { useHasRole } from "@/lib/roles";
import { formatDate } from "@/lib/utils";
import { EXPECTED_SCOPES, TRIAGE_ACTIONS } from "@/lib/terminology";

type DialogState =
  | { kind: "closed" }
  | { kind: "add" }
  | { kind: "edit"; rule: GvmSeverityRule };

export function SeverityRulesPage() {
  const canEdit = useHasRole("operator");
  const rulesQuery = useSeverityRules();
  const networksQuery = useNetworks();
  const { remove } = useSeverityRuleMutations();

  const [dialog, setDialog] = useState<DialogState>({ kind: "closed" });
  const [pendingDelete, setPendingDelete] = useState<GvmSeverityRule | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = useState(false);

  const rules = rulesQuery.data?.rules ?? [];
  const networks = networksQuery.data?.networks ?? [];

  const onConfirmDelete = () => {
    if (!pendingDelete) return;
    remove.mutate(pendingDelete.id, {
      onSuccess: () => {
        toast.success("Rule deleted");
        setPendingDelete(null);
      },
      onError: (e: unknown) =>
        toast.error(e instanceof Error ? e.message : "Failed to delete"),
    });
  };

  const onExport = () => {
    if (rules.length === 0) {
      toast.info("No rules to export");
      return;
    }
    exportToDownload(rules);
    toast.success(`Exported ${rules.length} rules`);
  };

  const onImportClick = () => fileInputRef.current?.click();

  const onImportFile = async (file: File) => {
    setImporting(true);
    try {
      const text = await file.text();
      const { valid, skipped } = parseAndResolve(text, networks);
      if (valid.length === 0 && skipped.length === 0) {
        toast.info("File contained no rules");
        return;
      }
      const results = await Promise.allSettled(
        valid.map((payload) => createSeverityRule(payload)),
      );
      const failures = results.filter((r) => r.status === "rejected").length;
      const imported = results.length - failures;

      await rulesQuery.refetch();

      const parts: string[] = [];
      parts.push(`Imported ${imported} rule${imported === 1 ? "" : "s"}`);
      if (failures > 0) parts.push(`${failures} failed`);
      if (skipped.length > 0) parts.push(`${skipped.length} skipped`);
      if (failures > 0 || skipped.length > 0) {
        toast.warning(parts.join(", "));
        for (const s of skipped.slice(0, 5)) {
          toast.warning(`Skipped ${s.entry.oid}: ${s.reason}`);
        }
      } else {
        toast.success(parts.join(", "));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (rulesQuery.isLoading) return <LoadingState />;
  if (rulesQuery.error) return <ErrorState error={rulesQuery.error} />;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-strong text-foreground">Finding rules</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Accepted risks and severity changes for vulnerability findings
          </p>
        </div>
        {canEdit && (
          <Button
            type="button"
            size="sm"
            onClick={() => setDialog({ kind: "add" })}
          >
            <Plus className="mr-1 h-4 w-4" />
            Add rule
          </Button>
        )}
      </header>

      {rules.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No rules yet. Use "{TRIAGE_ACTIONS.acceptRisk.label}" on a finding, or
          "Add rule" above.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border/40">
          <table className="w-full text-sm">
            <thead className="bg-card/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-emphasis">Finding ID</th>
                <th className="px-3 py-2 font-emphasis">Scope</th>
                <th className="px-3 py-2 font-emphasis">Rule</th>
                <th className="px-3 py-2 font-emphasis">Reason</th>
                <th className="px-3 py-2 font-emphasis">Created by</th>
                <th className="px-3 py-2 font-emphasis">Created</th>
                {canEdit && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} className="border-t border-border/30">
                  <td className="px-3 py-2">
                    <div className="font-mono text-xs">{r.oid}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {findingSourceLabel(r.oid)}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {r.network_id == null ? (
                      <Badge variant="secondary">
                        {EXPECTED_SCOPES.global}
                      </Badge>
                    ) : (
                      <Badge variant="outline">
                        {r.network_name ?? `Network #${r.network_id}`}
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <RuleCell rule={r} />
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {r.reason ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {r.created_by_username ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {formatDate(r.created_at)}
                  </td>
                  {canEdit && (
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Edit rule"
                        onClick={() => setDialog({ kind: "edit", rule: r })}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Delete rule"
                        onClick={() => setPendingDelete(r)}
                        disabled={remove.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && (
        <AdvancedSettings summary="Import / export as JSON">
          <p className="text-xs text-muted-foreground">
            Copy finding rules between installations. Rules for a network are
            matched by network name on import.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onExport}
              disabled={rules.length === 0}
            >
              <Download className="mr-1 h-4 w-4" />
              Export JSON
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onImportClick}
              disabled={importing}
            >
              <Upload className="mr-1 h-4 w-4" />
              {importing ? "Importing…" : "Import JSON"}
            </Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onImportFile(file);
            }}
          />
        </AdvancedSettings>
      )}

      {dialog.kind !== "closed" && (
        <SeverityRuleFormDialog
          open
          onClose={() => setDialog({ kind: "closed" })}
          mode={dialog}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete this rule?"
        description={
          pendingDelete
            ? `${pendingDelete.oid} goes back to the severity the scanner reports, so it may alert again. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        pending={remove.isPending}
        onConfirm={onConfirmDelete}
      />
    </div>
  );
}

function RuleCell({ rule }: { rule: GvmSeverityRule }) {
  if (isAcceptedRisk(rule)) {
    return (
      <Badge variant="outline" title="Lowered to info with a reason">
        {ACCEPTED_RISK_LABEL}
      </Badge>
    );
  }
  return (
    <span className="text-sm">
      Counts as <span className="font-emphasis">{rule.severity_override}</span>
    </span>
  );
}
