import { useEffect, useState } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { Info, Zap } from "lucide-react";
import { toast } from "sonner";

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
import { useNetworkDetail } from "@/features/networks/hooks/useNetworkDetail";
import { useNseProfiles } from "@/features/nse/hooks/useNse";
import { useCustomScanHost } from "@/features/hosts/hooks/useHosts";
import { NucleiSettings } from "@/features/networks/components/NucleiSettings";

type ScanMode = "port" | "nse";

const RATE_PRESETS = [
  { label: "Slow", value: 100 },
  { label: "Normal", value: 1000 },
  { label: "Fast", value: 10000 },
  { label: "Max", value: 100000 },
];

const schema = z.object({
  port_spec: z.string().min(1, "Port spec is required"),
  scanner_type: z.enum(["masscan", "nmap"]),
  scan_protocol: z.enum(["tcp", "udp", "both"]),
  scan_rate: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : Number(v)),
    z.number().positive().optional(),
  ),
  scan_timeout: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : Number(v)),
    z.number().min(1).max(1440).optional(),
  ),
  port_timeout: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : Number(v)),
    z.number().min(100).max(30000).optional(),
  ),
  // Nuclei fields
  nuclei_enabled: z.boolean().default(false),
  nuclei_tags: z.string().default("cve,exposure,misconfig,tech"),
  nuclei_exclude_tags: z.string().default("fuzz,dos,intrusive"),
  nuclei_severity: z.preprocess(
    (val) => (val === "" || val === null ? undefined : val),
    z.enum(["info", "low", "medium", "high", "critical"]).optional(),
  ),
  nuclei_timeout: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : Number(v)),
    z.number().min(1).max(120).optional(),
  ),
  nuclei_sni_enabled: z.boolean().default(false),
});

type FormData = z.infer<typeof schema>;

interface HostScanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hostIp: string;
  networkId: number;
  onSuccess?: () => void;
}

export function HostScanDialog({
  open,
  onOpenChange,
  hostIp,
  networkId,
  onSuccess,
}: HostScanDialogProps) {
  const network = useNetworkDetail(open ? networkId : 0);
  const profiles = useNseProfiles();
  const customScan = useCustomScanHost();

  const [scanMode, setScanMode] = useState<ScanMode>("port");
  const [nseProfileId, setNseProfileId] = useState<number | "">("");

  const methods = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      port_spec: "",
      scanner_type: "nmap",
      scan_protocol: "tcp",
      nuclei_enabled: false,
      nuclei_tags: "cve,exposure,misconfig,tech",
      nuclei_exclude_tags: "fuzz,dos,intrusive",
      nuclei_sni_enabled: false,
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = methods;

  const watchedRate = watch("scan_rate");
  const watchedNucleiEnabled = watch("nuclei_enabled");

  // Pre-fill from network defaults when data loads
  useEffect(() => {
    if (network.data && open) {
      const net = network.data;
      const isNse = net.scanner_type === "nse";
      setScanMode(isNse ? "nse" : "port");
      setNseProfileId(net.nse_profile_id ?? "");
      reset({
        port_spec: net.port_spec,
        scanner_type: net.scanner_type === "masscan" ? "masscan" : "nmap",
        scan_protocol: (net.scan_protocol as "tcp" | "udp" | "both") ?? "tcp",
        scan_rate: net.scan_rate ?? undefined,
        scan_timeout: net.scan_timeout != null ? Math.round(net.scan_timeout / 60) : undefined,
        port_timeout: net.port_timeout ?? undefined,
        nuclei_enabled: net.nuclei_enabled ?? false,
        nuclei_tags: net.nuclei_tags ?? "cve,exposure,misconfig,tech",
        nuclei_exclude_tags: net.nuclei_exclude_tags ?? "fuzz,dos,intrusive",
        nuclei_severity: net.nuclei_severity ?? undefined,
        nuclei_timeout: net.nuclei_timeout != null ? Math.round(net.nuclei_timeout / 60) : undefined,
        nuclei_sni_enabled: net.nuclei_sni_enabled ?? false,
      });
    }
  }, [network.data, open, reset]);

  const onSubmit = (data: FormData) => {
    if (scanMode === "nse" && !nseProfileId) {
      toast.error("Select an NSE profile");
      return;
    }

    const overrides = {
      ...data,
      // Convert minutes (form) → seconds (API)
      scan_timeout: data.scan_timeout != null ? data.scan_timeout * 60 : undefined,
      scanner_type: scanMode === "nse" ? "nse" : data.scanner_type,
      nse_profile_id: scanMode === "nse" ? Number(nseProfileId) : undefined,
      // Don't send nuclei overrides for NSE scans
      ...(scanMode === "nse"
        ? {
            nuclei_enabled: undefined,
            nuclei_tags: undefined,
            nuclei_exclude_tags: undefined,
            nuclei_severity: undefined,
            nuclei_timeout: undefined,
            nuclei_sni_enabled: undefined,
          }
        : {
            nuclei_timeout: data.nuclei_timeout != null ? data.nuclei_timeout * 60 : undefined,
          }),
    };

    customScan.mutate(
      { hostIp, overrides },
      {
        onSuccess: (resp) => {
          toast.success(resp.message ?? "Scan triggered");
          onOpenChange(false);
          onSuccess?.();
        },
        onError: (err) => toast.error(err.message ?? "Failed to trigger scan"),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Custom Scan — {hostIp}</DialogTitle>
        </DialogHeader>

        <FormProvider {...methods}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
            {/* Scan Mode */}
            <div>
              <Label>Scan Mode</Label>
              <div className="flex gap-2">
                {(
                  [
                    { value: "port", label: "Port Scan" },
                    { value: "nse", label: "NSE Vulnerability" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setScanMode(opt.value)}
                    className={`flex-1 rounded-md px-3 py-2 text-sm font-emphasis transition-colors ${
                      scanMode === opt.value
                        ? "bg-primary text-primary-foreground"
                        : "bg-surface-2 text-text-quaternary hover:text-text-secondary"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* NSE Profile Selector */}
            {scanMode === "nse" && (
              <div>
                <Label>NSE Profile</Label>
                <Select
                  value={nseProfileId}
                  onChange={(e) =>
                    setNseProfileId(
                      e.target.value ? Number(e.target.value) : "",
                    )
                  }
                >
                  <option value="">Choose a profile...</option>
                  {(profiles.data?.profiles ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.nse_scripts.length} scripts)
                    </option>
                  ))}
                </Select>
              </div>
            )}

            {/* Port Spec */}
            <div>
              <Label htmlFor="port_spec">Port Spec</Label>
              <Input
                id="port_spec"
                placeholder="80,443,1000-2000,!88"
                {...register("port_spec")}
              />
              {errors.port_spec && (
                <p className="mt-1 text-xs text-destructive">
                  {errors.port_spec.message}
                </p>
              )}
            </div>

            {/* Scanner Type + Protocol (port scan only) */}
            {scanMode === "port" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="scanner_type">Scanner Type</Label>
                  <Select id="scanner_type" {...register("scanner_type")}>
                    <option value="masscan">Masscan</option>
                    <option value="nmap">Nmap</option>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="scan_protocol">Protocol</Label>
                  <Select id="scan_protocol" {...register("scan_protocol")}>
                    <option value="tcp">TCP</option>
                    <option value="udp">UDP</option>
                    <option value="both">Both</option>
                  </Select>
                </div>
              </div>
            )}

            {/* Rate */}
            {scanMode === "port" && (
              <div>
                <Label htmlFor="scan_rate">Rate (pps)</Label>
                <Input
                  id="scan_rate"
                  type="number"
                  placeholder="1000"
                  {...register("scan_rate")}
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
                          : "bg-surface-2 text-text-quaternary hover:text-text-secondary"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Timeouts */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="scan_timeout">Scan Timeout (min)</Label>
                <Input
                  id="scan_timeout"
                  type="number"
                  placeholder="60"
                  {...register("scan_timeout")}
                />
                {errors.scan_timeout && (
                  <p className="mt-1 text-xs text-destructive">
                    {errors.scan_timeout.message}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="port_timeout">Port Timeout (ms)</Label>
                <Input
                  id="port_timeout"
                  type="number"
                  placeholder="1500"
                  {...register("port_timeout")}
                />
                {errors.port_timeout && (
                  <p className="mt-1 text-xs text-destructive">
                    {errors.port_timeout.message}
                  </p>
                )}
              </div>
            </div>

            {/* Nuclei Settings (port scan only) */}
            {scanMode === "port" && (
              <NucleiSettings enabled={watchedNucleiEnabled} />
            )}

            {/* SSH info note */}
            <div className="flex items-start gap-2 rounded-md border border-border bg-accent/50 p-3 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                SSH probing runs automatically after port scans when SSH
                services are detected — no separate configuration needed.
              </span>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={customScan.isPending}>
                <Zap className="h-4 w-4" />
                {customScan.isPending
                  ? "Starting…"
                  : scanMode === "nse"
                    ? "Start NSE Scan"
                    : "Start Port Scan"}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
