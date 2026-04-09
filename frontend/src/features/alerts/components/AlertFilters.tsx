import { useState, useEffect, useRef } from "react";
import { ChevronDown, Filter, Search, X } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AlertType, Severity } from "@/lib/types";

const ALERT_TYPES: { value: AlertType; label: string; group: string }[] = [
  { value: "new_port", label: "New Port", group: "Port" },
  { value: "not_allowed", label: "Not Allowed", group: "Port" },
  { value: "blocked", label: "Blocked", group: "Port" },
  { value: "ssh_insecure_auth", label: "SSH Insecure Auth", group: "SSH" },
  { value: "ssh_weak_cipher", label: "SSH Weak Cipher", group: "SSH" },
  { value: "ssh_weak_kex", label: "SSH Weak KEX", group: "SSH" },
  { value: "ssh_outdated_version", label: "SSH Outdated", group: "SSH" },
  { value: "ssh_config_regression", label: "SSH Regression", group: "SSH" },
  { value: "nse_vulnerability", label: "NSE Vulnerability", group: "NSE" },
  { value: "nse_cve_detected", label: "NSE CVE", group: "NSE" },
];

const SEVERITIES: { value: Severity; label: string }[] = [
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "info", label: "Info" },
];

const STATUS_OPTIONS: { value: boolean | undefined; label: string }[] = [
  { value: undefined, label: "All" },
  { value: false, label: "Active" },
  { value: true, label: "Dismissed" },
];

type AlertSource = "port" | "ssh" | "nse";

const ALERT_SOURCES: { value: AlertSource; label: string }[] = [
  { value: "port", label: "Port" },
  { value: "ssh", label: "SSH" },
  { value: "nse", label: "NSE" },
];

interface AlertFilterValues {
  severity?: Severity;
  type?: AlertType;
  source?: AlertSource;
  network_id?: number;
  dismissed?: boolean;
  search?: string;
  port?: number;
}

interface AlertFiltersProps {
  filters: AlertFilterValues;
  onChange: (filters: AlertFilterValues) => void;
  networks: { id: number; name: string }[];
}

const triggerClass =
  "flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground hover:bg-muted/50 transition-colors cursor-pointer";

function FilterDropdown({
  label,
  value,
  active,
  children,
}: {
  label: string;
  value: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={`${triggerClass} relative`}
        aria-label={`Filter by ${label}: ${value}`}
      >
        {active && (
          <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary" />
        )}
        <span className="text-muted-foreground">{label}:</span>
        <span className="font-emphasis">{value}</span>
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={4}>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AlertFilters({
  filters,
  onChange,
  networks,
}: AlertFiltersProps) {
  const [searchInput, setSearchInput] = useState(filters.search ?? "");
  const [portInput, setPortInput] = useState(
    filters.port ? String(filters.port) : "",
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const portDebounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const trimmed = searchInput.trim() || undefined;
      if (trimmed !== filters.search) {
        onChange({ ...filters, search: trimmed });
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  useEffect(() => {
    if (portDebounceRef.current) clearTimeout(portDebounceRef.current);
    portDebounceRef.current = setTimeout(() => {
      const parsed = portInput.trim() ? Number(portInput.trim()) : undefined;
      const valid =
        parsed === undefined ||
        (Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535)
          ? parsed
          : undefined;
      if (valid !== filters.port) {
        onChange({ ...filters, port: valid });
      }
    }, 400);
    return () => {
      if (portDebounceRef.current) clearTimeout(portDebounceRef.current);
    };
  }, [portInput]);

  const severityLabel = filters.severity
    ? (SEVERITIES.find((s) => s.value === filters.severity)?.label ?? "All")
    : "All";

  const sourceLabel = filters.source
    ? (ALERT_SOURCES.find((s) => s.value === filters.source)?.label ?? "All")
    : "All";

  const typeLabel = filters.type
    ? (ALERT_TYPES.find((t) => t.value === filters.type)?.label ?? "All")
    : "All";

  const networkLabel = filters.network_id
    ? (networks.find((n) => n.id === filters.network_id)?.name ?? "All")
    : "All";

  const statusLabel =
    filters.dismissed === undefined
      ? "All"
      : filters.dismissed
        ? "Dismissed"
        : "Active";

  const hasActiveFilters =
    !!filters.severity ||
    !!filters.source ||
    !!filters.type ||
    !!filters.network_id ||
    filters.dismissed !== undefined ||
    !!filters.search ||
    !!filters.port;

  const groups = ["Port", "SSH", "NSE"] as const;

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="group"
      aria-label="Alert filters"
    >
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search alerts..."
          className="h-8 w-52 rounded-md border border-border bg-background pl-8 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {searchInput && (
          <button
            onClick={() => setSearchInput("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="relative">
        <input
          type="text"
          inputMode="numeric"
          value={portInput}
          onChange={(e) => setPortInput(e.target.value.replace(/\D/g, ""))}
          placeholder="Port"
          className="h-8 w-20 rounded-md border border-border bg-background px-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {portInput && (
          <button
            onClick={() => setPortInput("")}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      <Filter className="h-4 w-4 text-muted-foreground" aria-hidden="true" />

      <FilterDropdown label="Severity" value={severityLabel} active={!!filters.severity}>
        <DropdownMenuItem
          onClick={() => onChange({ ...filters, severity: undefined })}
        >
          All
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {SEVERITIES.map((s) => (
          <DropdownMenuItem
            key={s.value}
            onClick={() => onChange({ ...filters, severity: s.value })}
          >
            {s.label}
          </DropdownMenuItem>
        ))}
      </FilterDropdown>

      <FilterDropdown label="Source" value={sourceLabel} active={!!filters.source}>
        <DropdownMenuItem
          onClick={() => onChange({ ...filters, source: undefined })}
        >
          All
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {ALERT_SOURCES.map((s) => (
          <DropdownMenuItem
            key={s.value}
            onClick={() => onChange({ ...filters, source: s.value })}
          >
            {s.label}
          </DropdownMenuItem>
        ))}
      </FilterDropdown>

      <FilterDropdown label="Type" value={typeLabel} active={!!filters.type}>
        <DropdownMenuItem
          onClick={() => onChange({ ...filters, type: undefined })}
        >
          All
        </DropdownMenuItem>
        {groups.map((group) => (
          <DropdownMenuGroup key={group}>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{group} Alerts</DropdownMenuLabel>
            {ALERT_TYPES.filter((t) => t.group === group).map((t) => (
              <DropdownMenuItem
                key={t.value}
                onClick={() => onChange({ ...filters, type: t.value })}
              >
                {t.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ))}
      </FilterDropdown>

      <FilterDropdown label="Network" value={networkLabel} active={!!filters.network_id}>
        <DropdownMenuItem
          onClick={() => onChange({ ...filters, network_id: undefined })}
        >
          All
        </DropdownMenuItem>
        {networks.length > 0 && <DropdownMenuSeparator />}
        {networks.map((n) => (
          <DropdownMenuItem
            key={n.id}
            onClick={() => onChange({ ...filters, network_id: n.id })}
          >
            {n.name}
          </DropdownMenuItem>
        ))}
      </FilterDropdown>

      <FilterDropdown label="Status" value={statusLabel} active={filters.dismissed !== undefined}>
        {STATUS_OPTIONS.map((opt) => (
          <DropdownMenuItem
            key={String(opt.value)}
            onClick={() =>
              onChange({
                ...filters,
                dismissed: opt.value,
              })
            }
          >
            {opt.label}
          </DropdownMenuItem>
        ))}
      </FilterDropdown>

      {hasActiveFilters && (
        <button
          onClick={() => {
            setSearchInput("");
            setPortInput("");
            onChange({});
          }}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
