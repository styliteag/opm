import { useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { ChevronDown, ChevronRight, KeyRound } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  useSSHAlertDefaults,
  type SSHAlertDefaults,
} from "@/features/admin/hooks/useAdmin";
import type { NetworkFormData } from "./networkFormSchema";

interface SshOverrideToggle {
  field:
    | "ssh_override_insecure_auth"
    | "ssh_override_weak_cipher"
    | "ssh_override_weak_kex"
    | "ssh_override_outdated_version"
    | "ssh_override_config_regression";
  defaultsKey: keyof Omit<SSHAlertDefaults, "ssh_version_threshold">;
  label: string;
  help: string;
}

const TOGGLES: SshOverrideToggle[] = [
  {
    field: "ssh_override_insecure_auth",
    defaultsKey: "ssh_insecure_auth",
    label: "Insecure Authentication",
    help: "Password / keyboard-interactive allowed.",
  },
  {
    field: "ssh_override_weak_cipher",
    defaultsKey: "ssh_weak_cipher",
    label: "Weak Ciphers",
    help: "3DES, RC4, CBC modes, etc.",
  },
  {
    field: "ssh_override_weak_kex",
    defaultsKey: "ssh_weak_kex",
    label: "Weak Key Exchange",
    help: "diffie-hellman-group1-sha1 and similar.",
  },
  {
    field: "ssh_override_outdated_version",
    defaultsKey: "ssh_outdated_version",
    label: "Outdated OpenSSH Version",
    help: "Checked against the minimum version below.",
  },
  {
    field: "ssh_override_config_regression",
    defaultsKey: "ssh_config_regression",
    label: "Configuration Regression",
    help: "Degradation compared to the last scan.",
  },
];

/**
 * Per-network override UI for SSH alert defaults. Each toggle is tri-state:
 * "Inherit" (key absent in alert_config) / "Force On" / "Force Off". The
 * version threshold field is empty to inherit, otherwise must be a valid
 * OpenSSH version string.
 *
 * Loads the global defaults via `useSSHAlertDefaults()` so each row can show
 * the inherited value inline. Defaults are admin-only — for non-admin users
 * the query may 403; in that case the inherited values fall back to the
 * runtime defaults shipped in the schema.
 */
export function SshAlertOverrides() {
  const { register, control } = useFormContext<NetworkFormData>();
  const { data: defaults } = useSSHAlertDefaults();
  const [open, setOpen] = useState(false);

  // Auto-open the section when any field already holds a non-default value,
  // so editing an existing override doesn't hide it behind a collapsed header.
  const overrides = useWatch({
    control,
    name: [
      "ssh_override_insecure_auth",
      "ssh_override_weak_cipher",
      "ssh_override_weak_kex",
      "ssh_override_outdated_version",
      "ssh_override_config_regression",
      "ssh_override_version_threshold",
    ],
  });

  const hasAnyOverride = overrides.some(
    (v, idx) => (idx === 5 ? Boolean(v) : v && v !== "inherit"),
  );
  const expanded = open || hasAnyOverride;

  return (
    <div className="rounded-md border border-border/40 bg-card/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-emphasis hover:bg-accent/30"
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <KeyRound className="h-4 w-4 text-primary" />
        <span>SSH Alert Overrides</span>
        {hasAnyOverride && (
          <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-emphasis text-primary">
            active
          </span>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground">
          {expanded ? "" : "Global SSH defaults apply"}
        </span>
      </button>

      {expanded && (
        <div className="space-y-2 border-t border-border/40 p-3">
          <p className="text-[11px] text-muted-foreground">
            Per toggle: <em>Inherit</em> = global default applies,{" "}
            <em>On</em>/<em>Off</em> forces a network-specific value.
            These settings override the SSH Alert Defaults for{" "}
            <strong>this</strong> network.
          </p>
          <div className="space-y-2">
            {TOGGLES.map((toggle) => {
              const inherited = defaults?.[toggle.defaultsKey];
              return (
                <div
                  key={toggle.field}
                  className="grid grid-cols-[1fr_auto] items-start gap-3 rounded bg-accent/30 px-3 py-2"
                >
                  <div>
                    <Label
                      htmlFor={toggle.field}
                      className="text-sm font-normal text-foreground"
                    >
                      {toggle.label}
                    </Label>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {toggle.help}
                    </p>
                  </div>
                  <Select
                    id={toggle.field}
                    {...register(toggle.field)}
                    className="w-44"
                  >
                    <option value="inherit">
                      Inherit{" "}
                      {inherited !== undefined &&
                        `(global: ${inherited ? "On" : "Off"})`}
                    </option>
                    <option value="on">Force: On</option>
                    <option value="off">Force: Off</option>
                  </Select>
                </div>
              );
            })}
          </div>

          <div className="rounded bg-accent/30 px-3 py-2">
            <Label
              htmlFor="ssh_override_version_threshold"
              className="text-sm font-normal text-foreground"
            >
              OpenSSH Minimum Version (Override)
            </Label>
            <div className="mt-1 flex items-center gap-2">
              <Input
                id="ssh_override_version_threshold"
                type="text"
                {...register("ssh_override_version_threshold")}
                placeholder={
                  defaults
                    ? `Inherit (global: ${defaults.ssh_version_threshold})`
                    : "Inherit (leave empty)"
                }
                className="w-48 font-mono"
              />
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Leave empty = global default. OpenSSH only; Dropbear / libssh
              are not version-checked.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
