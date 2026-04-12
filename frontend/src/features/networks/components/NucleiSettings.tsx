import { useCallback } from "react";
import { useFormContext } from "react-hook-form";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { NetworkFormData } from "./networkFormSchema";

interface TagDef {
  tag: string;
  label: string;
}

const INCLUDE_TAGS: TagDef[] = [
  { tag: "cve", label: "CVE exploits (~4k)" },
  { tag: "exposure", label: "Exposed files/configs (~1.4k)" },
  { tag: "misconfig", label: "Misconfigurations (~900)" },
  { tag: "default-login", label: "Default credentials (~300)" },
  { tag: "tech", label: "Tech detection (~900)" },
];

const EXCLUDE_TAGS: TagDef[] = [
  { tag: "fuzz", label: "Fuzzing (slow, high traffic)" },
  { tag: "dos", label: "DoS probes (can crash services)" },
  { tag: "intrusive", label: "Write/modify actions (~500)" },
  { tag: "osint", label: "OSINT recon (~1.1k)" },
  { tag: "token-spray", label: "API key enumeration (~250)" },
  { tag: "headless", label: "Headless browser (~30)" },
];

function parseTags(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function TagChips({
  tags,
  active,
  onToggle,
}: {
  tags: TagDef[];
  active: string[];
  onToggle: (tag: string) => void;
}) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {tags.map(({ tag, label }) => {
        const isActive = active.includes(tag);
        return (
          <button
            key={tag}
            type="button"
            onClick={() => onToggle(tag)}
            className={`rounded-md border px-2 py-0.5 text-[10px] transition-colors ${
              isActive
                ? "border-primary/40 bg-primary/15 text-primary"
                : "border-border/40 bg-card/40 text-muted-foreground hover:border-border/60 hover:text-foreground"
            }`}
          >
            <span className="font-mono">{tag}</span>
            <span className="ml-1 font-normal opacity-70">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

function ControlledTagInput({
  field,
  id,
  placeholder,
  helpText,
  chipDefs,
}: {
  field: "nuclei_tags" | "nuclei_exclude_tags";
  id: string;
  placeholder: string;
  helpText: React.ReactNode;
  chipDefs: TagDef[];
}) {
  const { watch, setValue, getValues } = useFormContext<NetworkFormData>();
  const watched = watch(field);
  const raw = watched ?? getValues(field) ?? "";
  const active = parseTags(raw);

  const toggle = useCallback(
    (tag: string) => {
      const next = active.includes(tag)
        ? active.filter((t) => t !== tag)
        : [...active, tag];
      setValue(field, next.join(","), { shouldDirty: true });
    },
    [active, field, setValue],
  );

  return (
    <div className="col-span-2">
      <Label htmlFor={id}>{id === "nuclei_tags" ? "Include tags (optional)" : "Exclude tags (optional)"}</Label>
      <Input
        id={id}
        value={raw}
        onChange={(e) => setValue(field, e.target.value, { shouldDirty: true })}
        placeholder={placeholder}
        className="font-mono"
      />
      <p className="mt-0.5 text-[10px] text-muted-foreground">{helpText}</p>
      <TagChips tags={chipDefs} active={active} onToggle={toggle} />
    </div>
  );
}

interface NucleiSettingsProps {
  enabled: boolean;
}

export function NucleiSettings({ enabled }: NucleiSettingsProps) {
  const {
    register,
    formState: { errors },
  } = useFormContext<NetworkFormData>();

  return (
    <div className="rounded-md border border-border/40 bg-card/40 p-3">
      <label className="flex items-center gap-2 text-sm font-emphasis">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-border/50 bg-background"
          {...register("nuclei_enabled")}
        />
        Vulnerability scanning (Nuclei)
      </label>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        Runs nuclei against HTTP/HTTPS services discovered by the port scan.
        Available for masscan and nmap networks.
      </p>
      {enabled && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <ControlledTagInput
            field="nuclei_tags"
            id="nuclei_tags"
            placeholder="leave empty = all tags"
            helpText="Only run templates matching these tags. Leave empty for all. Click to toggle:"
            chipDefs={INCLUDE_TAGS}
          />

          <ControlledTagInput
            field="nuclei_exclude_tags"
            id="nuclei_exclude_tags"
            placeholder="fuzz,dos,intrusive"
            helpText={
              <>
                Skip templates matching these tags. Scanner default when empty:{" "}
                <code>fuzz,dos,intrusive</code>. Click to toggle:
              </>
            }
            chipDefs={EXCLUDE_TAGS}
          />

          {/* ── Severity + Timeout ── */}
          <div>
            <Label htmlFor="nuclei_severity">Alert threshold</Label>
            <Select id="nuclei_severity" {...register("nuclei_severity")}>
              <option value="">Default (medium)</option>
              <option value="info">Info</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </Select>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              All findings are stored. Only findings at or above this severity
              generate alerts.
            </p>
          </div>
          <div>
            <Label htmlFor="nuclei_timeout">
              Timeout (seconds, optional)
            </Label>
            <Input
              id="nuclei_timeout"
              type="number"
              min={60}
              max={7200}
              {...register("nuclei_timeout")}
              placeholder="1800"
            />
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Hard kill after this many seconds. Default 1800 (30 min).
            </p>
            {errors.nuclei_timeout && (
              <p className="mt-1 text-xs text-destructive">
                {errors.nuclei_timeout.message}
              </p>
            )}
          </div>

          {/* ── SNI fan-out ── */}
          <div className="col-span-2 mt-1">
            <label className="flex items-start gap-2 text-sm font-emphasis">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-border/50 bg-background"
                {...register("nuclei_sni_enabled")}
              />
              <span>
                SNI fan-out: scan every cached vhost on each IP
                <p className="mt-0.5 text-[11px] font-normal text-muted-foreground">
                  When enabled, the scanner queries the backend hostname
                  cache for each open-port host and expands nuclei targets
                  to <code>https://vhost:port</code> per known vhost. Only
                  useful when the hostnames resolve correctly from the
                  scanner's network. Capped at 50 vhosts per IP.
                </p>
              </span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
