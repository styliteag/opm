import { ChevronDown, ChevronRight } from "lucide-react";
import { useState, useCallback } from "react";
import { toast } from "sonner";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TOOL_LABELS } from "@/lib/terminology";
import type { ScanPhase } from "@/lib/types";

// Shown while a network has no stored phases (phases = null). The scanner
// then runs the port scan only (orchestration._build_legacy_phases), so the
// other phases start unchecked instead of pretending they run.
const DEFAULT_PHASES: ScanPhase[] = [
  {
    name: "host_discovery",
    enabled: false,
    tool: "nmap",
    config: { aggressive: false, max_retries: 2 },
  },
  {
    name: "port_scan",
    enabled: true,
    tool: "masscan",
    config: { aggressive: false, max_retries: 3 },
  },
  {
    name: "vulnerability",
    enabled: false,
    tool: "nmap_nse",
    config: { aggressive: false, parallel: true, max_retries: 3 },
  },
];

// The port-scan tool follows the network's scan engine (set on save), so
// there is no per-phase tool choice here (inventory bug #4).
const PHASE_META: Record<string, { label: string; description: string }> = {
  host_discovery: {
    label: "Host discovery",
    description: "Find live hosts first (nmap ping sweep & ARP)",
  },
  port_scan: {
    label: "Port scan",
    description: "Discover open ports on live hosts",
  },
  vulnerability: {
    label: TOOL_LABELS.nse,
    description: "Run nmap NSE scripts against discovered ports",
  },
};

const PHASE_ORDER = ["host_discovery", "port_scan", "vulnerability"];

interface PhaseCardsProps {
  phases: ScanPhase[] | null;
  onChange: (phases: ScanPhase[]) => void;
  scannerType?: "masscan" | "nmap" | "greenbone";
}

export function PhaseCards({ phases, onChange, scannerType = "masscan" }: PhaseCardsProps) {
  const defaults = DEFAULT_PHASES.map((p) =>
    p.name === "port_scan" ? { ...p, tool: scannerType } : p,
  );
  const current = phases && phases.length > 0 ? phases : defaults;

  const updatePhase = useCallback(
    (name: string, updates: Partial<ScanPhase>) => {
      onChange(
        current.map((p) => (p.name === name ? { ...p, ...updates } : p)),
      );
    },
    [current, onChange],
  );

  const handleToggle = useCallback(
    (name: string, enabled: boolean) => {
      const idx = PHASE_ORDER.indexOf(name);
      if (enabled) {
        // Auto-enable upstream phases
        onChange(
          current.map((p) => {
            const pIdx = PHASE_ORDER.indexOf(p.name);
            return pIdx <= idx && pIdx >= 0 ? { ...p, enabled: true } : p;
          }),
        );
      } else {
        if (idx < PHASE_ORDER.length - 1) {
          toast.warning(
            `Downstream phases may scan the entire CIDR without ${PHASE_META[name]?.label ?? name}`,
          );
        }
        onChange(
          current.map((p) => (p.name === name ? { ...p, enabled: false } : p)),
        );
      }
    },
    [current, onChange],
  );

  const enabledCount = current.filter((p) => p.enabled).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-strong">Scan phases</Label>
        <span className="text-[10px] text-muted-foreground">
          {enabledCount} of {current.length} enabled
        </span>
      </div>
      <div className="space-y-2">
        {current.map((phase) => {
          const meta = PHASE_META[phase.name];
          if (!meta) return null;
          return (
            <PhaseCard
              key={phase.name}
              phase={phase}
              meta={meta}
              onToggle={(e) => handleToggle(phase.name, e)}
              onUpdate={(u) => updatePhase(phase.name, u)}
            />
          );
        })}
      </div>
    </div>
  );
}

interface PhaseCardProps {
  phase: ScanPhase;
  meta: { label: string; description: string };
  onToggle: (enabled: boolean) => void;
  onUpdate: (updates: Partial<ScanPhase>) => void;
}

function PhaseCard({ phase, meta, onToggle, onUpdate }: PhaseCardProps) {
  const [expanded, setExpanded] = useState(false);
  const config = phase.config;

  return (
    <div
      className={`rounded-lg border px-3 py-2.5 transition-colors ${
        phase.enabled
          ? "border-primary/40 bg-primary/5"
          : "border-muted bg-muted/30 opacity-60"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <Checkbox
          checked={phase.enabled}
          onCheckedChange={(c) => onToggle(c === true)}
        />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-emphasis">{meta.label}</span>
          <span className="ml-2 text-[10px] text-muted-foreground">
            {meta.description}
          </span>
        </div>
        {phase.enabled && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            aria-label={`${expanded ? "Hide" : "Show"} ${meta.label} options`}
            className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
          >
            {expanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
        )}
      </div>

      {phase.enabled && expanded && (
        <div className="mt-2 pt-2 border-t border-border/50 space-y-2">
          {/* Vulnerability specific */}
          {phase.name === "vulnerability" && (
            <div className="flex items-center gap-2">
              <Checkbox
                checked={(config.parallel as boolean) ?? true}
                onCheckedChange={(c) =>
                  onUpdate({ config: { ...config, parallel: c === true } })
                }
              />
              <span className="text-xs">Parallel Execution</span>
            </div>
          )}

          {/* Shared config */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Checkbox
                checked={(config.aggressive as boolean) ?? false}
                onCheckedChange={(c) =>
                  onUpdate({ config: { ...config, aggressive: c === true } })
                }
              />
              <span className="text-[10px]">Aggressive</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Label className="text-[10px]">Retries</Label>
              <Input
                type="number"
                min={0}
                max={10}
                value={(config.max_retries as number) ?? 3}
                onChange={(e) =>
                  onUpdate({
                    config: {
                      ...config,
                      max_retries: parseInt(e.target.value) || 0,
                    },
                  })
                }
                className="h-6 w-14 text-xs"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
