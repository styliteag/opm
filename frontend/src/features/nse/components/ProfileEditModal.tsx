import { useState, useMemo, useEffect } from 'react'
import { toast } from 'sonner'
import { Search, ChevronRight, ChevronDown } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useNseMutations, useNseScripts } from '@/features/nse/hooks/useNse'

interface ProfileEditModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile?: {
    id: number
    name: string
    description: string | null
    severity: string | null
    nse_scripts: string[]
  }
}

/** Extract a group prefix from a script name (e.g. "smb" from "smb-vuln-ms17-010"). */
function getPrefix(name: string): string {
  const idx = name.indexOf('-')
  return idx > 0 ? name.slice(0, idx) : 'other'
}

/** Group scripts by prefix, sorted by group name. */
function groupScripts(names: string[]): { group: string; scripts: string[] }[] {
  const map = new Map<string, string[]>()
  for (const name of names) {
    const prefix = getPrefix(name)
    const list = map.get(prefix) ?? []
    list.push(name)
    map.set(prefix, list)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, scripts]) => ({ group, scripts: scripts.sort() }))
}

export function ProfileEditModal({ open, onOpenChange, profile }: ProfileEditModalProps) {
  const { createProfile, updateProfile } = useNseMutations()
  const { data: scriptsData } = useNseScripts()
  const isEdit = Boolean(profile)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState('')
  const [selectedScripts, setSelectedScripts] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  // Reset form when modal opens/profile changes
  useEffect(() => {
    if (open) {
      if (profile) {
        setName(profile.name)
        setDescription(profile.description ?? '')
        setSeverity(profile.severity ?? '')
        setSelectedScripts(new Set(profile.nse_scripts))
      } else {
        setName('')
        setDescription('')
        setSeverity('')
        setSelectedScripts(new Set())
      }
      setSearch('')
      setExpandedGroups(new Set())
    }
  }, [open, profile])

  // Expand groups that have selected scripts when editing
  useEffect(() => {
    if (open && profile && profile.nse_scripts.length > 0) {
      const prefixes = new Set(profile.nse_scripts.map(getPrefix))
      setExpandedGroups(prefixes)
    }
  }, [open, profile])

  const allScriptNames = useMemo(
    () => (scriptsData?.scripts ?? []).map((s) => s.name),
    [scriptsData],
  )

  const filteredNames = useMemo(() => {
    if (!search) return allScriptNames
    const q = search.toLowerCase()
    return allScriptNames.filter((n) => n.toLowerCase().includes(q))
  }, [allScriptNames, search])

  const grouped = useMemo(() => groupScripts(filteredNames), [filteredNames])

  const toggleScript = (name: string) => {
    setSelectedScripts((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const toggleGroup = (_group: string, scripts: string[]) => {
    setSelectedScripts((prev) => {
      const next = new Set(prev)
      const allSelected = scripts.every((s) => next.has(s))
      if (allSelected) {
        scripts.forEach((s) => next.delete(s))
      } else {
        scripts.forEach((s) => next.add(s))
      }
      return next
    })
  }

  const toggleExpand = (group: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      toast.error('Name is required')
      return
    }
    if (selectedScripts.size === 0) {
      toast.error('Select at least one script')
      return
    }

    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
      severity: severity || undefined,
      nse_scripts: Array.from(selectedScripts).sort(),
    }

    if (isEdit && profile) {
      updateProfile.mutate(
        { id: profile.id, ...payload },
        {
          onSuccess: () => {
            toast.success('Profile updated')
            onOpenChange(false)
          },
          onError: (err) => toast.error(err.message),
        },
      )
    } else {
      createProfile.mutate(payload, {
        onSuccess: () => {
          toast.success('Profile created')
          onOpenChange(false)
        },
        onError: (err) => toast.error(err.message),
      })
    }
  }

  const selectClass =
    'w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Profile' : 'Create Profile'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-2 min-h-0">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="profile-name">Name</Label>
              <Input
                id="profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full Vulnerability Scan"
              />
            </div>
            <div>
              <Label htmlFor="profile-severity">Default Severity</Label>
              <select
                id="profile-severity"
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                className={selectClass}
              >
                <option value="">None</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="info">Info</option>
              </select>
            </div>
          </div>
          <div>
            <Label htmlFor="profile-description">Description</Label>
            <Textarea
              id="profile-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this profile scans for"
              rows={2}
            />
          </div>

          {/* Script Picker */}
          <div className="flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2">
              <Label>
                Scripts
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {selectedScripts.size} selected
                </span>
              </Label>
            </div>
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Filter scripts..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="overflow-y-auto rounded-md border border-border bg-background max-h-[300px]">
              {grouped.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground text-center">No scripts found</p>
              ) : (
                grouped.map(({ group, scripts }) => {
                  const isExpanded = expandedGroups.has(group)
                  const selectedInGroup = scripts.filter((s) => selectedScripts.has(s)).length
                  const allSelected = selectedInGroup === scripts.length

                  return (
                    <div key={group} className="border-b border-border last:border-b-0">
                      {/* Group header */}
                      <div className="flex items-center gap-2 px-3 py-2 hover:bg-accent/50 cursor-pointer select-none">
                        <button
                          type="button"
                          onClick={() => toggleExpand(group)}
                          className="flex items-center gap-2 flex-1 text-left"
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          )}
                          <span className="text-sm font-medium text-foreground">{group}-*</span>
                          <span className="text-xs text-muted-foreground">
                            {scripts.length} script{scripts.length !== 1 ? 's' : ''}
                          </span>
                        </button>
                        <div className="flex items-center gap-2">
                          {selectedInGroup > 0 && (
                            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                              {selectedInGroup}
                            </span>
                          )}
                          <Checkbox
                            checked={allSelected}
                            onCheckedChange={() => toggleGroup(group, scripts)}
                          />
                        </div>
                      </div>

                      {/* Individual scripts */}
                      {isExpanded && (
                        <div className="border-t border-border/50 bg-accent/20">
                          {scripts.map((scriptName) => (
                            <label
                              key={scriptName}
                              className="flex items-center gap-2.5 px-3 py-1.5 pl-9 hover:bg-accent/50 cursor-pointer"
                            >
                              <Checkbox
                                checked={selectedScripts.has(scriptName)}
                                onCheckedChange={() => toggleScript(scriptName)}
                              />
                              <span className="font-mono text-xs text-foreground">{scriptName}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createProfile.isPending || updateProfile.isPending}>
              {(createProfile.isPending || updateProfile.isPending)
                ? 'Saving...'
                : isEdit ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
