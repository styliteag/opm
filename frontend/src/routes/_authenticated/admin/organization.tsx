import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Building, Save, Shield } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/data-display/LoadingState";
import { ErrorState } from "@/components/data-display/ErrorState";
import {
  useOrganization,
  useOrgMutations,
  useSSHAlertDefaults,
  useSSHAlertDefaultsMutation,
} from "@/features/admin/hooks/useAdmin";
import type { SSHAlertDefaults } from "@/features/admin/hooks/useAdmin";

export const Route = createFileRoute("/_authenticated/admin/organization")({
  component: OrganizationPage,
});

function OrganizationPage() {
  const { data, isLoading, error, refetch } = useOrganization();
  const { update } = useOrgMutations();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [securityPolicyUrl, setSecurityPolicyUrl] = useState("");
  const [initialized, setInitialized] = useState(false);

  if (isLoading) return <LoadingState rows={4} />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  if (!data) return <ErrorState message="Organization not found" />;

  if (!initialized) {
    setName(data.name);
    setDescription(data.description ?? "");
    setContactEmail(data.contact_email ?? "");
    setLogoUrl(data.logo_url ?? "");
    setSecurityPolicyUrl(data.security_policy_url ?? "");
    setInitialized(true);
  }

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

  const inputClass =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";

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
        <div className="rounded-lg border border-border bg-card p-6 space-y-4">
          <h3 className="text-sm font-strong text-foreground">
            General Settings
          </h3>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Organization Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Contact Email
            </label>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className={inputClass}
              placeholder="security@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Logo URL
            </label>
            <input
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              className={inputClass}
              placeholder="https://example.com/logo.png"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Security Policy URL
            </label>
            <input
              type="url"
              value={securityPolicyUrl}
              onChange={(e) => setSecurityPolicyUrl(e.target.value)}
              className={inputClass}
              placeholder="https://example.com/security-policy"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={update.isPending}
            className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <Save className="h-4 w-4" />
            {update.isPending ? "Saving..." : "Save Changes"}
          </button>
        </div>

        <SecurityPoliciesSection />
      </div>
    </div>
  );
}

function SecurityPoliciesSection() {
  const { data, isLoading, error } = useSSHAlertDefaults();
  const mutation = useSSHAlertDefaultsMutation();

  const [form, setForm] = useState<SSHAlertDefaults | null>(null);
  if (data && !form) {
    setForm(data);
  }

  const handleToggle = (
    key: keyof Omit<SSHAlertDefaults, "ssh_version_threshold">,
  ) => {
    if (!form) return;
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
    if (!form) return;
    mutation.mutate(
      { ssh_version_threshold: form.ssh_version_threshold },
      {
        onSuccess: () => toast.success("SSH version threshold updated"),
        onError: (e) => toast.error(e.message),
      },
    );
  };

  const toggleItems: {
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
        ) : form ? (
          <div className="space-y-3">
            {toggleItems.map(({ key, label }) => (
              <div
                key={key}
                className="flex items-center justify-between rounded-md bg-accent/50 px-3 py-2"
              >
                <span className="text-sm text-foreground">{label}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form[key]}
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
            ))}

            <div className="rounded-md bg-accent/50 px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground">
                  Minimum SSH Version
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={form.ssh_version_threshold}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        ssh_version_threshold: e.target.value,
                      })
                    }
                    className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground text-center"
                    placeholder="8.0.0"
                  />
                  <button
                    onClick={handleThresholdSave}
                    disabled={mutation.isPending}
                    className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
