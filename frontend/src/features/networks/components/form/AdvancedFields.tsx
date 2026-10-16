import { useEffect } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useNseProfiles } from "@/features/nse/hooks/useNse";
import { computeScanEstimate } from "@/lib/scan-estimate";
import { TOOL_LABELS } from "@/lib/terminology";
import type { ScanPhase } from "@/lib/types";
import { cn } from "@/lib/utils";
import { buildPortSpec } from "../../lib/portPresets";
import { GvmConfigSection } from "../GvmConfigSection";
import { NucleiSettings } from "../NucleiSettings";
import { PhaseCards } from "../PhaseCards";
import { ScheduleBuilder } from "../ScheduleBuilder";
import { SshAlertOverrides } from "../SshAlertOverrides";
import type { NetworkFormData } from "../networkFormSchema";

const RATE_PRESETS = [
  { label: "Slow", value: 100, desc: "Safe for production" },
  { label: "Normal", value: 1000, desc: "Balanced" },
  { label: "Fast", value: 10000, desc: "Aggressive" },
  { label: "Max", value: 100000, desc: "Lab/isolated only" },
];

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="space-y-3 rounded-lg border border-border p-4">
      <legend className="px-1 text-xs font-strong uppercase tracking-wider text-muted-foreground">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-destructive">{message}</p>;
}

interface AdvancedFieldsProps {
  phases: ScanPhase[] | null;
  onPhasesChange: (phases: ScanPhase[] | null) => void;
  gvmScanConfig: string;
  onGvmScanConfigChange: (value: string) => void;
  gvmPortList: string;
  onGvmPortListChange: (value: string) => void;
}

/**
 * Everything behind "Show advanced settings" (ADR 0011). Tool names are the
 * primary labels here (ADR 0010). Greenbone hides the port-scan knobs and
 * shows its own block instead, so invalid combinations cannot be picked.
 */
export function AdvancedFields({
  phases,
  onPhasesChange,
  gvmScanConfig,
  onGvmScanConfigChange,
  gvmPortList,
  onGvmPortListChange,
}: AdvancedFieldsProps) {
  const {
    register,
    setValue,
    control,
    formState: { errors },
  } = useFormContext<NetworkFormData>();
  const profiles = useNseProfiles();
  const [
    cidr,
    portPreset,
    customPorts,
    excludePorts,
    rate,
    scannerType,
    scannerId,
    nseProfileId,
    nucleiEnabled,
    scheduleMode,
    customSchedule,
  ] = useWatch({
    control,
    name: [
      "cidr",
      "port_preset",
      "port_spec",
      "exclude_ports",
      "scan_rate",
      "scanner_type",
      "scanner_id",
      "nse_profile_id",
      "nuclei_enabled",
      "schedule_mode",
      "scan_schedule",
    ],
  });
  const isGreenbone = scannerType === "greenbone";
  const watchedRate = Number(rate ?? 1000);

  const vulnEnabled = (phases ?? []).some(
    (p) => p.name === "vulnerability" && p.enabled,
  );
  const vulnersProfileId = (profiles.data?.profiles ?? []).find(
    (p) => p.name === "Vulners CVE Lookup",
  )?.id;

  // The NSE phase needs a profile: default to Vulners when it is switched on.
  useEffect(() => {
    if (vulnEnabled && !nseProfileId && vulnersProfileId) {
      setValue("nse_profile_id", vulnersProfileId);
    }
  }, [vulnEnabled, nseProfileId, vulnersProfileId, setValue]);

  const estimate = computeScanEstimate(
    cidr ?? "",
    buildPortSpec(portPreset ?? "all", customPorts ?? "", excludePorts ?? ""),
    watchedRate,
  );

  return (
    <div className="space-y-4">
      <Section title="Scan engine">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="scanner_type">Engine</Label>
            <Select id="scanner_type" {...register("scanner_type")}>
              <option value="masscan">masscan — {TOOL_LABELS.masscan}</option>
              <option value="nmap">nmap — {TOOL_LABELS.nmap}</option>
              <option value="greenbone">Greenbone (GVM) — {TOOL_LABELS.gvm}</option>
            </Select>
          </div>
          {!isGreenbone && (
            <div>
              <Label htmlFor="scan_protocol">Protocol</Label>
              <Select id="scan_protocol" {...register("scan_protocol")}>
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
                <option value="both">TCP + UDP</option>
              </Select>
            </div>
          )}
        </div>

        {isGreenbone && (
          <GvmConfigSection
            scannerId={Number(scannerId ?? 0)}
            scanConfig={gvmScanConfig}
            onScanConfigChange={onGvmScanConfigChange}
            portList={gvmPortList}
            onPortListChange={onGvmPortListChange}
          />
        )}

        <div>
          <Label htmlFor="exclude_ports">Exclude ports</Label>
          <Input
            id="exclude_ports"
            {...register("exclude_ports")}
            placeholder="e.g. 9100,8000-8100"
            className="font-mono"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Never scan these ports. Stored as <code>!port</code> entries in the
            port list.
          </p>
          <FieldError message={errors.exclude_ports?.message} />
        </div>

        {!isGreenbone && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="scan_rate">Rate (packets/s)</Label>
                <Input
                  id="scan_rate"
                  type="number"
                  {...register("scan_rate")}
                  placeholder="1000"
                />
                <div className="mt-1.5 flex gap-1">
                  {RATE_PRESETS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() =>
                        setValue("scan_rate", p.value, { shouldDirty: true })
                      }
                      className={cn(
                        "cursor-pointer rounded px-1.5 py-0.5 text-[10px] transition-colors",
                        watchedRate === p.value
                          ? "bg-primary text-primary-foreground"
                          : "bg-surface-2 text-text-quaternary hover:text-text-secondary",
                      )}
                      title={p.desc}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label htmlFor="scan_timeout">Scan timeout (min)</Label>
                <Input
                  id="scan_timeout"
                  type="number"
                  {...register("scan_timeout")}
                  placeholder="60"
                />
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  1 – 1 440
                </p>
                <FieldError message={errors.scan_timeout?.message} />
              </div>
              <div>
                <Label htmlFor="port_timeout">Port timeout (ms)</Label>
                <Input
                  id="port_timeout"
                  type="number"
                  {...register("port_timeout")}
                  placeholder="1500"
                />
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  100 – 30 000
                </p>
                <FieldError message={errors.port_timeout?.message} />
              </div>
            </div>
            {estimate.ips > 0 && estimate.ports > 0 && watchedRate > 0 && (
              <p
                className="text-xs text-muted-foreground"
                title={estimate.tooltip}
              >
                Estimated runtime:{" "}
                <span className={cn("font-emphasis", estimate.color)}>
                  {estimate.display}
                </span>{" "}
                ({estimate.ips.toLocaleString()} addresses ×{" "}
                {estimate.ports.toLocaleString()} ports)
              </p>
            )}
          </>
        )}
      </Section>

      {!isGreenbone && (
        <Section title="Phases">
          <PhaseCards
            phases={phases}
            onChange={onPhasesChange}
            scannerType={scannerType}
          />
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-border bg-background"
              {...register("host_discovery_enabled")}
            />
            <span>
              Run host discovery after the first scan
              <span className="block text-xs text-muted-foreground">
                Once the first scan completes and no host discovery has run
                yet, a ping sweep fills the host list.
              </span>
            </span>
          </label>
          <div>
            <Label htmlFor="nse_profile_id">
              NSE profile — {TOOL_LABELS.nse}
            </Label>
            {/* Controlled: profiles load after the form mounts. */}
            <Select
              id="nse_profile_id"
              {...register("nse_profile_id")}
              value={nseProfileId ? String(nseProfileId) : ""}
            >
              <option value="">None</option>
              {(profiles.data?.profiles ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              Used when the {TOOL_LABELS.nse} phase is on; switching that phase
              on picks <span className="font-mono">Vulners CVE Lookup</span>{" "}
              if none is set.
            </p>
          </div>
          {nucleiEnabled && <NucleiSettings enabled showToggle={false} />}
        </Section>
      )}

      {!isGreenbone && (
        <Section title={TOOL_LABELS.ssh}>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-border bg-background"
              {...register("ssh_probe_enabled")}
            />
            <span>
              Check SSH services (ssh-audit)
              <span className="block text-xs text-muted-foreground">
                Runs ssh-audit and nmap ssh-auth-methods on discovered SSH
                ports. Off = no SSH findings and no SSH alerts for this
                network.
              </span>
            </span>
          </label>
          <SshAlertOverrides />
        </Section>
      )}

      <Section title="Alerts">
        <div>
          <Label htmlFor="email_recipients">Alert email recipients</Label>
          <Input
            id="email_recipients"
            {...register("email_recipients")}
            placeholder="admin@example.com, …"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Comma-separated. Empty = the global recipients.
          </p>
        </div>
      </Section>

      {scheduleMode === "custom" && (
        <Section title="Custom schedule">
          <ScheduleBuilder
            value={customSchedule ?? ""}
            onChange={(v) => setValue("scan_schedule", v, { shouldDirty: true })}
          />
        </Section>
      )}
    </div>
  );
}
