import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { useNseScripts } from '@/features/nse/hooks/useNse'
import { useScanProfileMutations, type ScanPhase } from '../hooks/useProfiles'
import { PhaseCard } from './PhaseCard'

interface ProfileEditModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile?: {
    id: number
    name: string
    description: string
    phases: ScanPhase[] | null
    severity: string | null
    type: 'builtin' | 'custom'
  }
}

const DEFAULT_PHASES: ScanPhase[] = [
  {
    name: 'host_discovery',
    enabled: true,
    tool: 'nmap',
    config: { aggressive: false, max_retries: 2 },
  },
  {
    name: 'port_scan',
    enabled: true,
    tool: 'masscan',
    config: {
      port_range: '1-10000',
      exclude_ports: '',
      aggressive: false,
      max_retries: 3,
    },
  },
  {
    name: 'vulnerability',
    enabled: true,
    tool: 'nmap_nse',
    config: {
      scripts: [] as string[],
      script_args: {},
      aggressive: false,
      parallel: true,
      max_retries: 3,
    },
  },
]

const PHASE_META = {
  host_discovery: {
    label: 'Host Discovery',
    description: 'Find live hosts via ping sweep & ARP',
    tools: [{ value: 'nmap', label: 'Nmap' }],
  },
  port_scan: {
    label: 'Port Scan',
    description: 'Discover open ports on live hosts',
    tools: [
      { value: 'masscan', label: 'Masscan (fast)' },
      { value: 'nmap', label: 'Nmap (accurate)' },
    ],
  },
  vulnerability: {
    label: 'Vulnerability Scan',
    description: 'Run NSE scripts against discovered ports',
    tools: [{ value: 'nmap_nse', label: 'Nmap NSE' }],
  },
} as const

export function ProfileEditModal({
  open,
  onOpenChange,
  profile,
}: ProfileEditModalProps) {
  const { createProfile, updateProfile } = useScanProfileMutations()
  const { data: scriptsData } = useNseScripts()
  const isEdit = Boolean(profile)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState('')
  const [phases, setPhases] = useState<ScanPhase[]>(DEFAULT_PHASES)
  const [submitting, setSubmitting] = useState(false)

  // Script search for vulnerability phase
  const [scriptSearch, setScriptSearch] = useState('')

  // Reset form when modal opens or profile changes
  useEffect(() => {
    if (!open) return
    if (profile) {
      setName(profile.name)
      setDescription(profile.description || '')
      setSeverity(profile.severity || '')
      setPhases(
        profile.phases && profile.phases.length > 0
          ? profile.phases
          : DEFAULT_PHASES,
      )
    } else {
      setName('')
      setDescription('')
      setSeverity('')
      setPhases(DEFAULT_PHASES)
    }
    setScriptSearch('')
  }, [open, profile])

  const updatePhase = useCallback(
    (
      phaseName: string,
      updates: Partial<ScanPhase>,
    ) => {
      setPhases((prev) =>
        prev.map((p) =>
          p.name === phaseName ? { ...p, ...updates } : p,
        ),
      )
    },
    [],
  )

  const handlePhaseToggle = useCallback(
    (phaseName: string, enabled: boolean) => {
      setPhases((prev) => {
        const phaseOrder = ['host_discovery', 'port_scan', 'vulnerability']
        const idx = phaseOrder.indexOf(phaseName)

        if (enabled) {
          // Auto-enable upstream phases
          return prev.map((p) => {
            const pIdx = phaseOrder.indexOf(p.name)
            if (pIdx <= idx && pIdx >= 0) {
              return { ...p, enabled: true }
            }
            return p
          })
        }

        // Disabling: warn but allow
        if (!enabled && idx < phaseOrder.length - 1) {
          toast.warning(
            `Downstream phases may scan the entire CIDR without ${PHASE_META[phaseName as keyof typeof PHASE_META]?.label || phaseName}`,
          )
        }
        return prev.map((p) =>
          p.name === phaseName ? { ...p, enabled: false } : p,
        )
      })
    },
    [],
  )

  const getPhase = (name: string) => phases.find((p) => p.name === name)

  // Script selection for vulnerability phase
  const vulnPhase = getPhase('vulnerability')
  const selectedScripts = new Set(
    ((vulnPhase?.config?.scripts as string[]) || []),
  )

  const allScripts = scriptsData?.scripts || []
  const filteredScripts = scriptSearch
    ? allScripts.filter((s) =>
        s.name.toLowerCase().includes(scriptSearch.toLowerCase()),
      )
    : allScripts

  const toggleScript = (scriptName: string) => {
    const current = new Set(selectedScripts)
    if (current.has(scriptName)) {
      current.delete(scriptName)
    } else {
      current.add(scriptName)
    }
    updatePhase('vulnerability', {
      config: {
        ...vulnPhase?.config,
        scripts: Array.from(current).sort(),
      },
    })
  }

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error('Profile name is required')
      return
    }
    const enabledPhases = phases.filter((p) => p.enabled)
    if (enabledPhases.length === 0) {
      toast.error('At least one phase must be enabled')
      return
    }

    setSubmitting(true)
    try {
      if (isEdit && profile) {
        await updateProfile.mutateAsync({
          id: profile.id,
          name: name.trim(),
          description: description.trim(),
          phases,
          severity: severity || undefined,
        })
        toast.success('Profile updated')
      } else {
        await createProfile.mutateAsync({
          name: name.trim(),
          description: description.trim(),
          phases,
          severity: severity || undefined,
        })
        toast.success('Profile created')
      }
      onOpenChange(false)
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Failed to save profile'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const isReadonly = profile?.type === 'builtin'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Edit Profile' : 'Create Profile'}
          </DialogTitle>
          {isReadonly && (
            <p className="text-xs text-yellow-500">
              System profiles are read-only. Create a copy to customize.
            </p>
          )}
        </DialogHeader>

        <div className="space-y-6">
          {/* Basic info */}
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Profile Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Scan Profile"
                disabled={isReadonly}
              />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What this profile does..."
                rows={2}
                disabled={isReadonly}
              />
            </div>
            <div className="space-y-1">
              <Label>Default Severity</Label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                disabled={isReadonly}
              >
                <option value="">None</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="info">Info</option>
              </select>
            </div>
          </div>

          {/* Scan Phases */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">Scan Phases</h3>
              <span className="text-xs text-muted-foreground">
                {phases.filter((p) => p.enabled).length} of {phases.length}{' '}
                enabled
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {phases.map((phase) => {
                const meta =
                  PHASE_META[phase.name as keyof typeof PHASE_META]
                if (!meta) return null
                return (
                  <PhaseCard
                    key={phase.name}
                    name={phase.name}
                    label={meta.label}
                    description={meta.description}
                    enabled={phase.enabled}
                    tool={phase.tool}
                    config={phase.config}
                    toolOptions={[...meta.tools]}
                    onToggle={(e) => handlePhaseToggle(phase.name, e)}
                    onToolChange={(t) => updatePhase(phase.name, { tool: t })}
                    onConfigChange={(c) =>
                      updatePhase(phase.name, { config: c })
                    }
                  >
                    {/* Port Scan config */}
                    {phase.name === 'port_scan' && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Port Range</Label>
                          <Input
                            value={
                              (phase.config.port_range as string) || ''
                            }
                            onChange={(e) =>
                              updatePhase('port_scan', {
                                config: {
                                  ...phase.config,
                                  port_range: e.target.value,
                                },
                              })
                            }
                            placeholder="1-10000"
                            className="h-7 text-xs"
                            disabled={isReadonly}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Exclude Ports</Label>
                          <Input
                            value={
                              (phase.config.exclude_ports as string) || ''
                            }
                            onChange={(e) =>
                              updatePhase('port_scan', {
                                config: {
                                  ...phase.config,
                                  exclude_ports: e.target.value,
                                },
                              })
                            }
                            placeholder="22,3389"
                            className="h-7 text-xs"
                            disabled={isReadonly}
                          />
                        </div>
                      </div>
                    )}

                    {/* Vulnerability config — script picker */}
                    {phase.name === 'vulnerability' && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="vuln-parallel"
                            checked={
                              (phase.config.parallel as boolean) ?? true
                            }
                            onCheckedChange={(c) =>
                              updatePhase('vulnerability', {
                                config: {
                                  ...phase.config,
                                  parallel: c === true,
                                },
                              })
                            }
                            disabled={isReadonly}
                          />
                          <label
                            htmlFor="vuln-parallel"
                            className="text-xs cursor-pointer"
                          >
                            Parallel Execution
                          </label>
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs">
                              NSE Scripts ({selectedScripts.size} selected)
                            </Label>
                          </div>
                          <Input
                            value={scriptSearch}
                            onChange={(e) =>
                              setScriptSearch(e.target.value)
                            }
                            placeholder="Search scripts..."
                            className="h-7 text-xs"
                          />
                          <div className="max-h-48 overflow-y-auto border rounded-md p-1 space-y-0.5">
                            {filteredScripts.slice(0, 200).map((s) => (
                              <label
                                key={s.name}
                                className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/50 cursor-pointer text-xs"
                              >
                                <Checkbox
                                  checked={selectedScripts.has(s.name)}
                                  onCheckedChange={() =>
                                    toggleScript(s.name)
                                  }
                                  disabled={isReadonly}
                                />
                                <span className="truncate">{s.name}</span>
                              </label>
                            ))}
                            {filteredScripts.length === 0 && (
                              <p className="text-xs text-muted-foreground text-center py-4">
                                No scripts found
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </PhaseCard>
                )
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          {!isReadonly && (
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting
                ? 'Saving...'
                : isEdit
                  ? 'Update Profile'
                  : 'Create Profile'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
