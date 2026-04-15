import { createFileRoute } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ErrorState } from "@/components/data-display/ErrorState";
import { LoadingState } from "@/components/data-display/LoadingState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useSeverityRuleMutations,
  useSeverityRules,
} from "@/features/severity-rules/hooks/useSeverityRules";

export const Route = createFileRoute("/_authenticated/admin/severity-rules")({
  component: SeverityRulesPage,
});

function SeverityRulesPage() {
  const rulesQuery = useSeverityRules();
  const { remove } = useSeverityRuleMutations();

  const onDelete = (id: number) => {
    remove.mutate(id, {
      onSuccess: () => toast.success("Rule removed"),
      onError: (e: unknown) =>
        toast.error(e instanceof Error ? e.message : "Failed to delete"),
    });
  };

  if (rulesQuery.isLoading) return <LoadingState />;
  if (rulesQuery.error) return <ErrorState error={rulesQuery.error} />;

  const rules = rulesQuery.data?.rules ?? [];

  return (
    <div className="space-y-4 p-6">
      <header>
        <h1 className="text-2xl font-emphasis">Severity Rules</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Per-finding severity overrides. A rule changes what severity GVM,
          NSE, and nuclei findings carry when generating alerts.
          Network-scoped rules take precedence over global rules.
        </p>
      </header>

      {rules.length === 0 ? (
        <p className="text-sm text-text-secondary">
          No rules yet. Open any finding on a host detail or scan page and use
          "Change severity" to create the first one.
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
    </div>
  );
}
