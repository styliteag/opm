import { Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/data-display/StatusBadge";
import { cn } from "@/lib/utils";
import { getAlertTypeLabel } from "@/lib/alert-types";
import type { PortRule } from "../types";
import { SourceBadge } from "./SourceBadge";

interface RuleRowProps {
  rule: PortRule;
  onDelete: () => void;
  isDeleting: boolean;
  selected: boolean;
  onSelect: (checked: boolean) => void;
}

export function RuleRow({
  rule,
  onDelete,
  isDeleting,
  selected,
  onSelect,
}: RuleRowProps) {
  const extraParts: string[] = [];
  if (rule.alert_type) extraParts.push(getAlertTypeLabel(rule.alert_type));
  if (rule.script_name) extraParts.push(rule.script_name);

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-5 py-3 group transition-colors",
        selected && "bg-primary/5",
        !rule.enabled && "opacity-50",
      )}
    >
      <Checkbox checked={selected} onCheckedChange={(v) => onSelect(!!v)} />
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <SourceBadge source={rule.source} />
        <span className="font-mono text-sm text-foreground">
          {rule.ip ? `${rule.ip}:` : ""}
          {rule.port || "*"}
        </span>
        {extraParts.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {extraParts.join(" · ")}
          </span>
        )}
        <StatusBadge
          label={rule.rule_type}
          variant={rule.rule_type === "accepted" ? "success" : "danger"}
        />
        {!rule.enabled && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            disabled
          </span>
        )}
        {rule.description && (
          <span className="text-sm text-muted-foreground truncate">
            — {rule.description}
          </span>
        )}
      </div>
      <button
        onClick={onDelete}
        disabled={isDeleting}
        className="rounded p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50 cursor-pointer"
        title="Remove rule"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
