import { ruleSourceLabel } from "../lib/ruleLabels";

export function SourceBadge({ source }: { source: string }) {
  return (
    <span className="whitespace-nowrap rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[11px] font-emphasis text-muted-foreground">
      {ruleSourceLabel(source)}
    </span>
  );
}
