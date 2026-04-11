import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  KeyRound,
  RotateCcw,
  Save,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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

export const Route = createFileRoute("/_authenticated/admin/ssh-alert-defaults")({
  component: SshAlertDefaultsPage,
});

const VERSION_REGEX = /^\d+(\.\d+){1,2}$/;

interface ToggleItem {
  key: keyof Omit<SSHAlertDefaults, "ssh_version_threshold">;
  label: string;
  help: string;
}

interface ToggleGroup {
  title: string;
  description: string;
  items: ToggleItem[];
}

const TOGGLE_GROUPS: ToggleGroup[] = [
  {
    title: "Anmeldung",
    description: "Wie sich Clients am SSH-Server anmelden dürfen.",
    items: [
      {
        key: "ssh_insecure_auth",
        label: "Unsichere Authentifizierung",
        help:
          "Warnt, wenn der Server Passwort- oder Keyboard-Interactive-Login akzeptiert. Empfohlen ist ausschließlich Public-Key-Authentifizierung.",
      },
    ],
  },
  {
    title: "Verschlüsselung",
    description:
      "Schwache Algorithmen, die nicht mehr als sicher gelten.",
    items: [
      {
        key: "ssh_weak_cipher",
        label: "Schwache Ciphers",
        help:
          "Warnt, wenn der Server symmetrische Verschlüsselungsverfahren wie 3DES, RC4 oder CBC-Modi anbietet.",
      },
      {
        key: "ssh_weak_kex",
        label: "Schwache Key Exchange",
        help:
          "Warnt bei veralteten Schlüsselaustauschverfahren wie diffie-hellman-group1-sha1 oder MD5-basierten Varianten.",
      },
    ],
  },
  {
    title: "Änderungsüberwachung",
    description:
      "Erkennt Verschlechterungen der SSH-Konfiguration zwischen zwei Scans.",
    items: [
      {
        key: "ssh_config_regression",
        label: "Configuration Regression",
        help:
          "Warnt, wenn ein Host gegenüber dem letzten Scan eine schwächere Konfiguration zeigt — z. B. ein neu erlaubter schwacher Cipher oder eine herabgestufte SSH-Version.",
      },
    ],
  },
];

function SshAlertDefaultsPage() {
  const { data, isLoading, error, refetch } = useSSHAlertDefaults();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <KeyRound className="h-6 w-6 text-primary" aria-hidden />
        <div>
          <h1 className="text-2xl font-strong text-foreground">
            SSH Alert Defaults
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Globale Vorgaben für SSH-Sicherheits-Alerts. Greifen für jedes
            Netzwerk, das in seinem Alert-Profil keinen eigenen Wert setzt.
          </p>
        </div>
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
          Kein Netzwerk überschreibt aktuell die SSH-Defaults. Alle Netze
          verwenden die Werte unten.
        </p>
      </div>
    );
  }

  const handleConfirm = () => {
    applyAll.mutate(undefined, {
      onSuccess: (res) => {
        toast.success(
          res.cleared_count === 1
            ? "1 Netzwerk zurückgesetzt"
            : `${res.cleared_count} Netzwerke zurückgesetzt`,
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
            {count === 1 ? "Netzwerk überschreibt" : "Netzwerke überschreiben"}{" "}
            diese Defaults.{" "}
            <Link
              to="/networks"
              search={{ filter: "ssh-override" }}
              className="text-primary underline-offset-2 hover:underline"
            >
              Zu den betroffenen Netzwerken →
            </Link>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Mit „Auf alle anwenden" werden die SSH-Schlüssel aus jedem
            Alert-Profil entfernt; andere Einstellungen wie E-Mail-Empfänger
            bleiben erhalten.
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
          Auf alle anwenden
        </Button>
      </div>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => !open && setConfirmOpen(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>SSH-Overrides entfernen?</AlertDialogTitle>
            <AlertDialogDescription>
              Aus {count}{" "}
              {count === 1 ? "Netzwerk" : "Netzwerken"} werden die SSH-Keys aus
              dem Alert-Profil entfernt. Danach gelten überall die globalen
              Defaults. E-Mail-Empfänger und andere Einstellungen bleiben
              unverändert. Aktion ist nicht rückgängig zu machen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={applyAll.isPending}>
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              disabled={applyAll.isPending}
            >
              {applyAll.isPending ? "Wird angewendet..." : "Ja, anwenden"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
        onSuccess: () => toast.success("SSH-Default aktualisiert"),
        onError: (e) => {
          toast.error(e.message);
          setForm(form); // revert
        },
      },
    );
  };

  const validateVersion = (value: string): boolean => {
    if (!VERSION_REGEX.test(value)) {
      setVersionError(
        "Format z. B. 8.0 oder 8.0.0 — nur Ziffern und Punkte erlaubt.",
      );
      return false;
    }
    setVersionError(null);
    return true;
  };

  const handleVersionChange = (value: string) => {
    setVersionDraft(value);
    if (versionError) validateVersion(value);
  };

  const handleVersionSave = () => {
    if (!validateVersion(versionDraft)) return;
    if (versionDraft === form.ssh_version_threshold) return;
    mutation.mutate(
      { ssh_version_threshold: versionDraft },
      {
        onSuccess: () => {
          setForm({ ...form, ssh_version_threshold: versionDraft });
          toast.success("SSH-Mindestversion aktualisiert");
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
          <CardTitle className="text-sm">OpenSSH-Version</CardTitle>
          <CardDescription className="text-xs">
            Mindest-Version, unter der ein Alert ausgelöst wird.{" "}
            <span className="text-yellow-400">
              Gilt nur für OpenSSH-Server.
            </span>{" "}
            Dropbear, libssh und andere Implementierungen werden nicht
            versionsgeprüft.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ToggleRow
            item={{
              key: "ssh_outdated_version",
              label: "Veraltete OpenSSH-Version melden",
              help:
                "Wenn aktiv, wird ein Alert erzeugt sobald die OpenSSH-Version unter dem unten gesetzten Mindestwert liegt.",
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
              Mindest-Version (nur OpenSSH)
            </Label>
            <div className="mt-2 flex items-start gap-2">
              <div className="flex-1">
                <Input
                  id="ssh-min-version"
                  type="text"
                  value={versionDraft}
                  onChange={(e) => handleVersionChange(e.target.value)}
                  onBlur={() => validateVersion(versionDraft)}
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
                    Beispiel: <code className="font-mono">9.6</code> oder{" "}
                    <code className="font-mono">9.6.1</code>
                  </p>
                )}
              </div>
              <Button
                size="sm"
                onClick={handleVersionSave}
                disabled={
                  mutation.isPending ||
                  versionError !== null ||
                  versionDraft === form.ssh_version_threshold
                }
                className="gap-1.5"
              >
                <Save className="h-3.5 w-3.5" />
                Speichern
              </Button>
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
    </div>
  );
}
