import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Building, Save, Shield } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LoadingState } from "@/components/data-display/LoadingState";
import { ErrorState } from "@/components/data-display/ErrorState";
import {
  useOrganization,
  useOrgMutations,
  useSSHAlertDefaults,
  useSSHAlertDefaultsMutation,
} from "@/features/admin/hooks/useAdmin";
import type {
  Organization,
  SSHAlertDefaults,
} from "@/features/admin/hooks/useAdmin";

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
        <SecurityPoliciesSection />
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

function SecurityPoliciesSection() {
  const { data, isLoading, error } = useSSHAlertDefaults();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm">SSH Alert Defaults</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Global defaults used when a network has no custom alert configuration.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : error ? (
          <p className="text-sm text-destructive">
            Failed to load SSH defaults
          </p>
        ) : data ? (
          <SecurityPoliciesForm key={data.ssh_version_threshold} data={data} />
        ) : null}
      </CardContent>
    </Card>
  );
}

const SSH_TOGGLE_ITEMS: {
  key: keyof Omit<SSHAlertDefaults, "ssh_version_threshold">;
  label: string;
}[] = [
  {
    key: "ssh_insecure_auth",
    label: "Insecure Auth (password/keyboard-interactive)",
  },
  { key: "ssh_weak_cipher", label: "Weak Ciphers" },
  { key: "ssh_weak_kex", label: "Weak Key Exchange" },
  { key: "ssh_outdated_version", label: "Outdated SSH Version" },
  { key: "ssh_config_regression", label: "Configuration Regression" },
];

function SecurityPoliciesForm({ data }: { data: SSHAlertDefaults }) {
  const mutation = useSSHAlertDefaultsMutation();
  const [form, setForm] = useState<SSHAlertDefaults>(data);

  const handleToggle = (
    key: keyof Omit<SSHAlertDefaults, "ssh_version_threshold">,
  ) => {
    const updated = { ...form, [key]: !form[key] };
    setForm(updated);
    mutation.mutate(
      { [key]: updated[key] },
      {
        onSuccess: () => toast.success("SSH alert default updated"),
        onError: (e) => toast.error(e.message),
      },
    );
  };

  const handleThresholdSave = () => {
    mutation.mutate(
      { ssh_version_threshold: form.ssh_version_threshold },
      {
        onSuccess: () => toast.success("SSH version threshold updated"),
        onError: (e) => toast.error(e.message),
      },
    );
  };

  return (
    <div className="space-y-3">
      {SSH_TOGGLE_ITEMS.map(({ key, label }) => {
        const switchId = `ssh-toggle-${key}`;
        return (
          <div
            key={key}
            className="flex items-center justify-between rounded-md bg-accent/50 px-3 py-2"
          >
            <Label
              htmlFor={switchId}
              className="text-sm font-normal text-foreground"
            >
              {label}
            </Label>
            <button
              id={switchId}
              type="button"
              role="switch"
              aria-checked={form[key]}
              aria-label={`Toggle ${label}`}
              onClick={() => handleToggle(key)}
              disabled={mutation.isPending}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${
                form[key] ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg transition-transform ${
                  form[key] ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        );
      })}

      <div className="rounded-md bg-accent/50 px-3 py-2">
        <div className="flex items-center justify-between">
          <Label
            htmlFor="ssh-min-version"
            className="text-sm font-normal text-foreground"
          >
            Minimum SSH Version
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id="ssh-min-version"
              type="text"
              value={form.ssh_version_threshold}
              onChange={(e) =>
                setForm({
                  ...form,
                  ssh_version_threshold: e.target.value,
                })
              }
              className="w-20 text-center"
              placeholder="8.0.0"
            />
            <Button
              size="sm"
              onClick={handleThresholdSave}
              disabled={mutation.isPending}
            >
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
