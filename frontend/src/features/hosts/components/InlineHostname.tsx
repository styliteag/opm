import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { patchApi } from "@/lib/api";

export function InlineHostname({
  hostId,
  hostname,
  ip,
}: {
  hostId: number;
  hostname: string | null;
  ip: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(hostname ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: (value: string) =>
      patchApi(`/api/hosts/${hostId}`, { hostname: value }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hosts", hostId, "overview"] });
      setEditing(false);
      toast.success("Hostname updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const startEditing = useCallback(() => {
    setDraft(hostname ?? "");
    setEditing(true);
  }, [hostname]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      save.mutate(draft);
    } else if (e.key === "Escape") {
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => setEditing(false)}
          className="text-2xl font-strong text-foreground bg-transparent border-b-2 border-primary outline-none"
          disabled={save.isPending}
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onMouseDown={(e) => {
            e.preventDefault();
            save.mutate(draft);
          }}
        >
          <Check className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onMouseDown={(e) => {
            e.preventDefault();
            setEditing(false);
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <h1
      className="group flex items-center gap-2 text-2xl font-strong text-foreground cursor-pointer"
      onClick={startEditing}
    >
      {hostname ?? ip}
      <Pencil className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
    </h1>
  );
}
