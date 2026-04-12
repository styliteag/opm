import { useEffect, useState } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { computeScanEstimate } from "@/lib/scan-estimate";
import type { Network, ScanPhase } from "@/lib/types";
import { GvmConfigSection } from "./GvmConfigSection";
import { NucleiSettings } from "./NucleiSettings";
import { PhaseCards } from "./PhaseCards";
import { SshAlertOverrides } from "./SshAlertOverrides";
import {
  networkFormSchema,
  type NetworkFormData,
  type SshOverrideValue,
} from "./networkFormSchema";

/**
 * Map an existing alert_config blob to the SSH override form fields. Boolean
 * keys missing from the blob become "inherit". The version threshold maps to
 * an empty string (= inherit) when absent.
 */
function readSshOverrides(
  alertConfig: Record<string, unknown> | null | undefined,
): {
  ssh_override_insecure_auth: SshOverrideValue;
  ssh_override_weak_cipher: SshOverrideValue;
  ssh_override_weak_kex: SshOverrideValue;
  ssh_override_outdated_version: SshOverrideValue;
  ssh_override_config_regression: SshOverrideValue;
  ssh_override_version_threshold: string;
} {
  const tri = (key: string): SshOverrideValue => {
    const v = alertConfig?.[key];
    if (v === true) return "on";
    if (v === false) return "off";
    return "inherit";
  };
  const threshold = alertConfig?.ssh_version_threshold;
  return {
    ssh_override_insecure_auth: tri("ssh_insecure_auth"),
    ssh_override_weak_cipher: tri("ssh_weak_cipher"),
    ssh_override_weak_kex: tri("ssh_weak_kex"),
    ssh_override_outdated_version: tri("ssh_outdated_version"),
    ssh_override_config_regression: tri("ssh_config_regression"),
    ssh_override_version_threshold:
      typeof threshold === "string" ? threshold : "",
  };
}

/**
 * Inverse of `readSshOverrides`. Builds the SSH-related slice of alert_config
 * from form values, omitting any field set to "inherit" / empty.
 */
function buildSshOverridesPayload(
  data: NetworkFormData,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const apply = (
    field: SshOverrideValue,
    key: string,
  ) => {
    if (field === "on") out[key] = true;
    else if (field === "off") out[key] = false;
  };
  apply(data.ssh_override_insecure_auth, "ssh_insecure_auth");
  apply(data.ssh_override_weak_cipher, "ssh_weak_cipher");
  apply(data.ssh_override_weak_kex, "ssh_weak_kex");
  apply(data.ssh_override_outdated_version, "ssh_outdated_version");
  apply(data.ssh_override_config_regression, "ssh_config_regression");
  if (data.ssh_override_version_threshold) {
    out.ssh_version_threshold = data.ssh_override_version_threshold;
  }
  return out;
}

const SSH_ALERT_CONFIG_KEYS = [
  "ssh_insecure_auth",
  "ssh_weak_cipher",
  "ssh_weak_kex",
  "ssh_outdated_version",
  "ssh_config_regression",
  "ssh_version_threshold",
] as const;

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
  /**
   * When set (and `network` is not), pre-fills the form with values from this
   * network so the user can create a copy. Stays in create mode — submission
   * goes through `create.mutate`, not `update`.
   */
  cloneSource?: Network;
}

export function NetworkForm({
  open,
  onOpenChange,
  network,
  cloneSource,
}: NetworkFormProps) {
  const { create, update } = useNetworkMutations();
  const scanners = useScanners();
  const profiles = useNseProfiles();
  const isEdit = Boolean(network);
  // Use the explicit edit target first; otherwise fall back to the clone
  // source so the form can pre-fill from another network without entering
  // edit mode.
  const source = network ?? cloneSource;
  const [phases, setPhases] = useState<ScanPhase[] | null>(
    source?.phases ?? null,
  );
  const [gvmScanConfig, setGvmScanConfig] = useState<string>(
    source?.gvm_scan_config ?? "Full and fast",
  );
  const [gvmPortList, setGvmPortList] = useState<string>(
    source?.gvm_port_list ?? "",
  );

  const formMethods = useForm<NetworkFormData>({
    resolver: zodResolver(networkFormSchema),
    defaultValues: source
      ? {
          name: cloneSource && !network ? `Copy of ${source.name}` : source.name,
          cidr: source.cidr,
          port_spec: source.port_spec,
          scanner_id: source.scanner_id,
          scanner_type: source.scanner_type as "masscan" | "nmap" | "greenbone",
          scan_protocol: source.scan_protocol as "tcp" | "udp" | "both",
          scan_rate: source.scan_rate ?? undefined,
          scan_timeout: source.scan_timeout ?? undefined,
          port_timeout: source.port_timeout ?? undefined,
          scan_schedule: source.scan_schedule ?? undefined,
          nse_profile_id: source.nse_profile_id ?? undefined,
          gvm_keep_reports: source.gvm_keep_reports ?? true,
          ssh_probe_enabled: source.ssh_probe_enabled ?? true,
          nuclei_enabled: source.nuclei_enabled ?? false,
          nuclei_tags: source.nuclei_tags || "cve,exposure,misconfig,tech",
          nuclei_exclude_tags: source.nuclei_exclude_tags || "fuzz,dos,intrusive",
          nuclei_severity:
            (source.nuclei_severity as
              | "info"
              | "low"
              | "medium"
              | "high"
              | "critical"
              | null) ?? undefined,
          nuclei_timeout: source.nuclei_timeout ?? undefined,
          nuclei_sni_enabled: source.nuclei_sni_enabled ?? false,
          email_recipients: (
            source.alert_config as Record<string, unknown> | null
          )?.email_recipients
            ? String(
                (source.alert_config as Record<string, unknown>)
                  .email_recipients,
              )
            : "",
          ...readSshOverrides(
            source.alert_config as Record<string, unknown> | null,
          ),
        }
      : {
          scanner_type: "masscan",
          scan_protocol: "tcp",
          port_spec: "1-65535",
          scan_rate: 1000,
          scan_timeout: 3600,
          port_timeout: 1500,
          gvm_keep_reports: true,
          ssh_probe_enabled: true,
          nuclei_enabled: false,
          nuclei_sni_enabled: false,
          ssh_override_insecure_auth: "inherit",
          ssh_override_weak_cipher: "inherit",
          ssh_override_weak_kex: "inherit",
          ssh_override_outdated_version: "inherit",
          ssh_override_config_regression: "inherit",
          ssh_override_version_threshold: "",
        },
  });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors },
  } = formMethods;

  const watchedCidr = useWatch({ control, name: "cidr" }) ?? "";
  const watchedPortSpec = useWatch({ control, name: "port_spec" }) ?? "";
  const watchedRate = useWatch({ control, name: "scan_rate" }) ?? 1000;
  const watchedSchedule = useWatch({ control, name: "scan_schedule" }) ?? "";
  const watchedNseProfileId = useWatch({ control, name: "nse_profile_id" });
  const watchedScannerType = useWatch({ control, name: "scanner_type" });
  const watchedScannerId = Number(useWatch({ control, name: "scanner_id" }) ?? 0);
  const watchedNucleiEnabled = useWatch({ control, name: "nuclei_enabled" }) ?? false;
  const isGreenbone = watchedScannerType === "greenbone";

  // Tab state — splits the form into General / Phases / Alerts so the dialog
  // fits in one viewport without scrolling. All tab panels stay in the DOM
  // (hidden attribute, not conditional mount) so react-hook-form keeps every
  // input registered across tab switches.
  type TabKey = "general" | "phases" | "alerts";
  const [activeTab, setActiveTab] = useState<TabKey>("general");
  // When switching to a Greenbone scanner the Phases tab is hidden, so treat
  // "phases" as "general" while greenbone is selected (derived, not state —
  // avoids a cascading render from a useEffect setState).
  const effectiveTab: TabKey =
    isGreenbone && activeTab === "phases" ? "general" : activeTab;

  // Auto-disable nuclei when the user switches scanner_type to greenbone
  // (nuclei is only supported for masscan/nmap). Toast once on the flip.
  useEffect(() => {
    if (isGreenbone && watchedNucleiEnabled) {
      setValue("nuclei_enabled", false, { shouldDirty: true });
      toast.info("Nuclei disabled — not supported for Greenbone scanners");
    }
  }, [isGreenbone, watchedNucleiEnabled, setValue]);


  // Map a field name to the tab that contains it, so we can auto-switch on
  // validation error. Fields not listed here live in "general".
  const fieldToTab: Record<string, TabKey> = {
    nse_profile_id: "phases",
    nuclei_enabled: "phases",
    nuclei_tags: "phases",
    nuclei_exclude_tags: "phases",
    nuclei_severity: "phases",
    nuclei_timeout: "phases",
    scan_schedule: "alerts",
    email_recipients: "alerts",
    ssh_probe_enabled: "alerts",
    ssh_override_version_threshold: "alerts",
  };

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

  const onSubmit = (data: NetworkFormData) => {
    const {
      email_recipients,
      ssh_override_insecure_auth: _a,
      ssh_override_weak_cipher: _b,
      ssh_override_weak_kex: _c,
      ssh_override_outdated_version: _d,
      ssh_override_config_regression: _e,
      ssh_override_version_threshold: _f,
      ...rest
    } = data;
    void _a;
    void _b;
    void _c;
    void _d;
    void _e;
    void _f;
    // Nuclei is only meaningful for masscan/nmap. Force-clear config fields
    // when disabled or when scanner_type is greenbone so the backend gets a
    // consistent payload and the clear_nuclei_* flags fire in the router.
    const nucleiActive = !isGreenbone && rest.nuclei_enabled;
    const payload: Record<string, unknown> = {
      ...rest,
      phases: isGreenbone
        ? null
        : phases?.map((p) =>
            p.name === "port_scan" ? { ...p, tool: rest.scanner_type } : p,
          ) ?? null,
      gvm_scan_config: isGreenbone ? gvmScanConfig : null,
      gvm_port_list: isGreenbone && gvmPortList ? gvmPortList : null,
      gvm_keep_reports: isGreenbone ? rest.gvm_keep_reports : true,
      nuclei_enabled: nucleiActive,
      nuclei_tags: nucleiActive && rest.nuclei_tags ? rest.nuclei_tags : null,
      nuclei_exclude_tags:
        nucleiActive && rest.nuclei_exclude_tags
          ? rest.nuclei_exclude_tags
          : null,
      nuclei_severity:
        nucleiActive && rest.nuclei_severity ? rest.nuclei_severity : null,
      nuclei_timeout:
        nucleiActive && rest.nuclei_timeout ? rest.nuclei_timeout : null,
      nuclei_sni_enabled: nucleiActive && (rest.nuclei_sni_enabled ?? false),
    };

    // Build alert_config from three layers, in order:
    //   1) the existing config minus the keys we manage explicitly here
    //      (email_recipients + the six SSH keys)
    //   2) the form's email_recipients (if any)
    //   3) the form's SSH overrides (only the keys NOT set to "inherit")
    // Result: keys set to "inherit" are absent so the network falls back to
    // the global SSH defaults; non-managed keys (e.g. SMTP overrides) ride
    // along untouched.
    const baseConfig =
      (source?.alert_config as Record<string, unknown> | null) ?? {};
    const carriedConfig: Record<string, unknown> = { ...baseConfig };
    delete carriedConfig.email_recipients;
    for (const key of SSH_ALERT_CONFIG_KEYS) {
      delete carriedConfig[key];
    }

    const sshOverrides = buildSshOverridesPayload(data);
    const recipientsList = email_recipients
      ?.split(",")
      .map((e) => e.trim())
      .filter(Boolean);

    const mergedConfig: Record<string, unknown> = {
      ...carriedConfig,
      ...sshOverrides,
    };
    if (recipientsList && recipientsList.length > 0) {
      mergedConfig.email_recipients = recipientsList;
    }

    payload.alert_config =
      Object.keys(mergedConfig).length > 0 ? mergedConfig : null;

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

  // When zod rejects the submit, jump to the tab that holds the first bad
  // field so the user can actually see the inline error.
  const onInvalid = (fieldErrors: Record<string, unknown>) => {
    const firstErrorField = Object.keys(fieldErrors)[0];
    if (firstErrorField) {
      const targetTab = fieldToTab[firstErrorField] ?? "general";
      setActiveTab(targetTab);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? "Edit Network"
              : cloneSource
                ? `Clone Network — ${cloneSource.name}`
                : "Add Network"}
          </DialogTitle>
        </DialogHeader>
        <FormProvider {...formMethods}>
        <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-4 py-2">
          {/* ── Tab bar — segmented control styled to match the Linear-inspired
              design tokens. Keeps the form content trim so the dialog fits in
              one viewport. ── */}
          <div
            role="tablist"
            className="inline-flex rounded-md border border-border/40 bg-muted/30 p-0.5 text-xs font-emphasis"
          >
            <button
              type="button"
              role="tab"
              aria-selected={effectiveTab === "general"}
              onClick={() => setActiveTab("general")}
              className={`cursor-pointer rounded px-3 py-1 transition-colors ${
                effectiveTab === "general"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              General
            </button>
            {!isGreenbone && (
              <button
                type="button"
                role="tab"
                aria-selected={effectiveTab === "phases"}
                onClick={() => setActiveTab("phases")}
                className={`cursor-pointer rounded px-3 py-1 transition-colors ${
                  effectiveTab === "phases"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Phases
              </button>
            )}
            <button
              type="button"
              role="tab"
              aria-selected={effectiveTab === "alerts"}
              onClick={() => setActiveTab("alerts")}
              className={`cursor-pointer rounded px-3 py-1 transition-colors ${
                effectiveTab === "alerts"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Schedule &amp; Alerts
            </button>
          </div>

          {/* ── General tab: Network identity + Scanner config ── */}
          <div
            role="tabpanel"
            hidden={effectiveTab !== "general"}
            className="space-y-4"
          >
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
            <div
              className={
                isGreenbone
                  ? "grid grid-cols-2 gap-3"
                  : "grid grid-cols-3 gap-3"
              }
            >
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
              {!isGreenbone && (
                <div>
                  <Label htmlFor="scan_protocol">Protocol</Label>
                  <Select id="scan_protocol" {...register("scan_protocol")}>
                    <option value="tcp">TCP</option>
                    <option value="udp">UDP</option>
                    <option value="both">Both</option>
                  </Select>
                </div>
              )}
            </div>
            {isGreenbone && (
              <GvmConfigSection
                scannerId={watchedScannerId}
                scanConfig={gvmScanConfig}
                onScanConfigChange={setGvmScanConfig}
                portList={gvmPortList}
                onPortListChange={setGvmPortList}
              />
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
          </div>
          {/* end General tab panel */}

          {/* ── Phases tab: Scan Phases + NSE + Nuclei (hidden for Greenbone) ── */}
          {!isGreenbone && (
            <div
              role="tabpanel"
              hidden={effectiveTab !== "phases"}
              className="space-y-4"
            >
              <fieldset className="space-y-3">
                <legend className="text-xs font-strong uppercase tracking-wider text-muted-foreground">
                  Phases
                </legend>
                <PhaseCards phases={phases} onChange={setPhases} scannerType={watchedScannerType as "masscan" | "nmap" | "greenbone"} />
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

                <NucleiSettings enabled={watchedNucleiEnabled} />
              </fieldset>
            </div>
          )}

          {/* ── Alerts tab: Schedule + Email + SSH probe + SSH overrides ── */}
          <div
            role="tabpanel"
            hidden={effectiveTab !== "alerts"}
            className="space-y-4"
          >
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

            <div className="rounded-md border border-border/40 bg-card/40 p-3">
              <label className="flex items-center gap-2 text-sm font-emphasis">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border/50 bg-background"
                  {...register("ssh_probe_enabled")}
                />
                Run SSH probe on open ports
              </label>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                When enabled (default), the scanner runs ssh-audit and nmap
                ssh-auth-methods against any discovered SSH service after the
                port scan. Uncheck to skip all SSH probing for this network —
                no SSH findings, banners, or cipher data will be recorded and
                no SSH alerts will fire.
              </p>
            </div>

            <SshAlertOverrides />
          </fieldset>
          </div>
          {/* end Alerts tab panel */}

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
                  ? "Save"
                  : "Create"}
            </Button>
          </DialogFooter>
        </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
