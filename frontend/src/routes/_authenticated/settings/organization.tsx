import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LoadingState } from "@/components/data-display/LoadingState";
import { ErrorState } from "@/components/data-display/ErrorState";
import {
  useOrganization,
  useOrgMutations,
} from "@/features/admin/hooks/useAdmin";
import type { Organization } from "@/features/admin/hooks/useAdmin";

export const Route = createFileRoute("/_authenticated/settings/organization")({
  component: OrganizationPage,
});

function OrganizationPage() {
  const { data, isLoading, error, refetch } = useOrganization();

  if (isLoading) return <LoadingState rows={4} />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  if (!data) return <ErrorState message="Organization not found" />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-strong text-foreground">Organization</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Name, description, and security contact of the organization running
          this installation.
        </p>
      </div>

      <div className="max-w-2xl space-y-6">
        <OrganizationForm key={data.id ?? "org"} data={data} />
      </div>
    </div>
  );
}

function OrganizationForm({ data }: { data: Organization }) {
  const { update } = useOrgMutations();
  const [name, setName] = useState(data.name);
  const [description, setDescription] = useState(data.description ?? "");
  const [contactEmail, setContactEmail] = useState(data.contact_email ?? "");

  const handleSave = () => {
    update.mutate(
      {
        name: name || undefined,
        description: description || undefined,
        contact_email: contactEmail || undefined,
      },
      {
        onSuccess: () => toast.success("Organization updated"),
        onError: (e) => toast.error(e.message),
      },
    );
  };

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-4">
      <h3 className="text-sm font-strong text-foreground">General</h3>

      <div>
        <Label htmlFor="org-name" className="mb-1">
          Organization name
        </Label>
        <Input
          id="org-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div>
        <Label htmlFor="org-description" className="mb-1">
          Description
        </Label>
        <Textarea
          id="org-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
      </div>

      <div>
        <Label htmlFor="org-contact-email" className="mb-1">
          Contact email
        </Label>
        <Input
          id="org-contact-email"
          type="email"
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
          placeholder="security@example.com"
        />
      </div>

      <Button
        onClick={handleSave}
        disabled={update.isPending}
        className="gap-1.5"
      >
        <Save className="h-4 w-4" />
        {update.isPending ? "Saving..." : "Save changes"}
      </Button>
    </div>
  );
}
