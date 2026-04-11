import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useNseMutations } from "@/features/nse/hooks/useNse";
import { getProtocol } from "@/features/nse/lib/scriptProtocol";
import { ScriptSelector } from "./ScriptSelector";

interface ProfileEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile?: {
    id: number;
    name: string;
    description: string | null;
    severity: string | null;
    nse_scripts: string[];
  };
}

export function ProfileEditModal({
  open,
  onOpenChange,
  profile,
}: ProfileEditModalProps) {
  const { createProfile, updateProfile } = useNseMutations();
  const isEdit = Boolean(profile);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("");
  const [selectedScripts, setSelectedScripts] = useState<Set<string>>(
    new Set(),
  );

  // Reset form when modal opens/profile changes — intentional synchronization
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) {
      if (profile) {
        setName(profile.name);
        setDescription(profile.description ?? "");
        setSeverity(profile.severity ?? "");
        setSelectedScripts(new Set(profile.nse_scripts));
      } else {
        setName("");
        setDescription("");
        setSeverity("");
        setSelectedScripts(new Set());
      }
    }
  }, [open, profile]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const initiallyExpanded = profile
    ? new Set(profile.nse_scripts.map(getProtocol))
    : undefined;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (selectedScripts.size === 0) {
      toast.error("Select at least one script");
      return;
    }

    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
      severity: severity || undefined,
      nse_scripts: Array.from(selectedScripts).sort(),
    };

    if (isEdit && profile) {
      updateProfile.mutate(
        { id: profile.id, ...payload },
        {
          onSuccess: () => {
            toast.success("Profile updated");
            onOpenChange(false);
          },
          onError: (err) => toast.error(err.message),
        },
      );
    } else {
      createProfile.mutate(payload, {
        onSuccess: () => {
          toast.success("Profile created");
          onOpenChange(false);
        },
        onError: (err) => toast.error(err.message),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit Profile" : "Create Profile"}
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 py-2 min-h-0"
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="profile-name">Name</Label>
              <Input
                id="profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Scan Profile"
              />
            </div>
            <div>
              <Label htmlFor="profile-severity">Default Severity</Label>
              <Select
                id="profile-severity"
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
              >
                <option value="">None</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="info">Info</option>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="profile-description">Description</Label>
            <Textarea
              id="profile-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this profile scans for"
              rows={2}
            />
          </div>

          <ScriptSelector
            selected={selectedScripts}
            onChange={setSelectedScripts}
            initiallyExpanded={initiallyExpanded}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createProfile.isPending || updateProfile.isPending}
            >
              {createProfile.isPending || updateProfile.isPending
                ? "Saving..."
                : isEdit
                  ? "Update"
                  : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
