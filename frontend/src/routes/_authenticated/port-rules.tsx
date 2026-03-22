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
  match_criteria: { port: number; ip?: string }
  description: string | null
  created_at: string
}

interface PolicyResponse {
  rules: PortRule[]
}

function usePortRules() {
  return useQuery({
    queryKey: ['policy', 'rules'],
    queryFn: () => fetchApi<PolicyResponse>('/api/policy'),
  })
}

function GlobalRuleAddForm({ onAdded }: { onAdded: () => void }) {
  const [port, setPort] = useState('')
  const [ip, setIp] = useState('')
  const [ruleType, setRuleType] = useState<'accepted' | 'critical'>('accepted')
  const [description, setDescription] = useState('')

  const addRule = useMutation({
    mutationFn: (data: {
      port: string
      ip?: string
      rule_type: string
      description?: string
    }) => postApi('/api/policy/rules', data),
    onSuccess: () => {
      toast.success('Global rule added')
      setPort('')
      setIp('')
      setDescription('')
      onAdded()
    },
    onError: (e) => toast.error(e.message),
  })

  const selectClass =
    'rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring'

  return (
    <div className="border-b border-border bg-accent/30 px-5 py-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            Port
          </label>
          <Input
            value={port}
            onChange={(e) => setPort(e.target.value)}
            placeholder="80"
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
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            Type
          </label>
          <select
            value={ruleType}
            onChange={(e) =>
              setRuleType(e.target.value as 'accepted' | 'critical')
            }
            className={selectClass}
          >
            <option value="accepted">Accepted</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-xs text-muted-foreground mb-1">
            Description
          </label>
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
              port,
              ip: ip || undefined,
              rule_type: ruleType,
              description: description || undefined,
            })
          }
          disabled={!port || addRule.isPending}
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
  return (
    <div className="flex items-center justify-between px-5 py-3 group">
      <div className="flex items-center gap-3">
        <span className="font-mono text-sm text-foreground">
          {rule.match_criteria.ip ? `${rule.match_criteria.ip}:` : ''}
          {rule.match_criteria.port}
        </span>
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
        `Remove rule for port ${rule.match_criteria.port}? This cannot be undone.`,
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
            Port Rules
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage global and per-network port acceptance and criticality rules.
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
