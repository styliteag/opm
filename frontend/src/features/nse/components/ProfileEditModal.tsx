import { useState, useMemo, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Search, ChevronRight, ChevronDown, CheckSquare, Square } from 'lucide-react'

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

type FilterMode = 'all' | 'selected' | 'unselected'

interface ScriptItem {
  name: string
  author: string
  protocol: string
  tags: string[]
}

/** Extract protocol prefix from a script name (e.g. "smb" from "smb-vuln-ms17-010"). */
function getProtocol(name: string): string {
  const idx = name.indexOf('-')
  return idx > 0 ? name.slice(0, idx) : '*'
}

/** Build ScriptItem list from API data. */
function buildScriptItems(
  scripts: { name: string; categories?: string[]; author?: string }[],
): ScriptItem[] {
  return scripts.map((s) => ({
    name: s.name,
    author: s.author || 'System',
    protocol: getProtocol(s.name),
    tags: s.categories ?? [],
  }))
}

/** Group scripts by protocol, sorted by protocol name. */
function groupByProtocol(
  items: ScriptItem[],
): { protocol: string; scripts: ScriptItem[] }[] {
  const map = new Map<string, ScriptItem[]>()
  for (const item of items) {
    const list = map.get(item.protocol) ?? []
    list.push(item)
    map.set(item.protocol, list)
  }
  // Sort: '*' first, then alphabetical
  return Array.from(map.entries())
    .sort(([a], [b]) => {
      if (a === '*') return -1
      if (b === '*') return 1
      return a.localeCompare(b)
    })
    .map(([protocol, scripts]) => ({
      protocol,
      scripts: scripts.sort((a, b) => a.name.localeCompare(b.name)),
    }))
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
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [groupByProto, setGroupByProto] = useState(true)
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
      setFilterMode('all')
      setExpandedGroups(new Set())
    }
  }, [open, profile])

  // Expand groups that have selected scripts when editing
  useEffect(() => {
    if (open && profile && profile.nse_scripts.length > 0) {
      const prefixes = new Set(profile.nse_scripts.map(getProtocol))
      setExpandedGroups(prefixes)
    }
  }, [open, profile])

  const allItems = useMemo(
    () => buildScriptItems(scriptsData?.scripts ?? []),
    [scriptsData],
  )

  const totalCount = allItems.length

  // Filter by search + filter mode
  const filteredItems = useMemo(() => {
    let items = allItems
    if (search) {
      const q = search.toLowerCase()
      items = items.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.author.toLowerCase().includes(q) ||
          s.protocol.toLowerCase().includes(q) ||
          s.tags.some((t) => t.toLowerCase().includes(q)),
      )
    }
    if (filterMode === 'selected') {
      items = items.filter((s) => selectedScripts.has(s.name))
    } else if (filterMode === 'unselected') {
      items = items.filter((s) => !selectedScripts.has(s.name))
    }
    return items
  }, [allItems, search, filterMode, selectedScripts])

  const grouped = useMemo(() => groupByProtocol(filteredItems), [filteredItems])

  const toggleScript = useCallback((scriptName: string) => {
    setSelectedScripts((prev) => {
      const next = new Set(prev)
      if (next.has(scriptName)) next.delete(scriptName)
      else next.add(scriptName)
      return next
    })
  }, [])

  const toggleGroup = useCallback((scripts: ScriptItem[]) => {
    setSelectedScripts((prev) => {
      const next = new Set(prev)
      const allSelected = scripts.every((s) => next.has(s.name))
      if (allSelected) {
        scripts.forEach((s) => next.delete(s.name))
      } else {
        scripts.forEach((s) => next.add(s.name))
      }
      return next
    })
  }, [])

  const toggleExpand = useCallback((protocol: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(protocol)) next.delete(protocol)
      else next.add(protocol)
      return next
    })
  }, [])

  const expandAll = useCallback(() => {
    setExpandedGroups(new Set(grouped.map((g) => g.protocol)))
  }, [grouped])

  const collapseAll = useCallback(() => {
    setExpandedGroups(new Set())
  }, [])

  const selectAll = useCallback(() => {
    setSelectedScripts(new Set(allItems.map((s) => s.name)))
  }, [allItems])

  const clearAll = useCallback(() => {
    setSelectedScripts(new Set())
  }, [])

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
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
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
                placeholder="My Scan Profile"
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

          {/* ── NSE Script Picker ── */}
          <div className="flex flex-col min-h-0">
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
              <div>
                <span className="text-sm font-semibold text-foreground">
                  NSE Scripts ({selectedScripts.size} of {totalCount} selected)
                </span>
                <p className="text-xs text-muted-foreground">
                  Choose which NSE scripts to include in this profile
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={selectAll}
                  className="h-7 text-xs gap-1"
                >
                  <CheckSquare className="h-3 w-3" />
                  Select All
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={clearAll}
                  className="h-7 text-xs gap-1"
                >
                  <Square className="h-3 w-3" />
                  Clear
                </Button>
              </div>
            </div>

            {/* Search + Filter Tabs */}
            <div className="flex items-center gap-2 mb-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search scripts by name, description, tags, or author..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="flex rounded-md border border-border overflow-hidden shrink-0">
                {(['all', 'selected', 'unselected'] as FilterMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setFilterMode(mode)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      filterMode === mode
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background text-muted-foreground hover:text-foreground'
                    } ${mode !== 'all' ? 'border-l border-border' : ''}`}
                  >
                    {mode === 'all'
                      ? 'All'
                      : mode === 'selected'
                        ? `Selected (${selectedScripts.size})`
                        : 'Unselected'}
                  </button>
                ))}
              </div>
            </div>

            {/* Group by protocol toggle + Expand/Collapse */}
            <div className="flex items-center justify-between mb-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={groupByProto}
                  onCheckedChange={(checked) => setGroupByProto(checked === true)}
                />
                <span className="text-sm text-foreground">Group by protocol</span>
              </label>
              {groupByProto && (
                <div className="flex items-center gap-3 text-xs">
                  <button
                    type="button"
                    onClick={expandAll}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Expand All
                  </button>
                  <button
                    type="button"
                    onClick={collapseAll}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Collapse All
                  </button>
                </div>
              )}
            </div>

            {/* Script List */}
            <div className="overflow-y-auto rounded-md border border-border bg-background max-h-[320px]">
              {filteredItems.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground text-center">
                  No scripts found
                </p>
              ) : groupByProto ? (
                // ── Grouped view ──
                grouped.map(({ protocol, scripts }) => {
                  const isExpanded = expandedGroups.has(protocol)
                  const selectedInGroup = scripts.filter((s) =>
                    selectedScripts.has(s.name),
                  ).length
                  const allSelected = selectedInGroup === scripts.length
                  const someSelected = selectedInGroup > 0 && !allSelected

                  return (
                    <div
                      key={protocol}
                      className="border-b border-border last:border-b-0"
                    >
                      {/* Group header */}
                      <div className="flex items-center gap-2 px-3 py-2 hover:bg-accent/50 cursor-pointer select-none">
                        <button
                          type="button"
                          onClick={() => toggleExpand(protocol)}
                          className="shrink-0"
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </button>
                        <Checkbox
                          checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                          onCheckedChange={() => toggleGroup(scripts)}
                        />
                        <button
                          type="button"
                          onClick={() => toggleExpand(protocol)}
                          className="flex items-center gap-2 flex-1 text-left"
                        >
                          <span className="text-xs font-medium text-primary">
                            {protocol}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {scripts.length} script{scripts.length !== 1 ? 's' : ''}
                          </span>
                          {selectedInGroup > 0 && (
                            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                              {selectedInGroup} selected
                            </span>
                          )}
                        </button>
                        <span className="text-[10px] text-muted-foreground">
                          {isExpanded ? 'Click to collapse' : 'Click to expand'}
                        </span>
                      </div>

                      {/* Scripts table */}
                      {isExpanded && (
                        <div className="border-t border-border/50">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b border-border/50 bg-accent/30">
                                <th className="w-10 px-3 py-1.5" />
                                <th className="px-3 py-1.5 text-left text-xs font-semibold text-foreground">
                                  Name
                                </th>
                                <th className="px-3 py-1.5 text-left text-xs font-semibold text-foreground">
                                  Author
                                </th>
                                <th className="px-3 py-1.5 text-left text-xs font-semibold text-foreground">
                                  Protocol
                                </th>
                                <th className="px-3 py-1.5 text-left text-xs font-semibold text-foreground">
                                  Tags
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {scripts.map((script) => (
                                <tr
                                  key={script.name}
                                  onClick={() => toggleScript(script.name)}
                                  className="border-b border-border/30 last:border-b-0 hover:bg-accent/40 cursor-pointer"
                                >
                                  <td className="px-3 py-1.5">
                                    <Checkbox
                                      checked={selectedScripts.has(script.name)}
                                      onCheckedChange={() =>
                                        toggleScript(script.name)
                                      }
                                    />
                                  </td>
                                  <td className="px-3 py-1.5 text-xs text-foreground">
                                    {script.name}
                                  </td>
                                  <td className="px-3 py-1.5 text-xs text-muted-foreground">
                                    {script.author}
                                  </td>
                                  <td className="px-3 py-1.5">
                                    <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                                      {script.protocol}
                                    </span>
                                  </td>
                                  <td className="px-3 py-1.5">
                                    {script.tags.length > 0 ? (
                                      <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                                        {script.tags[0]}
                                      </span>
                                    ) : (
                                      <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                                        {script.protocol}
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )
                })
              ) : (
                // ── Flat view ──
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-accent/30 sticky top-0">
                      <th className="w-10 px-3 py-1.5" />
                      <th className="px-3 py-1.5 text-left text-xs font-semibold text-foreground">
                        Name
                      </th>
                      <th className="px-3 py-1.5 text-left text-xs font-semibold text-foreground">
                        Author
                      </th>
                      <th className="px-3 py-1.5 text-left text-xs font-semibold text-foreground">
                        Protocol
                      </th>
                      <th className="px-3 py-1.5 text-left text-xs font-semibold text-foreground">
                        Tags
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((script) => (
                        <tr
                          key={script.name}
                          onClick={() => toggleScript(script.name)}
                          className="border-b border-border/30 last:border-b-0 hover:bg-accent/40 cursor-pointer"
                        >
                          <td className="px-3 py-1.5">
                            <Checkbox
                              checked={selectedScripts.has(script.name)}
                              onCheckedChange={() => toggleScript(script.name)}
                            />
                          </td>
                          <td className="px-3 py-1.5 text-xs text-foreground">
                            {script.name}
                          </td>
                          <td className="px-3 py-1.5 text-xs text-muted-foreground">
                            {script.author}
                          </td>
                          <td className="px-3 py-1.5">
                            <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                              {script.protocol}
                            </span>
                          </td>
                          <td className="px-3 py-1.5">
                            {script.tags.length > 0 ? (
                              <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                                {script.tags[0]}
                              </span>
                            ) : (
                              <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                                {script.protocol}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer count */}
            <p className="mt-1.5 text-xs text-muted-foreground">
              {selectedScripts.size} scripts selected
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createProfile.isPending || updateProfile.isPending}>
              {(createProfile.isPending || updateProfile.isPending)
                ? 'Saving...'
                : isEdit
                  ? 'Update'
                  : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
