import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { LoadingState } from '@/components/data-display/LoadingState'
import { ErrorState } from '@/components/data-display/ErrorState'
import {
  useLibraryEntryXml,
  useLibraryMutations,
} from '@/features/gvm-library/hooks/useGvmLibrary'
import {
  countPorts,
  parsePortListXml,
  rangesToString,
  serializePortListXml,
  stringToRanges,
  type PortRange,
} from '@/features/gvm-library/utils/xml-parsers'
import type { GvmLibraryEntry } from '@/lib/types'

export type PortListEditorMode = 'view' | 'edit' | 'new'

interface PortListEditorProps {
  entry: GvmLibraryEntry | null // null when creating a new one
  mode: PortListEditorMode
  onClose: () => void
}

interface EditorState {
  name: string
  comment: string
  tcpInput: string
  udpInput: string
}

const EMPTY: EditorState = {
  name: '',
  comment: '',
  tcpInput: '',
  udpInput: '',
}

const COMMON_PRESETS: Array<[string, string, string]> = [
  ['Well-known', '1-1023', '1-1023'],
  ['TCP web', '80,443,8080,8443', ''],
  ['Nmap top 100 (approx)', '7,9,13,21-23,25-26,37,53,79-81,88,106,110-111,113,119,135,139,143-144,179,199,389,427,443-445,465,513-515,543-544,548,554,587,631,646,873,990,993,995,1025-1029,1110,1433,1720,1723,1755,1900,2000-2001,2049,2121,2717,3000,3128,3306,3389,3986,4899,5000,5009,5051,5060,5101,5190,5357,5432,5631,5666,5800,5900,6000-6001,6646,7070,8000,8008-8009,8080-8081,8443,8888,9100,9999-10000,32768,49152-49157', '53,67-69,123,135,137-139,161-162,445,500,514,520,631,1434,1900,4500,49152-49154'],
  ['IANA registered TCP/UDP (1-1023)', '1-1023', '1-1023'],
  ['All TCP', '1-65535', ''],
  ['All TCP/UDP', '1-65535', '1-65535'],
]

export function PortListEditor({ entry, mode, onClose }: PortListEditorProps) {
  const { data: xml, isLoading, error, refetch } = useLibraryEntryXml(
    mode === 'new' ? null : (entry?.id ?? null),
  )
  const { upload } = useLibraryMutations()

  const [state, setState] = useState<EditorState>(EMPTY)
  const [saving, setSaving] = useState(false)

  // Load parsed state when XML becomes available or when switching to 'new'.
  useEffect(() => {
    if (mode === 'new') {
      setState(EMPTY)
      return
    }
    if (!xml) return
    try {
      const parsed = parsePortListXml(xml)
      setState({
        name: parsed.name,
        comment: parsed.comment,
        tcpInput: rangesToString(parsed.tcp),
        udpInput: rangesToString(parsed.udp),
      })
    } catch (err) {
      console.error('parsePortListXml failed', err)
      toast.error(err instanceof Error ? err.message : 'Parse error')
    }
  }, [xml, mode])

  const tcpParsed = useSafeParse(state.tcpInput)
  const udpParsed = useSafeParse(state.udpInput)

  const readOnly = mode === 'view'

  const handleSave = async () => {
    if (!state.name.trim()) {
      toast.error('Name is required')
      return
    }
    if (tcpParsed.error) {
      toast.error(`TCP: ${tcpParsed.error}`)
      return
    }
    if (udpParsed.error) {
      toast.error(`UDP: ${udpParsed.error}`)
      return
    }
    if (tcpParsed.ranges.length + udpParsed.ranges.length === 0) {
      toast.error('At least one TCP or UDP port range is required')
      return
    }

    setSaving(true)
    try {
      const xmlStr = serializePortListXml({
        name: state.name.trim(),
        comment: state.comment,
        tcp: tcpParsed.ranges,
        udp: udpParsed.ranges,
      })
      const file = new File([xmlStr], `${sanitize(state.name)}.xml`, {
        type: 'application/xml',
      })
      await upload.mutateAsync({ kind: 'port_list', file })
      toast.success(`Saved port list "${state.name.trim()}"`)
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const applyPreset = (tcp: string, udp: string) => {
    setState((s) => ({ ...s, tcpInput: tcp, udpInput: udp }))
  }

  const title =
    mode === 'new'
      ? 'New Port List'
      : mode === 'edit'
        ? `Edit Port List · ${entry?.name ?? ''}`
        : `Port List · ${entry?.name ?? ''}`

  const description =
    mode === 'view'
      ? 'Read-only view. Ranges are normalized and merged.'
      : mode === 'edit'
        ? 'Changing the name will create a new entry. Keep the name to overwrite.'
        : 'Define TCP and UDP ranges. Use comma-separated ports and X-Y for ranges.'

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {isLoading && <LoadingState rows={3} />}
        {error && <ErrorState message={error.message} onRetry={refetch} />}

        {(!isLoading && !error) || mode === 'new' ? (
          <div className="flex-1 overflow-y-auto space-y-4 p-1">
            {/* Name + comment */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="port-list-name">Name</Label>
                <Input
                  id="port-list-name"
                  value={state.name}
                  disabled={readOnly || mode === 'edit'}
                  onChange={(e) =>
                    setState((s) => ({ ...s, name: e.target.value }))
                  }
                  placeholder="e.g. My Custom Ports"
                />
                {mode === 'edit' && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Name is the unique key — editing is disabled. Duplicate as
                    new instead.
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="port-list-comment">Comment</Label>
                <Input
                  id="port-list-comment"
                  value={state.comment}
                  disabled={readOnly}
                  onChange={(e) =>
                    setState((s) => ({ ...s, comment: e.target.value }))
                  }
                  placeholder="Optional description"
                />
              </div>
            </div>

            {/* Presets */}
            {!readOnly && (
              <div className="rounded-md border border-border bg-muted/20 p-3">
                <p className="mb-2 text-xs font-emphasis text-muted-foreground uppercase tracking-wide">
                  Presets
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {COMMON_PRESETS.map(([label, tcp, udp]) => (
                    <Button
                      key={label}
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => applyPreset(tcp, udp)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Side-by-side TCP / UDP editor */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <PortColumn
                title="TCP"
                accent="text-sky-400"
                input={state.tcpInput}
                parsed={tcpParsed}
                readOnly={readOnly}
                onChange={(v) =>
                  setState((s) => ({ ...s, tcpInput: v }))
                }
              />
              <PortColumn
                title="UDP"
                accent="text-violet-400"
                input={state.udpInput}
                parsed={udpParsed}
                readOnly={readOnly}
                onChange={(v) =>
                  setState((s) => ({ ...s, udpInput: v }))
                }
              />
            </div>

            <div className="text-xs text-muted-foreground">
              Total ports:{' '}
              <span className="text-foreground font-emphasis">
                {countPorts(tcpParsed.ranges) + countPorts(udpParsed.ranges)}
              </span>{' '}
              ({tcpParsed.ranges.length + udpParsed.ranges.length} range
              {tcpParsed.ranges.length + udpParsed.ranges.length === 1
                ? ''
                : 's'}
              )
            </div>
          </div>
        ) : null}

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button variant="outline" onClick={onClose}>
            {readOnly ? 'Close' : 'Cancel'}
          </Button>
          {!readOnly && (
            <Button
              onClick={handleSave}
              disabled={
                saving ||
                !!tcpParsed.error ||
                !!udpParsed.error ||
                !state.name.trim()
              }
            >
              {saving ? 'Saving…' : mode === 'new' ? 'Create' : 'Save'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* -------------------------------------------------------------------- */

interface ParsedInput {
  ranges: PortRange[]
  error: string | null
}

function useSafeParse(input: string): ParsedInput {
  return useMemo(() => {
    if (!input.trim()) return { ranges: [], error: null }
    try {
      return { ranges: stringToRanges(input), error: null }
    } catch (err) {
      return {
        ranges: [],
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }, [input])
}

interface PortColumnProps {
  title: string
  accent: string
  input: string
  parsed: ParsedInput
  readOnly: boolean
  onChange: (value: string) => void
}

function PortColumn({
  title,
  accent,
  input,
  parsed,
  readOnly,
  onChange,
}: PortColumnProps) {
  const normalized = rangesToString(parsed.ranges)
  const portTotal = countPorts(parsed.ranges)

  return (
    <div className="rounded-md border border-border bg-card/40 p-3 space-y-2">
      <div className="flex items-baseline justify-between">
        <h3 className={`text-sm font-strong ${accent}`}>{title}</h3>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {parsed.ranges.length} range{parsed.ranges.length === 1 ? '' : 's'} ·{' '}
          {portTotal} port{portTotal === 1 ? '' : 's'}
        </span>
      </div>
      <Textarea
        rows={4}
        value={input}
        disabled={readOnly}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. 22,80,443,1000-2000"
        className={`font-mono text-xs ${parsed.error ? 'border-destructive' : ''}`}
      />
      {parsed.error ? (
        <p className="text-[11px] text-destructive">{parsed.error}</p>
      ) : normalized && normalized !== input.trim() && !readOnly ? (
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="text-muted-foreground">
            Normalized: <code className="text-foreground">{normalized}</code>
          </span>
          <button
            type="button"
            onClick={() => onChange(normalized)}
            className="rounded border border-border px-2 py-0.5 text-[10px] hover:bg-muted"
          >
            Apply
          </button>
        </div>
      ) : null}

      {parsed.ranges.length > 0 && (
        <div className="max-h-40 overflow-y-auto rounded border border-border/50 bg-muted/20">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="px-2 py-1 text-left font-emphasis">Start</th>
                <th className="px-2 py-1 text-left font-emphasis">End</th>
                <th className="px-2 py-1 text-right font-emphasis">Count</th>
              </tr>
            </thead>
            <tbody>
              {parsed.ranges.map((r, i) => (
                <tr
                  key={i}
                  className="border-t border-border/40 first:border-0"
                >
                  <td className="px-2 py-0.5 tabular-nums">{r.start}</td>
                  <td className="px-2 py-0.5 tabular-nums">{r.end}</td>
                  <td className="px-2 py-0.5 text-right tabular-nums text-muted-foreground">
                    {r.end - r.start + 1}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_') || 'port_list'
}
