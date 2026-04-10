import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod/v4";
import { toast } from "sonner";
import cronstrue from "cronstrue";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useNetworkMutations } from "@/features/networks/hooks/useNetworkDetail";
import { useScanners } from "@/features/dashboard/hooks/useDashboardData";
import { useNseProfiles } from "@/features/nse/hooks/useNse";
import {
  useLibraryEntries,
  useScannerMirror,
} from "@/features/gvm-library/hooks/useGvmLibrary";
import { computeScanEstimate } from "@/lib/scan-estimate";
import type { GvmKind, Network, ScanPhase } from "@/lib/types";
import { PhaseCards } from "./PhaseCards";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  cidr: z.string().min(1, "CIDR is required"),
  port_spec: z.string().min(1, "Port spec is required"),
  scanner_id: z.coerce.number().min(1, "Scanner is required"),
  scanner_type: z.enum(["masscan", "nmap", "greenbone"]),
  scan_protocol: z.enum(["tcp", "udp", "both"]),
  scan_rate: z.coerce.number().optional(),
  scan_timeout: z.preprocess(
    (val) =>
      val === "" || val === undefined || val === null ? undefined : Number(val),
    z.number().min(60).max(86400).optional(),
  ),
  port_timeout: z.preprocess(
    (val) =>
      val === "" || val === undefined || val === null ? undefined : Number(val),
    z.number().min(100).max(30000).optional(),
  ),
  scan_schedule: z.string().optional(),
  nse_profile_id: z.preprocess(
    (val) =>
      val === "" || val === undefined || val === null ? undefined : Number(val),
    z.number().optional(),
  ),
  email_recipients: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

const RATE_PRESETS = [
  { label: "Slow", value: 100, desc: "Safe for production" },
  { label: "Normal", value: 1000, desc: "Balanced" },
  { label: "Fast", value: 10000, desc: "Aggressive" },
  { label: "Max", value: 100000, desc: "Lab/isolated only" },
];

const SCHEDULE_PRESETS = [
  { label: "Hourly", value: "0 * * * *" },
  { label: "Daily 2am", value: "0 2 * * *" },
  { label: "Weekly", value: "0 2 * * 1" },
  { label: "Monthly", value: "0 2 1 * *" },
];

interface NetworkFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  network?: Network;
}

interface GvmDropdownOptions {
  library: string[];
  scanner: string[];
}

function buildGvmDropdownOptions(
  _kind: GvmKind,
  libraryEntries: ReadonlyArray<{ name: string }>,
  mirrorEntries: ReadonlyArray<{ name: string }>,
): GvmDropdownOptions {
  const library = [...libraryEntries].map((e) => e.name).sort();
  const librarySet = new Set(library);
  const scanner = [...mirrorEntries]
    .map((e) => e.name)
    .filter((name) => !librarySet.has(name))
    .sort();
  return { library, scanner };
}

export function NetworkForm({ open, onOpenChange, network }: NetworkFormProps) {
  const { create, update } = useNetworkMutations();
  const scanners = useScanners();
  const profiles = useNseProfiles();
  const isEdit = Boolean(network);
  const [phases, setPhases] = useState<ScanPhase[] | null>(
    network?.phases ?? null,
  );
  const [gvmScanConfig, setGvmScanConfig] = useState<string>(
    network?.gvm_scan_config ?? "Full and fast",
  );
  const [gvmPortList, setGvmPortList] = useState<string>(
    network?.gvm_port_list ?? "",
  );

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: network
      ? {
          name: network.name,
          cidr: network.cidr,
          port_spec: network.port_spec,
          scanner_id: network.scanner_id,
          scanner_type: network.scanner_type as "masscan" | "nmap" | "greenbone",
          scan_protocol: network.scan_protocol as "tcp" | "udp" | "both",
          scan_rate: network.scan_rate ?? undefined,
          scan_timeout: network.scan_timeout ?? undefined,
          port_timeout: network.port_timeout ?? undefined,
          scan_schedule: network.scan_schedule ?? undefined,
          nse_profile_id: network.nse_profile_id ?? undefined,
          email_recipients: (
            network.alert_config as Record<string, unknown> | null
          )?.email_recipients
            ? String(
                (network.alert_config as Record<string, unknown>)
                  .email_recipients,
              )
            : "",
        }
      : {
          scanner_type: "masscan",
          scan_protocol: "tcp",
          port_spec: "1-65535",
          scan_rate: 1000,
          scan_timeout: 3600,
          port_timeout: 1500,
        },
  });

  const watchedCidr = useWatch({ control, name: "cidr" }) ?? "";
  const watchedPortSpec = useWatch({ control, name: "port_spec" }) ?? "";
  const watchedRate = useWatch({ control, name: "scan_rate" }) ?? 1000;
  const watchedSchedule = useWatch({ control, name: "scan_schedule" }) ?? "";
  const watchedNseProfileId = useWatch({ control, name: "nse_profile_id" });
  const watchedScannerType = useWatch({ control, name: "scanner_type" });
  const watchedScannerId = Number(useWatch({ control, name: "scanner_id" }) ?? 0);
  const isGreenbone = watchedScannerType === "greenbone";

  // Populate GVM dropdowns: union of library entries + assigned scanner's mirror
  const libraryScanConfigs = useLibraryEntries(
    isGreenbone ? "scan_config" : undefined,
  );
  const libraryPortLists = useLibraryEntries(
    isGreenbone ? "port_list" : undefined,
  );
  const scannerMirrorConfigs = useScannerMirror(
    watchedScannerId,
    "scan_config",
    { enabled: isGreenbone && watchedScannerId > 0 },
  );
  const scannerMirrorPortLists = useScannerMirror(
    watchedScannerId,
    "port_list",
    { enabled: isGreenbone && watchedScannerId > 0 },
  );

  const gvmScanConfigOptions = buildGvmDropdownOptions(
    "scan_config",
    libraryScanConfigs.data?.entries ?? [],
    scannerMirrorConfigs.data?.entries ?? [],
  );
  const gvmPortListOptions = buildGvmDropdownOptions(
    "port_list",
    libraryPortLists.data?.entries ?? [],
    scannerMirrorPortLists.data?.entries ?? [],
  );

  const vulnEnabled = (phases ?? []).some(
    (p) => p.name === "vulnerability" && p.enabled,
  );
  const nseProfileMissing = vulnEnabled && !watchedNseProfileId;

  const estimate = computeScanEstimate(
    watchedCidr,
    watchedPortSpec,
    watchedRate,
  );

  let cronHuman = "";
  try {
    if (watchedSchedule.trim()) {
      cronHuman = cronstrue.toString(watchedSchedule);
    }
  } catch {
    cronHuman = "";
  }

  const onSubmit = (data: FormData) => {
    const { email_recipients, ...rest } = data;
    const payload: Record<string, unknown> = {
      ...rest,
      phases: isGreenbone ? null : phases,
      gvm_scan_config: isGreenbone ? gvmScanConfig : null,
      gvm_port_list: isGreenbone && gvmPortList ? gvmPortList : null,
    };

    // Build alert_config with email_recipients if provided
    if (email_recipients?.trim()) {
      const recipients = email_recipients
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean);
      const existingConfig =
        (network?.alert_config as Record<string, unknown> | null) ?? {};
      payload.alert_config = {
        ...existingConfig,
        email_recipients: recipients,
      };
    } else if (isEdit && network?.alert_config) {
      // Clear email_recipients but keep other alert_config settings
      const existing = { ...(network.alert_config as Record<string, unknown>) };
      delete existing.email_recipients;
      payload.alert_config = Object.keys(existing).length > 0 ? existing : null;
    }

    if (isEdit && network) {
      update.mutate(
        { id: network.id, ...(payload as Partial<Network>) },
        {
          onSuccess: () => {
            toast.success("Network updated");
            onOpenChange(false);
          },
          onError: (e) => toast.error(e.message),
        },
      );
    } else {
      create.mutate(payload as Partial<Network>, {
        onSuccess: () => {
          toast.success("Network created");
          onOpenChange(false);
          reset();
        },
        onError: (e) => toast.error(e.message),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Network" : "Add Network"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 py-2">
          {/* ── Network Identity ── */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-strong uppercase tracking-wider text-muted-foreground">
              Network
            </legend>
            <div className="grid grid-cols-[1fr_1fr] gap-3">
              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  {...register("name")}
                  placeholder="Internal LAN"
                />
                {errors.name && (
                  <p className="mt-1 text-xs text-destructive">
                    {errors.name.message}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="cidr">CIDR</Label>
                <Input
                  id="cidr"
                  {...register("cidr")}
                  placeholder="192.168.1.0/24"
                  className="font-mono"
                />
                {errors.cidr && (
                  <p className="mt-1 text-xs text-destructive">
                    {errors.cidr.message}
                  </p>
                )}
              </div>
            </div>
            <div>
              <div className="flex items-baseline justify-between">
                <Label htmlFor="port_spec">Port Specification</Label>
                {isGreenbone && gvmPortList && (
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Ignored — GVM Port List active
                  </span>
                )}
              </div>
              <Input
                id="port_spec"
                {...register("port_spec")}
                placeholder="1-65535"
                className={`font-mono ${
                  isGreenbone && gvmPortList
                    ? "opacity-50"
                    : ""
                }`}
              />
              {errors.port_spec && (
                <p className="mt-1 text-xs text-destructive">
                  {errors.port_spec.message}
                </p>
              )}
              {isGreenbone && gvmPortList ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Not used for this scan — ports come from GVM Port List{" "}
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                    {gvmPortList}
                  </code>
                  . Clear the port list dropdown below to use this field
                  instead.
                </p>
              ) : isGreenbone ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Active: the scanner will use these ports directly (no GVM
                  Port List selected).
                </p>
              ) : null}
            </div>
          </fieldset>

          <hr className="border-border/40" />

          {/* ── Scanner Configuration ── */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-strong uppercase tracking-wider text-muted-foreground">
              Scanner
            </legend>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="scanner_id">Scanner</Label>
                <Select id="scanner_id" {...register("scanner_id")}>
                  <option value="">Select scanner...</option>
                  {(scanners.data?.scanners ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
                {errors.scanner_id && (
                  <p className="mt-1 text-xs text-destructive">
                    {errors.scanner_id.message}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="scanner_type">Type</Label>
                <Select id="scanner_type" {...register("scanner_type")}>
                  <option value="masscan">Masscan</option>
                  <option value="nmap">Nmap</option>
                  <option value="greenbone">Greenbone (GVM)</option>
                </Select>
              </div>
              {isGreenbone && (
                <div>
                  <Label htmlFor="gvm_scan_config">GVM Scan Config</Label>
                  <Select
                    id="gvm_scan_config"
                    value={gvmScanConfig}
                    onChange={(e) => setGvmScanConfig(e.target.value)}
                  >
                    {gvmScanConfigOptions.library.length > 0 && (
                      <optgroup label="Library">
                        {gvmScanConfigOptions.library.map((name) => (
                          <option key={`lib-${name}`} value={name}>
                            {name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {gvmScanConfigOptions.scanner.length > 0 && (
                      <optgroup label="Scanner Built-in / Live">
                        {gvmScanConfigOptions.scanner.map((name) => (
                          <option key={`scn-${name}`} value={name}>
                            {name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {gvmScanConfigOptions.library.length === 0 &&
                      gvmScanConfigOptions.scanner.length === 0 && (
                        <>
                          <option value="Full and fast">Full and fast</option>
                          <option value="Full and deep">Full and deep</option>
                          <option value="Discovery">Discovery</option>
                          <option value="System Discovery">
                            System Discovery
                          </option>
                        </>
                      )}
                  </Select>
                </div>
              )}
              <div>
                <Label htmlFor="scan_protocol">Protocol</Label>
                <Select id="scan_protocol" {...register("scan_protocol")}>
                  <option value="tcp">TCP</option>
                  <option value="udp">UDP</option>
                  <option value="both">Both</option>
                </Select>
              </div>
            </div>
            {isGreenbone && (
              <div>
                <Label htmlFor="gvm_port_list">GVM Port List (optional)</Label>
                <Select
                  id="gvm_port_list"
                  value={gvmPortList}
                  onChange={(e) => setGvmPortList(e.target.value)}
                >
                  <option value="">
                    (use custom port range from field above)
                  </option>
                  {gvmPortListOptions.library.length > 0 && (
                    <optgroup label="Library">
                      {gvmPortListOptions.library.map((name) => (
                        <option key={`lib-${name}`} value={name}>
                          {name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {gvmPortListOptions.scanner.length > 0 && (
                    <optgroup label="Scanner Built-in / Live">
                      {gvmPortListOptions.scanner.map((name) => (
                        <option key={`scn-${name}`} value={name}>
                          {name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </Select>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {gvmPortList ? (
                    <>
                      <span className="text-foreground/80 font-emphasis">
                        Active:
                      </span>{" "}
                      scanner will pass <code>port_list_id</code> to GVM. The
                      Port Specification above is ignored.
                    </>
                  ) : (
                    <>
                      Leave empty to use the raw Port Specification field at
                      the top of the form. Pick a GVM port list to override.
                    </>
                  )}
                </p>
              </div>
            )}
            {!isGreenbone && (<>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="scan_rate">Rate (pps)</Label>
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
                      onClick={() => setValue("scan_rate", p.value)}
                      className={`cursor-pointer rounded px-1.5 py-0.5 text-[10px] transition-colors ${
                        watchedRate === p.value
                          ? "bg-primary text-primary-foreground"
                          : "bg-accent text-muted-foreground hover:text-foreground"
                      }`}
                      title={p.desc}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label htmlFor="scan_timeout">Scan Timeout (s)</Label>
                <Input
                  id="scan_timeout"
                  type="number"
                  {...register("scan_timeout")}
                  placeholder="3600"
                />
                {errors.scan_timeout && (
                  <p className="mt-1 text-xs text-destructive">
                    {errors.scan_timeout.message}
                  </p>
                )}
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  60 – 86 400
                </p>
              </div>
              <div>
                <Label htmlFor="port_timeout">Port Timeout (ms)</Label>
                <Input
                  id="port_timeout"
                  type="number"
                  {...register("port_timeout")}
                  placeholder="1500"
                />
                {errors.port_timeout && (
                  <p className="mt-1 text-xs text-destructive">
                    {errors.port_timeout.message}
                  </p>
                )}
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  100 – 30 000
                </p>
              </div>
            </div>
            {estimate.ips > 0 && estimate.ports > 0 && watchedRate > 0 && (
              <div
                className="rounded-md border border-border/50 bg-muted/30 px-3 py-2"
                title={estimate.tooltip}
              >
                <p className="text-xs text-muted-foreground">
                  Est. Runtime:{" "}
                  <span className={`font-emphasis ${estimate.color}`}>
                    {estimate.display}
                  </span>
                  <span className="ml-2 text-[10px]">
                    ({estimate.ips.toLocaleString()} IPs &times;{" "}
                    {estimate.ports.toLocaleString()} ports)
                  </span>
                </p>
              </div>
            )}
            </>)}
          </fieldset>

          {!isGreenbone && (<>
          <hr className="border-border/40" />

          {/* ── Scan Phases & NSE ── */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-strong uppercase tracking-wider text-muted-foreground">
              Phases
            </legend>
            <PhaseCards phases={phases} onChange={setPhases} />
            <div
              className={`rounded-md transition-colors ${
                nseProfileMissing
                  ? "border border-yellow-500/40 bg-yellow-500/5 p-3"
                  : ""
              }`}
            >
              <Label htmlFor="nse_profile_id">
                NSE Profile{vulnEnabled ? "" : " (optional)"}
              </Label>
              <Select id="nse_profile_id" {...register("nse_profile_id")}>
                <option value="">None</option>
                {(profiles.data?.profiles ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
              {nseProfileMissing && (
                <p className="mt-1.5 text-xs text-yellow-500">
                  Vulnerability phase is enabled — without a profile, only the
                  default <span className="font-mono text-[11px]">vulners</span>{" "}
                  script will run.
                </p>
              )}
            </div>
          </fieldset>
          </>)}

          <hr className="border-border/40" />

          {/* ── Schedule & Alerts ── */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-strong uppercase tracking-wider text-muted-foreground">
              Schedule &amp; Alerts
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="scan_schedule">Schedule (cron)</Label>
                <Input
                  id="scan_schedule"
                  {...register("scan_schedule")}
                  placeholder="0 2 * * *"
                  className="font-mono"
                />
                <div className="mt-1.5 flex gap-1">
                  {SCHEDULE_PRESETS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setValue("scan_schedule", p.value)}
                      className={`cursor-pointer rounded px-1.5 py-0.5 text-[10px] transition-colors ${
                        watchedSchedule === p.value
                          ? "bg-primary text-primary-foreground"
                          : "bg-accent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                {cronHuman && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {cronHuman}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="email_recipients">Alert Email Recipients</Label>
                <Input
                  id="email_recipients"
                  {...register("email_recipients")}
                  placeholder="admin@example.com, ..."
                />
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  Comma-separated emails
                </p>
              </div>
            </div>
          </fieldset>

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
              disabled={create.isPending || update.isPending}
            >
              {create.isPending || update.isPending
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
