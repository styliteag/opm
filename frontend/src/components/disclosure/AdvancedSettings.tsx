import { useId, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

interface AdvancedSettingsProps {
  children: React.ReactNode;
  /** Start expanded (e.g. when an advanced value differs from its default). */
  defaultOpen?: boolean;
  /** Short recap of the hidden values, shown next to the toggle while closed. */
  summary?: string;
  className?: string;
  /** Controlled mode: pass both to open the section from outside (e.g. on a validation error). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Inline "Show advanced settings" disclosure (ADR 0011). Defaults stay
 * visible; engine knobs render in place only when expanded.
 */
export function AdvancedSettings({
  children,
  defaultOpen = false,
  summary,
  className,
  open: controlledOpen,
  onOpenChange,
}: AdvancedSettingsProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  const contentId = useId();
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? contentId : undefined}
          onClick={() => setOpen(!open)}
          className="inline-flex cursor-pointer items-center gap-1 rounded-md text-sm font-emphasis text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Chevron className="h-4 w-4" />
          {open ? "Hide advanced settings" : "Show advanced settings"}
        </button>
        {!open && summary && (
          <span className="text-xs text-muted-foreground">{summary}</span>
        )}
      </div>
      {open && (
        <div id={contentId} className="space-y-4">
          {children}
        </div>
      )}
    </div>
  );
}
