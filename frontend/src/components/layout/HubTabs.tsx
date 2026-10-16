import { cn } from "@/lib/utils";

export interface HubTab<K extends string> {
  key: K;
  label: string;
}

interface HubTabsProps<K extends string> {
  tabs: readonly HubTab<K>[];
  active: K;
  onChange: (key: K) => void;
  className?: string;
}

/** Segmented tab bar shared by the hub pages (Settings tabs, Ports/Hosts). */
export function HubTabs<K extends string>({
  tabs,
  active,
  onChange,
  className,
}: HubTabsProps<K>) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex gap-0.5 rounded-lg border border-border-subtle bg-surface-2/50 p-[3px] text-xs font-emphasis",
        className,
      )}
    >
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={active === t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            "cursor-pointer rounded-md border px-3 py-1 transition-colors",
            active === t.key
              ? "border-border-standard bg-surface-3 text-text-primary shadow-sm"
              : "border-transparent text-text-quaternary hover:text-text-secondary",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
