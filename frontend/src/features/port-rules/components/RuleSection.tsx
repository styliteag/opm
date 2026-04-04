import type { ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import type { PortRule } from "../types";
import { RuleRow } from "./RuleRow";

interface RuleSectionProps {
  title: string;
  icon: ReactNode;
  rules: PortRule[];
  scope: "global" | "network";
  selectedIds: Set<number>;
  onToggleSelect: (id: number, selected: boolean) => void;
  onToggleAll: (ids: number[], selected: boolean) => void;
  onDelete: (rule: PortRule, scope: "global" | "network") => void;
  isDeleting: boolean;
  headerRight?: ReactNode;
}

export function RuleSection({
  title,
  icon,
  rules,
  scope,
  selectedIds,
  onToggleSelect,
  onToggleAll,
  onDelete,
  isDeleting,
  headerRight,
}: RuleSectionProps) {
  const allSelected =
    rules.length > 0 && rules.every((r) => selectedIds.has(r.id));
  const someSelected = rules.some((r) => selectedIds.has(r.id));

  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center justify-between border-b border-border bg-card px-5 py-3">
        <div className="flex items-center gap-3">
          <Checkbox
            checked={allSelected}
            indeterminate={someSelected && !allSelected}
            onCheckedChange={(v) =>
              onToggleAll(
                rules.map((r) => r.id),
                !!v,
              )
            }
          />
          <div className="flex items-center gap-2">
            {icon}
            <h3 className="text-sm font-strong text-foreground">
              {title} ({rules.length})
            </h3>
          </div>
        </div>
        {headerRight}
      </div>
      {rules.length === 0 ? (
        <div className="p-5 text-sm text-muted-foreground">
          No rules configured.
        </div>
      ) : (
        <div className="divide-y divide-border">
          {rules.map((rule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              onDelete={() => onDelete(rule, scope)}
              isDeleting={isDeleting}
              selected={selectedIds.has(rule.id)}
              onSelect={(checked) => onToggleSelect(rule.id, checked)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
