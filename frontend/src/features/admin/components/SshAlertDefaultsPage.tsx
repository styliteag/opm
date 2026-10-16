import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { RotateCcw, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorState } from "@/components/data-display/ErrorState";
import { LoadingState } from "@/components/data-display/LoadingState";
import {
  useApplySSHDefaultsToAll,
  useSSHAlertDefaults,
  useSSHAlertDefaultsMutation,
  useSSHOverridingNetworks,
  type SSHAlertDefaults,
} from "@/features/admin/hooks/useAdmin";

const VERSION_REGEX = /^\d+(\.\d+){1,2}$/;

interface ToggleItem {
  key: keyof Omit<SSHAlertDefaults, "ssh_version_threshold">;
  label: string;
  help: string;
  /** Technical detail, shown as secondary text (ADR 0010). */
  detail?: string;
}

interface ToggleGroup {
  title: string;
  description: string;
  items: ToggleItem[];
}

const TOGGLE_GROUPS: ToggleGroup[] = [
  {
    title: "Login",
    description: "How people and tools may log in to the SSH server.",
    items: [
      {
        key: "ssh_insecure_auth",
        label: "Password login allowed",
        help: "Alerts when the server accepts passwords instead of keys only.",
        detail: "Password or keyboard-interactive authentication.",
      },
    ],
  },
  {
    title: "Encryption",
    description: "Outdated methods that are no longer considered secure.",
    items: [
      {
        key: "ssh_weak_cipher",
        label: "Weak encryption",
        help: "Alerts when the server still offers outdated encryption.",
        detail: "Ciphers such as 3DES, RC4, or CBC modes.",
      },
      {
        key: "ssh_weak_kex",
        label: "Weak key exchange",
        help: "Alerts when the server still offers an outdated way to agree on the connection key.",
        detail:
          "Key exchange (KEX) methods such as diffie-hellman-group1-sha1 or MD5-based variants.",
      },
    ],
  },
  {
    title: "Changes over time",
    description: "Compares each scan with the previous one.",
    items: [
      {
        key: "ssh_config_regression",
        label: "Setup got weaker",
        help: "Alerts when a host's SSH setup is weaker than in the last scan.",
        detail: "E.g. a newly allowed weak cipher or a downgraded SSH version.",
      },
    ],
  },
];

export function SshAlertDefaultsPage() {
  const { data, isLoading, error, refetch } = useSSHAlertDefaults();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-strong text-foreground">SSH defaults</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Which SSH weaknesses raise an alert, for every network without its own
          SSH settings. Changes save instantly.
        </p>
      </div>

      <div className="max-w-3xl space-y-6">
        <OverridesBanner />

        {isLoading ? (
          <LoadingState rows={6} />
        ) : error ? (
          <ErrorState message={error.message} onRetry={refetch} />
        ) : data ? (
          <SshAlertDefaultsForm key={data.ssh_version_threshold} data={data} />
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function OverridesBanner() {
  const { data, isLoading, error } = useSSHOverridingNetworks();
  const applyAll = useApplySSHDefaultsToAll();
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (isLoading || error || !data) return null;

  const count = data.total_count;

  if (count === 0) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
        <p className="text-muted-foreground">
          No network currently overrides the SSH defaults. All networks use the
          values below.
        </p>
      </div>
    );
  }

  const handleConfirm = () => {
    applyAll.mutate(undefined, {
      onSuccess: (res) => {
        toast.success(
          res.cleared_count === 1
            ? "1 network reset"
            : `${res.cleared_count} networks reset`,
        );
        setConfirmOpen(false);
      },
      onError: (err) => toast.error(err.message),
    });
  };

  return (
    <>
      <div className="flex items-start gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-4 py-3 text-sm">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-yellow-400" />
        <div className="flex-1">
          <p className="text-foreground">
            <span className="font-emphasis">{count}</span>{" "}
            {count === 1 ? "network overrides" : "networks override"} these
            defaults.{" "}
            <Link
              to="/networks"
              search={{ filter: "ssh-override" }}
              className="text-primary underline-offset-2 hover:underline"
            >
              View affected networks →
            </Link>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            &ldquo;Apply to all&rdquo; removes the networks&rsquo; own SSH
            settings; other settings such as email recipients are kept.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setConfirmOpen(true)}
          disabled={applyAll.isPending}
          className="gap-1.5"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Apply to all
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(open) => !open && setConfirmOpen(false)}
        title="Use the defaults on every network?"
        description={`The own SSH settings of ${count} ${
          count === 1 ? "network are" : "networks are"
        } removed, so all networks use the values below. Email recipients and other settings stay. This cannot be undone.`}
        confirmLabel={applyAll.isPending ? "Applying..." : "Apply to all"}
        pending={applyAll.isPending}
        onConfirm={handleConfirm}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */

function SshAlertDefaultsForm({ data }: { data: SSHAlertDefaults }) {
  const mutation = useSSHAlertDefaultsMutation();
  const [form, setForm] = useState<SSHAlertDefaults>(data);
  // Threshold draft and error are seeded from props once. The parent
  // remounts this component (key={data.ssh_version_threshold}) on every
  // server-side change, so no useEffect-based sync is needed.
  const [versionDraft, setVersionDraft] = useState(data.ssh_version_threshold);
  const [versionError, setVersionError] = useState<string | null>(null);

  const handleToggle = (
    key: keyof Omit<SSHAlertDefaults, "ssh_version_threshold">,
  ) => {
    const updated = { ...form, [key]: !form[key] };
    setForm(updated);
    mutation.mutate(
      { [key]: updated[key] },
      {
        onSuccess: () => toast.success("Saved"),
        onError: (e) => {
          toast.error(e.message);
          setForm(form); // revert
        },
      },
    );
  };

  const validateVersion = (value: string): boolean => {
    if (!VERSION_REGEX.test(value)) {
      setVersionError("Format e.g. 8.0 or 8.0.0 — digits and dots only.");
      return false;
    }
    setVersionError(null);
    return true;
  };

  const handleVersionChange = (value: string) => {
    setVersionDraft(value);
    if (versionError) validateVersion(value);
  };

  // Saves on blur / Enter like the toggles save on click — no Save button.
  const handleVersionSave = () => {
    if (!validateVersion(versionDraft)) return;
    if (versionDraft === form.ssh_version_threshold) return;
    mutation.mutate(
      { ssh_version_threshold: versionDraft },
      {
        onSuccess: () => {
          setForm({ ...form, ssh_version_threshold: versionDraft });
          toast.success("Saved");
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  return (
    <div className="space-y-4">
      {TOGGLE_GROUPS.map((group) => (
        <Card key={group.title}>
          <CardHeader>
            <CardTitle className="text-sm">{group.title}</CardTitle>
            <CardDescription className="text-xs">
              {group.description}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {group.items.map((item) => (
              <ToggleRow
                key={item.key}
                item={item}
                checked={form[item.key]}
                disabled={mutation.isPending}
                onToggle={() => handleToggle(item.key)}
              />
            ))}
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Version</CardTitle>
          <CardDescription className="text-xs">
            Alerts when the SSH server is older than a minimum version. Only
            OpenSSH servers are checked; Dropbear, libssh, and others are not.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ToggleRow
            item={{
              key: "ssh_outdated_version",
              label: "Outdated SSH version",
              help: "Alerts when the OpenSSH version is below the minimum set below.",
            }}
            checked={form.ssh_outdated_version}
            disabled={mutation.isPending}
            onToggle={() => handleToggle("ssh_outdated_version")}
          />

          <div className="rounded-md bg-accent/50 px-3 py-3">
            <Label
              htmlFor="ssh-min-version"
              className="text-sm font-normal text-foreground"
            >
              Minimum version
            </Label>
            <div className="mt-2 flex items-start gap-2">
              <div className="flex-1">
                <Input
                  id="ssh-min-version"
                  type="text"
                  value={versionDraft}
                  onChange={(e) => handleVersionChange(e.target.value)}
                  onBlur={handleVersionSave}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleVersionSave();
                  }}
                  disabled={mutation.isPending}
                  className="w-32 font-mono"
                  placeholder="8.0.0"
                  aria-invalid={versionError !== null}
                  aria-describedby={
                    versionError ? "ssh-min-version-error" : undefined
                  }
                />
                {versionError && (
                  <p
                    id="ssh-min-version-error"
                    className="mt-1 text-xs text-destructive"
                  >
                    {versionError}
                  </p>
                )}
                {!versionError && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Example: <code className="font-mono">9.6</code> or{" "}
                    <code className="font-mono">9.6.1</code>
                  </p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */

interface ToggleRowProps {
  item: ToggleItem;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}

function ToggleRow({ item, checked, disabled, onToggle }: ToggleRowProps) {
  const switchId = `ssh-toggle-${item.key}`;
  return (
    <div className="rounded-md bg-accent/50 px-3 py-2">
      <div className="flex items-start justify-between gap-3">
        <Label
          htmlFor={switchId}
          className="flex-1 text-sm font-normal text-foreground"
        >
          {item.label}
        </Label>
        <button
          id={switchId}
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={`Toggle ${item.label}`}
          onClick={onToggle}
          disabled={disabled}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${
            checked ? "bg-primary" : "bg-muted"
          }`}
        >
          <span
            className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg transition-transform ${
              checked ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{item.help}</p>
      {item.detail && (
        <p className="mt-0.5 text-[11px] text-text-quaternary">{item.detail}</p>
      )}
    </div>
  );
}
