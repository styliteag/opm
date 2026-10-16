import { useState } from "react";
import { Check, Pencil, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface WhyCellProps {
  value: string | null;
  /** Controlled by the table so only one Why is edited at a time. */
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  /** Called only when the text changed; an empty string clears the comment. */
  onSave: (value: string) => void;
  pending?: boolean;
  className?: string;
}

/** The single "Why" of a port (ADR 0012) — the port comment, edited inline. */
export function WhyCell({
  value,
  editing,
  onEdit,
  onCancel,
  onSave,
  pending,
  className,
}: WhyCellProps) {
  if (editing) {
    return (
      <WhyEditor
        value={value}
        onCancel={onCancel}
        onSave={onSave}
        pending={pending}
        className={className}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={onEdit}
      className={cn(
        "group/why flex max-w-full cursor-pointer items-center gap-1 rounded-sm text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {value ? (
        <span className="truncate text-foreground" title={value}>
          {value}
        </span>
      ) : (
        <span className="text-muted-foreground">Add why…</span>
      )}
      <Pencil className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/why:opacity-100" />
    </button>
  );
}

/** Mounted only while editing, so the draft starts from the current value. */
function WhyEditor({
  value,
  onCancel,
  onSave,
  pending,
  className,
}: Pick<
  WhyCellProps,
  "value" | "onCancel" | "onSave" | "pending" | "className"
>) {
  const [draft, setDraft] = useState(value ?? "");

  const save = () => {
    if (draft.trim() === (value ?? "").trim()) onCancel();
    else onSave(draft);
  };

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <input
        autoFocus
        value={draft}
        maxLength={500}
        disabled={pending}
        aria-label="Why is this port open?"
        placeholder="e.g. Web server"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save();
          } else if (e.key === "Escape") {
            onCancel();
          }
        }}
        className="min-w-0 flex-1 border-b-2 border-primary bg-transparent text-sm text-foreground outline-none"
      />
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Save why"
        disabled={pending}
        onClick={save}
      >
        <Check />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Cancel"
        onClick={onCancel}
      >
        <X />
      </Button>
    </div>
  );
}
