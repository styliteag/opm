import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/data-display/StatusBadge'
import { postApi, deleteApi } from '@/lib/api'

interface PortRule {
  id: number
  network_id: number | null
  rule_type: 'accepted' | 'critical'
  match_criteria: { port: number; ip?: string }
  description: string | null
  created_at: string
}

interface PortRulesEditorProps {
  networkId: number
  rules: PortRule[]
}

export function PortRulesEditor({ networkId, rules }: PortRulesEditorProps) {
  const [showAdd, setShowAdd] = useState(false)
  const [port, setPort] = useState('')
  const [ip, setIp] = useState('')
  const [ruleType, setRuleType] = useState<'accepted' | 'critical'>('accepted')
  const [description, setDescription] = useState('')

  const qc = useQueryClient()

  const addRule = useMutation({
    mutationFn: (data: { port: string; ip?: string; rule_type: string; description?: string }) =>
      postApi(`/api/networks/${networkId}/rules`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['networks', networkId, 'rules'] })
      toast.success('Rule added')
      setShowAdd(false)
      setPort('')
      setIp('')
      setDescription('')
    },
    onError: (e) => toast.error(e.message),
  })

  const removeRule = useMutation({
    mutationFn: (ruleId: number) =>
      deleteApi(`/api/networks/${networkId}/rules/${ruleId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['networks', networkId, 'rules'] })
      toast.success('Rule removed')
    },
    onError: (e) => toast.error(e.message),
  })

  const selectClass =
    'rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring'

  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center justify-between border-b border-border bg-card px-5 py-3">
        <h3 className="font-display text-sm font-semibold text-foreground">
          Port Rules ({rules.length})
        </h3>
        <Button variant="outline" size="sm" onClick={() => setShowAdd(!showAdd)}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add Rule
        </Button>
      </div>

      {showAdd && (
        <div className="border-b border-border bg-accent/30 px-5 py-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Port</label>
              <Input
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="80"
                className="w-24 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">IP (optional)</label>
              <Input
                value={ip}
                onChange={(e) => setIp(e.target.value)}
                placeholder="192.168.1.1"
                className="w-36 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Type</label>
              <select value={ruleType} onChange={(e) => setRuleType(e.target.value as 'accepted' | 'critical')} className={selectClass}>
                <option value="accepted">Accepted</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs text-muted-foreground mb-1">Description</label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Why this rule exists"
              />
            </div>
            <Button
              size="sm"
              onClick={() => addRule.mutate({
                port,
                ip: ip || undefined,
                rule_type: ruleType,
                description: description || undefined,
              })}
              disabled={!port || addRule.isPending}
            >
              {addRule.isPending ? 'Adding...' : 'Add'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {rules.length === 0 && !showAdd ? (
        <div className="p-5 text-sm text-muted-foreground">No port rules configured.</div>
      ) : (
        <div className="divide-y divide-border">
          {rules.map((rule) => (
            <div key={rule.id} className="flex items-center justify-between px-5 py-3 group">
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
                  <span className="text-sm text-muted-foreground">— {rule.description}</span>
                )}
              </div>
              <button
                onClick={() => removeRule.mutate(rule.id)}
                className="rounded p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                title="Remove rule"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
