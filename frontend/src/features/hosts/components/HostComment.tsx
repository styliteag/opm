import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { patchApi } from "@/lib/api";

export function HostComment({
  hostId,
  comment,
}: {
  hostId: number;
  comment: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment ?? "");
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: (user_comment: string) =>
      patchApi(`/api/hosts/${hostId}`, { user_comment }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hosts", hostId, "overview"] });
      setEditing(false);
      toast.success("Comment saved");
    },
    onError: (e) => toast.error(e.message),
  });

  if (editing) {
    const inputId = `host-comment-${hostId}`;
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <Label htmlFor={inputId} className="mb-1.5 text-xs text-muted-foreground">
          Host Comment
        </Label>
        <Textarea
          id={inputId}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          className="resize-y"
          placeholder="Add a comment about this host..."
        />
        <div className="mt-2 flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => save.mutate(draft)}
            disabled={save.isPending}
          >
            <Check className="h-3.5 w-3.5 mr-1" />
            {save.isPending ? "Saving..." : "Save"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDraft(comment ?? "");
              setEditing(false);
            }}
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="group rounded-lg border border-border bg-card p-4 cursor-pointer hover:border-primary/30 transition-colors"
      onClick={() => {
        setDraft(comment ?? "");
        setEditing(true);
      }}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-emphasis text-muted-foreground">
          Host Comment
        </span>
        <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <p className="text-sm text-foreground">
        {comment || (
          <span className="text-muted-foreground italic">
            Click to add a comment...
          </span>
        )}
      </p>
    </div>
  );
}
