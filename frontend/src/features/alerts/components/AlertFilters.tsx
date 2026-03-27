import { ChevronDown, Filter } from "lucide-react";

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

interface AlertFilterValues {
  severity?: Severity;
  type?: AlertType;
  network_id?: number;
  dismissed?: boolean;
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
  children,
}: {
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={triggerClass} aria-label={`Filter by ${label}: ${value}`}>
        <span className="text-muted-foreground">{label}:</span>
        <span className="font-medium">{value}</span>
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
  const severityLabel = filters.severity
    ? (SEVERITIES.find((s) => s.value === filters.severity)?.label ?? "All")
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

  const groups = ["Port", "SSH", "NSE"] as const;

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Alert filters">
      <Filter className="h-4 w-4 text-muted-foreground" aria-hidden="true" />

      <FilterDropdown label="Severity" value={severityLabel}>
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

      <FilterDropdown label="Type" value={typeLabel}>
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

      <FilterDropdown label="Network" value={networkLabel}>
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

      <FilterDropdown label="Status" value={statusLabel}>
        {STATUS_OPTIONS.map((opt) => (
          <DropdownMenuItem
            key={opt.value}
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
    </div>
  );
}
