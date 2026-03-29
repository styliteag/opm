import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Pencil, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface InlineTextCellProps {
  value: string | null;
  onSave: (value: string) => void;
  saveLabel?: string;
  placeholder?: string;
  isPending?: boolean;
  className?: string;
}

export function InlineTextCell({
  value,
  onSave,
  saveLabel = "Save change",
  placeholder = "Add comment...",
  isPending = false,
  className,
}: InlineTextCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  const cellRef = useRef<HTMLDivElement>(null);

  const startEditing = useCallback(() => {
    setDraft(value ?? "");
    setEditing(true);
  }, [value]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const handleSave = useCallback(() => {
    onSave(draft);
    setEditing(false);
    cellRef.current?.focus();
  }, [draft, onSave]);

  const handleCancel = useCallback(() => {
    setDraft(value ?? "");
    setEditing(false);
    cellRef.current?.focus();
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  };

  const handleCellKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      startEditing();
    }
  };

  if (editing) {
    return (
      <div className={cn("flex items-center gap-1", className)}>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => handleSave()}
          className="text-sm text-foreground bg-transparent border-b-2 border-primary outline-none focus:ring-ring"
          disabled={isPending}
          aria-label={saveLabel}
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onMouseDown={(e) => {
            e.preventDefault();
            handleSave();
          }}
        >
          <Check className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onMouseDown={(e) => {
            e.preventDefault();
            handleCancel();
          }}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return (
    <div
      ref={cellRef}
      role="button"
      tabIndex={0}
      className={cn(
        "group/cell flex items-center gap-1 cursor-pointer",
        className,
      )}
      onClick={startEditing}
      onKeyDown={handleCellKeyDown}
    >
      {value ? (
        <span className="text-sm text-foreground">{value}</span>
      ) : (
        <span className="text-sm italic text-muted-foreground">
          {placeholder}
        </span>
      )}
      <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover/cell:opacity-100 transition-opacity" />
    </div>
  );
}
