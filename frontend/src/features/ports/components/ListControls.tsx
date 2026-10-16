import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SegmentedControlProps<K extends string> {
  label: string;
  options: readonly { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
}

/** Filter toggle in the HubTabs look, with button semantics instead of tabs. */
export function SegmentedControl<K extends string>({
  label,
  options,
  value,
  onChange,
}: SegmentedControlProps<K>) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex gap-0.5 rounded-lg border border-border-subtle bg-surface-2/50 p-[3px] text-xs font-emphasis"
    >
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={value === o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            "cursor-pointer rounded-md border px-2.5 py-1 transition-colors",
            value === o.key
              ? "border-border-standard bg-surface-3 text-text-primary shadow-sm"
              : "border-transparent text-text-quaternary hover:text-text-secondary",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

interface PagerProps {
  page: number;
  pageSize: number;
  shown: number;
  /** Known total, or undefined when the API only says "maybe more". */
  total?: number;
  hasNext: boolean;
  noun: string;
  onPage: (page: number) => void;
}

export function Pager({
  page,
  pageSize,
  shown,
  total,
  hasNext,
  noun,
  onPage,
}: PagerProps) {
  const from = shown > 0 ? page * pageSize + 1 : 0;
  const to = page * pageSize + shown;
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">
        {shown > 0
          ? `Showing ${from}–${to}${total !== undefined ? ` of ${total.toLocaleString()}` : ""} ${noun}`
          : `No ${noun} on this page`}
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page === 0}
          onClick={() => onPage(Math.max(0, page - 1))}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!hasNext}
          onClick={() => onPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
