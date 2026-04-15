import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Network } from "@/lib/types";

export interface PhasePillsProps {
  network: Network;
  onToggle: (patch: Partial<Network>) => void;
  disabled?: boolean;
}

const IS_GREENBONE = (n: Network) => n.scanner_type === "greenbone";
const IS_NSE = (n: Network) => n.scanner_type === "nse";
const IS_PORT_SCAN = (n: Network) =>
  n.scanner_type === "masscan" || n.scanner_type === "nmap";

export function PhasePills({ network, onToggle, disabled }: PhasePillsProps) {
  const pills: PillSpec[] = [];

  // Scanner-type pill (read-only; identifies the core tool).
  if (IS_GREENBONE(network)) {
    pills.push({ label: "Greenbone", active: true, readOnly: true });
  } else if (IS_NSE(network)) {
    pills.push({ label: "NSE", active: true, readOnly: true });
  } else if (IS_PORT_SCAN(network)) {
    pills.push({
      label: network.scanner_type === "masscan" ? "Masscan" : "Nmap",
      active: true,
      readOnly: true,
    });
  }

  // Host discovery — orthogonal to scanner type, applies everywhere.
  pills.push({
    label: "Host discovery",
    active: network.host_discovery_enabled,
    onToggle: () =>
      onToggle({ host_discovery_enabled: !network.host_discovery_enabled }),
  });

  // SSH probe + Nuclei are only meaningful on masscan/nmap pipelines.
  if (IS_PORT_SCAN(network)) {
    pills.push({
      label: "SSH probe",
      active: network.ssh_probe_enabled,
      onToggle: () =>
        onToggle({ ssh_probe_enabled: !network.ssh_probe_enabled }),
    });
    pills.push({
      label: "Nuclei",
      active: network.nuclei_enabled,
      onToggle: () => onToggle({ nuclei_enabled: !network.nuclei_enabled }),
    });
    // NSE post-phase is driven by a profile selection (nse_profile_id); the
    // pill is read-only here — clearing it from a pill would silently drop
    // the user's profile choice.
    pills.push({
      label: "NSE",
      active: network.nse_profile_id != null,
      readOnly: true,
      readOnlyHint:
        network.nse_profile_id == null
          ? "No NSE profile attached — set one on the network form."
          : "NSE profile set — change on the network form to remove.",
    });
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {pills.map((p) => (
        <Pill key={p.label} pill={p} disabled={disabled} />
      ))}
    </div>
  );
}

interface PillSpec {
  label: string;
  active: boolean;
  readOnly?: boolean;
  readOnlyHint?: string;
  onToggle?: () => void;
}

function Pill({ pill, disabled }: { pill: PillSpec; disabled?: boolean }) {
  const base =
    "cursor-default select-none transition-colors border px-2 py-0.5 text-[11px] h-5";
  const activeCls =
    "bg-primary/15 text-primary border-primary/30";
  const inactiveCls =
    "bg-transparent text-muted-foreground border-border/40";

  if (pill.readOnly || !pill.onToggle) {
    return (
      <Badge
        variant="outline"
        className={cn(
          base,
          pill.active ? activeCls : inactiveCls,
          "opacity-90",
        )}
        title={pill.readOnlyHint}
      >
        {pill.label}
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className={cn(
        base,
        pill.active ? activeCls : inactiveCls,
        disabled
          ? "cursor-not-allowed opacity-50"
          : "cursor-pointer hover:bg-muted/40",
      )}
      render={(props) => (
        <button
          {...props}
          type="button"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            if (disabled) return;
            try {
              pill.onToggle?.();
            } catch (err) {
              toast.error(
                err instanceof Error ? err.message : "Failed to toggle phase",
              );
            }
          }}
          aria-pressed={pill.active}
          aria-label={`${pill.label}: ${pill.active ? "enabled" : "disabled"}. Click to toggle.`}
        />
      )}
    >
      {pill.label}
    </Badge>
  );
}
