import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { patchApi } from "@/lib/api";
import { useHasRole } from "@/lib/roles";

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
  // PATCH /api/hosts/{id} is operator+; others see the comment read-only.
  const canEdit = useHasRole("operator");

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
        <Label
          htmlFor={inputId}
          className="mb-1.5 text-xs text-muted-foreground"
        >
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

  if (!canEdit) {
    return comment ? (
      <p className="text-sm text-secondary-foreground">{comment}</p>
    ) : null;
  }

  return (
    <button
      type="button"
      className="group flex max-w-full cursor-pointer items-center gap-1.5 rounded-sm text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => {
        setDraft(comment ?? "");
        setEditing(true);
      }}
    >
      {comment ? (
        <span className="text-secondary-foreground">{comment}</span>
      ) : (
        <span className="text-muted-foreground">Add a host comment…</span>
      )}
      <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}
