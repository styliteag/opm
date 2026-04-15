import { createFileRoute } from "@tanstack/react-router";
import { Download, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { ErrorState } from "@/components/data-display/ErrorState";
import { LoadingState } from "@/components/data-display/LoadingState";
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

export const Route = createFileRoute("/_authenticated/admin/severity-rules")({
  component: SeverityRulesPage,
});

type DialogState =
  | { kind: "closed" }
  | { kind: "add" }
  | { kind: "edit"; rule: GvmSeverityRule };

function SeverityRulesPage() {
  const rulesQuery = useSeverityRules();
  const networksQuery = useNetworks();
  const { remove } = useSeverityRuleMutations();

  const [dialog, setDialog] = useState<DialogState>({ kind: "closed" });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = useState(false);

  const rules = rulesQuery.data?.rules ?? [];
  const networks = networksQuery.data?.networks ?? [];

  const onDelete = (id: number) => {
    remove.mutate(id, {
      onSuccess: () => toast.success("Rule removed"),
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
    <div className="space-y-4 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-emphasis">Severity Rules</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Per-finding severity overrides. A rule changes what severity GVM,
            NSE, and nuclei findings carry when generating alerts.
            Network-scoped rules take precedence over global rules.
          </p>
        </div>
        <div className="flex gap-2">
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
          <Button
            type="button"
            size="sm"
            onClick={() => setDialog({ kind: "add" })}
          >
            <Plus className="mr-1 h-4 w-4" />
            Add rule
          </Button>
        </div>
      </header>

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

      {rules.length === 0 ? (
        <p className="text-sm text-text-secondary">
          No rules yet. Click "Add rule" above, or open any finding on a host
          detail or scan page and use "Change severity".
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border/40">
          <table className="w-full text-sm">
            <thead className="bg-card/40 text-left text-xs uppercase text-text-tertiary">
              <tr>
                <th className="px-3 py-2">OID</th>
                <th className="px-3 py-2">Scope</th>
                <th className="px-3 py-2">Override</th>
                <th className="px-3 py-2">Reason</th>
                <th className="px-3 py-2">Created by</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} className="border-t border-border/30">
                  <td className="px-3 py-2 font-mono text-xs">{r.oid}</td>
                  <td className="px-3 py-2">
                    {r.network_id == null ? (
                      <Badge>Global</Badge>
                    ) : (
                      <Badge variant="outline">
                        {r.network_name ?? `Network #${r.network_id}`}
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 font-emphasis">
                    {r.severity_override}
                  </td>
                  <td className="px-3 py-2 text-text-secondary">
                    {r.reason ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-text-secondary">
                    {r.created_by_username ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-text-secondary">
                    {new Date(r.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDialog({ kind: "edit", rule: r })}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(r.id)}
                      disabled={remove.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dialog.kind !== "closed" && (
        <SeverityRuleFormDialog
          open
          onClose={() => setDialog({ kind: "closed" })}
          mode={dialog}
        />
      )}
    </div>
  );
}
