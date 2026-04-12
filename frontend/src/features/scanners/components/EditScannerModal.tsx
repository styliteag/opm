import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod/v4";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useScannerMutations } from "@/features/scanners/hooks/useScanners";
import type { Scanner } from "@/lib/types";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  location: z.string().optional(),
  kind: z.enum(["standard", "gvm", "unified"]),
});

type FormData = z.infer<typeof schema>;

interface EditScannerModalProps {
  scanner: Scanner;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditScannerModal({
  scanner,
  open,
  onOpenChange,
}: EditScannerModalProps) {
  const { update } = useScannerMutations();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: scanner.name,
      description: scanner.description ?? "",
      location: scanner.location ?? "",
      kind: scanner.kind,
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        name: scanner.name,
        description: scanner.description ?? "",
        location: scanner.location ?? "",
        kind: scanner.kind,
      });
    }
  }, [open, scanner, reset]);

  const onSubmit = (data: FormData) => {
    update.mutate(
      { id: scanner.id, ...data },
      {
        onSuccess: () => {
          toast.success("Scanner updated");
          onOpenChange(false);
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Scanner</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div>
            <Label htmlFor="edit-name">Name</Label>
            <Input
              id="edit-name"
              {...register("name")}
              placeholder="e.g. HQ Berlin"
            />
            {errors.name && (
              <p className="mt-1 text-xs text-destructive">
                {errors.name.message}
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="edit-description">Description</Label>
            <Textarea
              id="edit-description"
              {...register("description")}
              placeholder="Optional description"
              rows={2}
            />
          </div>
          <div>
            <Label htmlFor="edit-location">Location</Label>
            <Input
              id="edit-location"
              {...register("location")}
              placeholder="e.g. AWS eu-west-1"
            />
          </div>
          <div>
            <Label htmlFor="edit-kind">Kind</Label>
            <Select id="edit-kind" {...register("kind")}>
              <option value="standard">Standard (masscan / nmap / nse)</option>
              <option value="gvm">GVM (Greenbone bridge only)</option>
              <option value="unified">Unified (standard + GVM)</option>
            </Select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Kind should match the actual scanner image deployed
              (opm-scanner / opm-scanner-gvm / opm-scanner-unified).
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
