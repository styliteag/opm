import { useMemo, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Plus, Copy, Trash2, FileCode, Pencil } from 'lucide-react'
import { toast } from 'sonner'

import { LoadingState } from '@/components/data-display/LoadingState'
import { ErrorState } from '@/components/data-display/ErrorState'
import { EmptyState } from '@/components/data-display/EmptyState'
import { SeverityBadge } from '@/components/data-display/SeverityBadge'
import { StatusBadge } from '@/components/data-display/StatusBadge'
import {
  useScanProfiles,
  useScanProfileMutations,
  type ScanProfile,
  type ScanPhase,
} from '@/features/profiles/hooks/useProfiles'
import { ProfileEditModal } from '@/features/profiles/components/ProfileEditModal'

export const Route = createFileRoute('/_authenticated/nse/profiles')({
  component: NseProfilesPage,
})

const CATEGORY_LABELS: Record<string, string> = {
  scan_profiles: 'Scan Profiles',
  smb: 'SMB',
  web: 'Web Application',
  ssl: 'SSL / TLS',
  credentials: 'Credentials & Access',
  network: 'Network Services',
  reconnaissance: 'Reconnaissance',
}

const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS)

function getPhasesSummary(phases: ScanPhase[] | null): string {
  if (!phases || phases.length === 0) return 'No phases configured'
  const enabled = phases.filter((p) => p.enabled)
  const labels: Record<string, string> = {
    host_discovery: 'Discovery',
    port_scan: 'Port Scan',
    vulnerability: 'Vuln Scan',
  }
  return enabled.map((p) => labels[p.name] || p.name).join(' → ')
}

function getScriptCount(phases: ScanPhase[] | null): number {
  if (!phases) return 0
  const vuln = phases.find((p) => p.name === 'vulnerability')
  if (!vuln) return 0
  const scripts = vuln.config?.scripts as string[] | undefined
  return scripts?.length ?? 0
}

function NseProfilesPage() {
  const [createOpen, setCreateOpen] = useState(false)
  const [editProfile, setEditProfile] = useState<ScanProfile | undefined>()
  const { data, isLoading, error, refetch } = useScanProfiles()
  const { cloneProfile, deleteProfile } = useScanProfileMutations()

  const grouped = useMemo(() => {
    const profiles = data?.profiles ?? []
    const groups = new Map<string, ScanProfile[]>()

    for (const profile of profiles) {
      const key = profile.category ?? 'other'
      const list = groups.get(key)
      if (list) {
        list.push(profile)
      } else {
        groups.set(key, [profile])
      }
    }

    return [...groups.entries()].sort(([a], [b]) => {
      const ai = CATEGORY_ORDER.indexOf(a)
      const bi = CATEGORY_ORDER.indexOf(b)
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    })
  }, [data?.profiles])

  if (isLoading) return <LoadingState rows={6} />
  if (error) return <ErrorState message={error.message} onRetry={refetch} />

  const profiles = data?.profiles ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Scan Profiles
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage multi-phase scan profiles for network discovery and
            vulnerability scanning.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/nse/library"
            className="flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <FileCode className="h-4 w-4" />
            Script Library
          </Link>
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create Profile
          </button>
        </div>
      </div>

      {profiles.length === 0 ? (
        <EmptyState
          title="No profiles"
          message="Create your first scan profile to start."
          icon={FileCode}
        />
      ) : (
        <div className="space-y-8">
          {grouped.map(([category, categoryProfiles]) => (
            <section key={category}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {CATEGORY_LABELS[category] ?? category}
              </h2>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {categoryProfiles.map((profile) => (
                  <div
                    key={profile.id}
                    className="rounded-lg border border-border bg-card p-5"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-display text-base font-semibold text-foreground">
                            {profile.name}
                          </h3>
                          <StatusBadge
                            label={profile.type}
                            variant={
                              profile.type === 'builtin'
                                ? 'neutral'
                                : 'success'
                            }
                          />
                        </div>
                        {profile.description && (
                          <p className="mt-1 text-sm text-muted-foreground">
                            {profile.description}
                          </p>
                        )}
                      </div>
                      {profile.severity && (
                        <SeverityBadge
                          severity={
                            profile.severity as
                              | 'critical'
                              | 'high'
                              | 'medium'
                              | 'info'
                          }
                        />
                      )}
                    </div>

                    <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{getPhasesSummary(profile.phases)}</span>
                      <span>
                        {getScriptCount(profile.phases)} scripts
                      </span>
                    </div>

                    <div className="mt-4 flex items-center gap-2">
                      <button
                        onClick={() => setEditProfile(profile)}
                        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                      >
                        <Pencil className="h-3 w-3" />
                        {profile.type === 'builtin' ? 'View' : 'Edit'}
                      </button>
                      <button
                        onClick={() =>
                          cloneProfile.mutate(
                            {
                              id: profile.id,
                              name: `Copy of ${profile.name}`,
                            },
                            {
                              onSuccess: () =>
                                toast.success('Profile duplicated'),
                              onError: (e) => toast.error(e.message),
                            },
                          )
                        }
                        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                      >
                        <Copy className="h-3 w-3" />
                        Duplicate
                      </button>
                      {profile.type === 'custom' && (
                        <button
                          onClick={() =>
                            deleteProfile.mutate(profile.id, {
                              onSuccess: () =>
                                toast.success('Profile deleted'),
                              onError: (e) => toast.error(e.message),
                            })
                          }
                          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-red-400 hover:bg-accent/50 transition-colors"
                        >
                          <Trash2 className="h-3 w-3" />
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <ProfileEditModal
        open={createOpen || Boolean(editProfile)}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false)
            setEditProfile(undefined)
          }
        }}
        profile={editProfile}
      />
    </div>
  )
}
