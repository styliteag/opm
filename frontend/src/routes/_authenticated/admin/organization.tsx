import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Building, Save } from "lucide-react";
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

export const Route = createFileRoute("/_authenticated/admin/organization")({
  component: OrganizationPage,
});

function OrganizationPage() {
  const { data, isLoading, error, refetch } = useOrganization();

  if (isLoading) return <LoadingState rows={4} />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  if (!data) return <ErrorState message="Organization not found" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Building className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-strong text-foreground">
            Organization Control
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Centralize settings and manage organization-level configuration.
          </p>
        </div>
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
  const [logoUrl, setLogoUrl] = useState(data.logo_url ?? "");
  const [securityPolicyUrl, setSecurityPolicyUrl] = useState(
    data.security_policy_url ?? "",
  );

  const handleSave = () => {
    update.mutate(
      {
        name: name || undefined,
        description: description || undefined,
        contact_email: contactEmail || undefined,
        logo_url: logoUrl || null,
        security_policy_url: securityPolicyUrl || null,
      },
      {
        onSuccess: () => toast.success("Organization updated"),
        onError: (e) => toast.error(e.message),
      },
    );
  };

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-4">
      <h3 className="text-sm font-strong text-foreground">General Settings</h3>

      <div>
        <Label htmlFor="org-name" className="mb-1">
          Organization Name
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
          Contact Email
        </Label>
        <Input
          id="org-contact-email"
          type="email"
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
          placeholder="security@example.com"
        />
      </div>

      <div>
        <Label htmlFor="org-logo-url" className="mb-1">
          Logo URL
        </Label>
        <Input
          id="org-logo-url"
          type="url"
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
          placeholder="https://example.com/logo.png"
        />
      </div>

      <div>
        <Label htmlFor="org-security-policy-url" className="mb-1">
          Security Policy URL
        </Label>
        <Input
          id="org-security-policy-url"
          type="url"
          value={securityPolicyUrl}
          onChange={(e) => setSecurityPolicyUrl(e.target.value)}
          placeholder="https://example.com/security-policy"
        />
      </div>

      <Button
        onClick={handleSave}
        disabled={update.isPending}
        className="gap-1.5"
      >
        <Save className="h-4 w-4" />
        {update.isPending ? "Saving..." : "Save Changes"}
      </Button>
    </div>
  );
}

