import type { AlertType, Severity } from '@/lib/types'

const ALERT_TYPES: { value: AlertType; label: string }[] = [
  { value: 'new_port', label: 'New Port' },
  { value: 'not_allowed', label: 'Not Allowed' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'ssh_insecure_auth', label: 'SSH Insecure Auth' },
  { value: 'ssh_weak_cipher', label: 'SSH Weak Cipher' },
  { value: 'ssh_weak_kex', label: 'SSH Weak KEX' },
  { value: 'ssh_outdated_version', label: 'SSH Outdated' },
  { value: 'ssh_config_regression', label: 'SSH Regression' },
  { value: 'nse_vulnerability', label: 'NSE Vulnerability' },
  { value: 'nse_cve_detected', label: 'NSE CVE' },
]

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'info']

interface AlertFilterValues {
  severity?: Severity
  type?: AlertType
  network_id?: number
  dismissed?: boolean
}

interface AlertFiltersProps {
  filters: AlertFilterValues
  onChange: (filters: AlertFilterValues) => void
  networks: { id: number; name: string }[]
}

export function AlertFilters({ filters, onChange, networks }: AlertFiltersProps) {
  const selectClass =
    'rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring'

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm text-muted-foreground">Filter By:</span>

      <select
        value={filters.severity ?? ''}
        onChange={(e) =>
          onChange({
            ...filters,
            severity: (e.target.value || undefined) as Severity | undefined,
          })
        }
        className={selectClass}
      >
        <option value="">Severity: All</option>
        {SEVERITIES.map((s) => (
          <option key={s} value={s}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </option>
        ))}
      </select>

      <select
        value={filters.type ?? ''}
        onChange={(e) =>
          onChange({
            ...filters,
            type: (e.target.value || undefined) as AlertType | undefined,
          })
        }
        className={selectClass}
      >
        <option value="">Type: All</option>
        <optgroup label="Port Alerts">
          {ALERT_TYPES.filter((t) => ['new_port', 'not_allowed', 'blocked'].includes(t.value)).map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </optgroup>
        <optgroup label="SSH Alerts">
          {ALERT_TYPES.filter((t) => t.value.startsWith('ssh_')).map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </optgroup>
        <optgroup label="NSE Alerts">
          {ALERT_TYPES.filter((t) => t.value.startsWith('nse_')).map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </optgroup>
      </select>

      <select
        value={filters.network_id ?? ''}
        onChange={(e) =>
          onChange({
            ...filters,
            network_id: e.target.value ? Number(e.target.value) : undefined,
          })
        }
        className={selectClass}
      >
        <option value="">Network: All</option>
        {networks.map((n) => (
          <option key={n.id} value={n.id}>
            {n.name}
          </option>
        ))}
      </select>

      <select
        value={filters.dismissed === undefined ? '' : String(filters.dismissed)}
        onChange={(e) =>
          onChange({
            ...filters,
            dismissed:
              e.target.value === '' ? undefined : e.target.value === 'true',
          })
        }
        className={selectClass}
      >
        <option value="">Status: All</option>
        <option value="false">Active</option>
        <option value="true">Dismissed</option>
      </select>
    </div>
  )
}
