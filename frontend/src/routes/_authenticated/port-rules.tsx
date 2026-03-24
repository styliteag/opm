import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Globe, Network } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LoadingState } from '@/components/data-display/LoadingState'
import { ErrorState } from '@/components/data-display/ErrorState'
import { StatusBadge } from '@/components/data-display/StatusBadge'
import { fetchApi, postApi, deleteApi } from '@/lib/api'

export const Route = createFileRoute('/_authenticated/port-rules')({
  component: PortRulesPage,
})

interface PortRule {
  id: number
  network_id: number | null
  network_name?: string | null
  rule_type: 'accepted' | 'critical'
  ip: string | null
  port: string
  source: string
  alert_type: string | null
  script_name: string | null
  description: string | null
  created_at: string
}

interface PolicyResponse {
  rules: PortRule[]
}

type RuleSource = 'port' | 'ssh' | 'nse'

const SSH_ALERT_TYPES = [
  { value: 'ssh_insecure_auth', label: 'Insecure Auth (password/keyboard-interactive)' },
  { value: 'ssh_weak_cipher', label: 'Weak Ciphers' },
  { value: 'ssh_weak_kex', label: 'Weak Key Exchange' },
  { value: 'ssh_outdated_version', label: 'Outdated SSH Version' },
  { value: 'ssh_config_regression', label: 'Configuration Regression' },
]

const NSE_ALERT_TYPES = [
  { value: 'nse_vulnerability', label: 'NSE Vulnerability' },
  { value: 'nse_cve_detected', label: 'CVE Detected' },
]

const SOURCE_BADGES: Record<string, { label: string; className: string }> = {
  port: { label: 'Port', className: 'bg-blue-500/10 text-blue-500' },
  ssh: { label: 'SSH', className: 'bg-amber-500/10 text-amber-500' },
  nse: { label: 'NSE', className: 'bg-purple-500/10 text-purple-500' },
}

function SourceBadge({ source }: { source: string }) {
  const badge = SOURCE_BADGES[source] ?? SOURCE_BADGES.port
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${badge.className}`}>
      {badge.label}
    </span>
  )
}

function usePortRules() {
  return useQuery({
    queryKey: ['policy', 'rules'],
    queryFn: () => fetchApi<PolicyResponse>('/api/port-rules'),
  })
}

function GlobalRuleAddForm({ onAdded }: { onAdded: () => void }) {
  const [source, setSource] = useState<RuleSource>('port')
  const [port, setPort] = useState('')
  const [ip, setIp] = useState('')
  const [ruleType, setRuleType] = useState<'accepted' | 'critical'>('accepted')
  const [alertType, setAlertType] = useState('')
  const [scriptName, setScriptName] = useState('')
  const [description, setDescription] = useState('')

  const addRule = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      postApi('/api/port-rules', data),
    onSuccess: () => {
      toast.success('Rule added')
      setPort('')
      setIp('')
      setAlertType('')
      setScriptName('')
      setDescription('')
      onAdded()
    },
    onError: (e) => toast.error(e.message),
  })

  const selectClass =
    'rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring'

  const canSubmit =
    source === 'port' ? Boolean(port) : true // SSH/NSE rules don't require port

  return (
    <div className="border-b border-border bg-accent/30 px-5 py-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Source</label>
          <select
            value={source}
            onChange={(e) => {
              setSource(e.target.value as RuleSource)
              setAlertType('')
              setScriptName('')
            }}
            className={selectClass}
          >
            <option value="port">Port</option>
            <option value="ssh">SSH</option>
            <option value="nse">NSE</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            Port{source !== 'port' ? ' (optional)' : ''}
          </label>
          <Input
            value={port}
            onChange={(e) => setPort(e.target.value)}
            placeholder={source === 'ssh' ? '22' : '80'}
            className="w-24 font-mono"
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            IP (optional)
          </label>
          <Input
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            placeholder="192.168.1.1"
            className="w-36 font-mono"
          />
        </div>

        {source === 'ssh' && (
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Alert Type (optional)
            </label>
            <select value={alertType} onChange={(e) => setAlertType(e.target.value)} className={selectClass}>
              <option value="">Any SSH alert</option>
              {SSH_ALERT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        )}

        {source === 'nse' && (
          <>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                Alert Type (optional)
              </label>
              <select value={alertType} onChange={(e) => setAlertType(e.target.value)} className={selectClass}>
                <option value="">Any NSE alert</option>
                {NSE_ALERT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                Script Name (optional)
              </label>
              <Input
                value={scriptName}
                onChange={(e) => setScriptName(e.target.value)}
                placeholder="http-vuln-cve2017-5638"
                className="w-52 font-mono"
              />
            </div>
          </>
        )}

        <div>
          <label className="block text-xs text-muted-foreground mb-1">Type</label>
          <select
            value={ruleType}
            onChange={(e) => setRuleType(e.target.value as 'accepted' | 'critical')}
            className={selectClass}
          >
            <option value="accepted">Accepted</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs text-muted-foreground mb-1">Description</label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Why this rule exists"
          />
        </div>
        <Button
          size="sm"
          onClick={() =>
            addRule.mutate({
              port: port || undefined,
              ip: ip || undefined,
              rule_type: ruleType,
              description: description || undefined,
              source,
              alert_type: alertType || undefined,
              script_name: scriptName || undefined,
            })
          }
          disabled={!canSubmit || addRule.isPending}
        >
          {addRule.isPending ? 'Adding...' : 'Add'}
        </Button>
      </div>
    </div>
  )
}

function RuleRow({
  rule,
  onDelete,
  isDeleting,
}: {
  rule: PortRule
  onDelete: () => void
  isDeleting: boolean
}) {
  // Build extra criteria display
  const extraParts: string[] = []
  if (rule.alert_type) {
    const label =
      SSH_ALERT_TYPES.find((t) => t.value === rule.alert_type)?.label ??
      NSE_ALERT_TYPES.find((t) => t.value === rule.alert_type)?.label ??
      rule.alert_type
    extraParts.push(label)
  }
  if (rule.script_name) {
    extraParts.push(rule.script_name)
  }

  return (
    <div className="flex items-center justify-between px-5 py-3 group">
      <div className="flex items-center gap-3">
        <SourceBadge source={rule.source} />
        <span className="font-mono text-sm text-foreground">
          {rule.ip ? `${rule.ip}:` : ''}
          {rule.port || '*'}
        </span>
        {extraParts.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {extraParts.join(' · ')}
          </span>
        )}
        <StatusBadge
          label={rule.rule_type}
          variant={rule.rule_type === 'accepted' ? 'success' : 'danger'}
        />
        {rule.description && (
          <span className="text-sm text-muted-foreground">
            — {rule.description}
          </span>
        )}
      </div>
      <button
        onClick={onDelete}
        disabled={isDeleting}
        className="rounded p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50"
        title="Remove rule"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function PortRulesPage() {
  const [showAdd, setShowAdd] = useState(false)
  const { data, isLoading, error, refetch } = usePortRules()
  const qc = useQueryClient()

  const deleteRule = useMutation({
    mutationFn: ({ scope, id }: { scope: 'global' | 'network'; id: number }) =>
      deleteApi(`/api/port-rules/${scope}/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['policy', 'rules'] })
      toast.success('Rule removed')
    },
    onError: (e) => toast.error(e.message),
  })

  if (isLoading) return <LoadingState rows={8} />
  if (error)
    return <ErrorState message={error.message} onRetry={() => refetch()} />

  const allRules = data?.rules ?? []
  const globalRules = allRules.filter((r) => r.network_id === null)
  const networkRules = allRules.filter((r) => r.network_id !== null)

  const networkGroups = networkRules.reduce<Record<string, PortRule[]>>(
    (acc, rule) => {
      const key = rule.network_name ?? `Network #${rule.network_id}`
      return {
        ...acc,
        [key]: [...(acc[key] ?? []), rule],
      }
    },
    {},
  )

  const handleDeleteConfirm = (
    rule: PortRule,
    scope: 'global' | 'network',
  ) => {
    if (
      window.confirm(
        `Remove this ${rule.source} rule? This cannot be undone.`,
      )
    ) {
      deleteRule.mutate({ scope, id: rule.id })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Alert Rules
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage global and per-network alert acceptance and criticality rules for port, SSH, and NSE alerts.
          </p>
        </div>
      </div>

      {/* Global Rules */}
      <div className="rounded-lg border border-border">
        <div className="flex items-center justify-between border-b border-border bg-card px-5 py-3">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-display text-sm font-semibold text-foreground">
              Global Rules ({globalRules.length})
            </h3>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAdd(!showAdd)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Rule
          </Button>
        </div>

        {showAdd && (
          <GlobalRuleAddForm
            onAdded={() => {
              setShowAdd(false)
              qc.invalidateQueries({ queryKey: ['policy', 'rules'] })
            }}
          />
        )}

        {globalRules.length === 0 && !showAdd ? (
          <div className="p-5 text-sm text-muted-foreground">
            No global rules configured.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {globalRules.map((rule) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                onDelete={() => handleDeleteConfirm(rule, 'global')}
                isDeleting={deleteRule.isPending}
              />
            ))}
          </div>
        )}
      </div>

      {/* Per-Network Rules */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Network className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-display text-lg font-semibold text-foreground">
            Per-Network Rules
          </h2>
        </div>

        {Object.keys(networkGroups).length === 0 ? (
          <div className="rounded-lg border border-border p-5 text-sm text-muted-foreground">
            No per-network rules configured.
          </div>
        ) : (
          Object.entries(networkGroups).map(([networkName, rules]) => (
            <div key={networkName} className="rounded-lg border border-border">
              <div className="border-b border-border bg-card px-5 py-3">
                <h3 className="font-display text-sm font-semibold text-foreground">
                  {networkName} ({rules.length})
                </h3>
              </div>
              <div className="divide-y divide-border">
                {rules.map((rule) => (
                  <RuleRow
                    key={rule.id}
                    rule={rule}
                    onDelete={() => handleDeleteConfirm(rule, 'network')}
                    isDeleting={deleteRule.isPending}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
