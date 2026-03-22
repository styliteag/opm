import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Building, Save } from 'lucide-react'
import { toast } from 'sonner'

import { useQuery } from '@tanstack/react-query'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/data-display/StatusBadge'
import { LoadingState } from '@/components/data-display/LoadingState'
import { ErrorState } from '@/components/data-display/ErrorState'
import { useOrganization, useOrgMutations } from '@/features/admin/hooks/useAdmin'
import { fetchApi } from '@/lib/api'

export const Route = createFileRoute('/_authenticated/admin/organization')({
  component: OrganizationPage,
})

function OrganizationPage() {
  const { data, isLoading, error, refetch } = useOrganization()
  const { update } = useOrgMutations()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [initialized, setInitialized] = useState(false)

  if (isLoading) return <LoadingState rows={4} />
  if (error) return <ErrorState message={error.message} onRetry={refetch} />
  if (!data) return <ErrorState message="Organization not found" />

  if (!initialized) {
    setName(data.name)
    setDescription(data.description ?? '')
    setContactEmail(data.contact_email ?? '')
    setInitialized(true)
  }

  const handleSave = () => {
    update.mutate(
      {
        name: name || undefined,
        description: description || undefined,
        contact_email: contactEmail || undefined,
      },
      {
        onSuccess: () => toast.success('Organization updated'),
        onError: (e) => toast.error(e.message),
      },
    )
  }

  const inputClass =
    'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring'

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Building className="h-6 w-6 text-cyan-500" />
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Organization Control
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Centralize settings and manage organization-level configuration.
          </p>
        </div>
      </div>

      <div className="max-w-2xl space-y-6">
        <div className="rounded-lg border border-border bg-card p-6 space-y-4">
          <h3 className="font-display text-sm font-semibold text-foreground">
            General Settings
          </h3>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Organization Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Contact Email
            </label>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className={inputClass}
              placeholder="security@example.com"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={update.isPending}
            className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <Save className="h-4 w-4" />
            {update.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

        <SecurityPoliciesSection />
      </div>
    </div>
  )
}

function SecurityPoliciesSection() {
  const sshDefaults = useQuery({
    queryKey: ['global-settings', 'ssh-alert-defaults'],
    queryFn: () => fetchApi<Record<string, unknown>>('/api/global-settings/ssh-alert-defaults'),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Security Policies</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
              SSH Alert Defaults
            </h4>
            {sshDefaults.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : sshDefaults.error ? (
              <p className="text-sm text-destructive">Failed to load SSH defaults</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center justify-between rounded-md bg-accent/50 px-3 py-2">
                  <span className="text-sm text-foreground">Insecure Auth</span>
                  <StatusBadge
                    label={(sshDefaults.data as Record<string, boolean>)?.alert_on_insecure_auth !== false ? 'Alert' : 'Ignore'}
                    variant={(sshDefaults.data as Record<string, boolean>)?.alert_on_insecure_auth !== false ? 'warning' : 'neutral'}
                  />
                </div>
                <div className="flex items-center justify-between rounded-md bg-accent/50 px-3 py-2">
                  <span className="text-sm text-foreground">Weak Ciphers</span>
                  <StatusBadge
                    label={(sshDefaults.data as Record<string, boolean>)?.alert_on_weak_ciphers !== false ? 'Alert' : 'Ignore'}
                    variant={(sshDefaults.data as Record<string, boolean>)?.alert_on_weak_ciphers !== false ? 'warning' : 'neutral'}
                  />
                </div>
                <div className="flex items-center justify-between rounded-md bg-accent/50 px-3 py-2">
                  <span className="text-sm text-foreground">Weak KEX</span>
                  <StatusBadge
                    label={(sshDefaults.data as Record<string, boolean>)?.alert_on_weak_kex !== false ? 'Alert' : 'Ignore'}
                    variant={(sshDefaults.data as Record<string, boolean>)?.alert_on_weak_kex !== false ? 'warning' : 'neutral'}
                  />
                </div>
                <div className="flex items-center justify-between rounded-md bg-accent/50 px-3 py-2">
                  <span className="text-sm text-foreground">Outdated Version</span>
                  <StatusBadge
                    label={(sshDefaults.data as Record<string, boolean>)?.alert_on_outdated_version !== false ? 'Alert' : 'Ignore'}
                    variant={(sshDefaults.data as Record<string, boolean>)?.alert_on_outdated_version !== false ? 'warning' : 'neutral'}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
