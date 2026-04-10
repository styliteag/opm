import { useMemo, useState } from 'react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { LoadingState } from '@/components/data-display/LoadingState'
import { ErrorState } from '@/components/data-display/ErrorState'
import { useLibraryEntryXml } from '@/features/gvm-library/hooks/useGvmLibrary'
import {
  parseScanConfigXml,
  type ParsedScanConfig,
} from '@/features/gvm-library/utils/xml-parsers'
import type { GvmLibraryEntry } from '@/lib/types'

interface ScanConfigViewerProps {
  entry: GvmLibraryEntry | null
  onClose: () => void
}

type Tab = 'overview' | 'families' | 'preferences' | 'selectors'

export function ScanConfigViewer({ entry, onClose }: ScanConfigViewerProps) {
  const [tab, setTab] = useState<Tab>('overview')
  const { data: xml, isLoading, error, refetch } = useLibraryEntryXml(
    entry?.id ?? null,
  )

  const parsed = useMemo<ParsedScanConfig | null>(() => {
    if (!xml) return null
    try {
      return parseScanConfigXml(xml)
    } catch (err) {
      console.error('parseScanConfigXml failed', err)
      return null
    }
  }, [xml])

  const parseError = useMemo(() => {
    if (!xml) return null
    try {
      parseScanConfigXml(xml)
      return null
    } catch (err) {
      return err instanceof Error ? err.message : String(err)
    }
  }, [xml])

  return (
    <Dialog open={entry !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Scan Config · {entry?.name}</DialogTitle>
          <DialogDescription>
            Read-only overview of the uploaded scan configuration XML.
          </DialogDescription>
        </DialogHeader>

        {isLoading && <LoadingState rows={4} />}
        {error && <ErrorState message={error.message} onRetry={refetch} />}
        {parseError && (
          <ErrorState message={`Parse error: ${parseError}`} />
        )}

        {parsed && (
          <>
            <div className="flex gap-1 border-b border-border">
              {(
                [
                  ['overview', 'Overview'],
                  ['families', `Families (${parsed.families.length})`],
                  [
                    'preferences',
                    `Preferences (${parsed.preferences.length})`,
                  ],
                  [
                    'selectors',
                    `NVT Selectors (${parsed.nvt_selectors.length})`,
                  ],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`px-3 py-2 text-xs font-emphasis transition-colors ${
                    tab === key
                      ? 'text-foreground border-b-2 border-primary -mb-px'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto">
              {tab === 'overview' && <OverviewTab parsed={parsed} />}
              {tab === 'families' && <FamiliesTab parsed={parsed} />}
              {tab === 'preferences' && <PreferencesTab parsed={parsed} />}
              {tab === 'selectors' && <SelectorsTab parsed={parsed} />}
            </div>
          </>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ----- Tabs -------------------------------------------------------- */

function OverviewTab({ parsed }: { parsed: ParsedScanConfig }) {
  return (
    <div className="space-y-4 p-1">
      <DescriptionGrid
        items={[
          ['Name', parsed.name],
          ['Comment', parsed.comment || '—'],
          ['GVM Config ID', parsed.id ?? '—'],
          ['Type', parsed.type ?? '—'],
          ['Usage', parsed.usage_type ?? '—'],
          [
            'Family count',
            parsed.family_count !== null
              ? `${parsed.family_count}${parsed.family_count_growing ? ' (growing)' : ''}`
              : '—',
          ],
          [
            'NVT count',
            parsed.nvt_count !== null
              ? `${parsed.nvt_count}${parsed.nvt_count_growing ? ' (growing)' : ''}`
              : '—',
          ],
          ['Families loaded', String(parsed.families.length)],
          ['Preferences loaded', String(parsed.preferences.length)],
          ['NVT selectors loaded', String(parsed.nvt_selectors.length)],
        ]}
      />
      <p className="text-xs text-muted-foreground">
        "Loaded" counters reflect what is materialized in the uploaded XML.
        These may be lower than the totals above when the XML was exported
        without full NVT expansion.
      </p>
    </div>
  )
}

function DescriptionGrid({ items }: { items: Array<[string, string]> }) {
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
      {items.map(([k, v]) => (
        <div key={k} className="flex flex-col">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
            {k}
          </dt>
          <dd className="font-emphasis text-foreground break-words">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function FamiliesTab({ parsed }: { parsed: ParsedScanConfig }) {
  if (parsed.families.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        No family data in this export.
      </p>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-card border-b border-border text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-emphasis">Family</th>
            <th className="px-3 py-2 text-right font-emphasis">NVTs</th>
            <th className="px-3 py-2 text-right font-emphasis">Max</th>
            <th className="px-3 py-2 text-center font-emphasis">Growing</th>
          </tr>
        </thead>
        <tbody>
          {parsed.families.map((f) => (
            <tr
              key={f.name}
              className="border-b border-border/50 last:border-0"
            >
              <td className="px-3 py-1.5 font-emphasis text-foreground">
                {f.name}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                {f.nvt_count}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                {f.max_nvt_count}
              </td>
              <td className="px-3 py-1.5 text-center text-muted-foreground">
                {f.growing ? 'yes' : 'no'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PreferencesTab({ parsed }: { parsed: ParsedScanConfig }) {
  if (parsed.preferences.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        No preferences in this export.
      </p>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-card border-b border-border text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-emphasis">NVT</th>
            <th className="px-3 py-2 text-left font-emphasis">Preference</th>
            <th className="px-3 py-2 text-left font-emphasis">Type</th>
            <th className="px-3 py-2 text-left font-emphasis">Value</th>
          </tr>
        </thead>
        <tbody>
          {parsed.preferences.map((p, i) => (
            <tr key={i} className="border-b border-border/50 last:border-0">
              <td className="px-3 py-1.5 text-muted-foreground">
                {p.nvt_name || <span className="opacity-50">—</span>}
              </td>
              <td className="px-3 py-1.5 font-emphasis text-foreground">
                {p.hr_name || p.name}
              </td>
              <td className="px-3 py-1.5 text-muted-foreground">{p.type}</td>
              <td className="px-3 py-1.5 font-mono text-xs break-all">
                {p.value || <span className="opacity-50">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SelectorsTab({ parsed }: { parsed: ParsedScanConfig }) {
  if (parsed.nvt_selectors.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        No NVT selectors in this export.
      </p>
    )
  }
  const typeLabel: Record<number, string> = {
    0: 'all',
    1: 'family',
    2: 'NVT',
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-card border-b border-border text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-emphasis">Action</th>
            <th className="px-3 py-2 text-left font-emphasis">Type</th>
            <th className="px-3 py-2 text-left font-emphasis">Family / NVT</th>
          </tr>
        </thead>
        <tbody>
          {parsed.nvt_selectors.map((s, i) => (
            <tr key={i} className="border-b border-border/50 last:border-0">
              <td className="px-3 py-1.5 font-emphasis text-foreground">
                {s.include ? 'include' : 'exclude'}
              </td>
              <td className="px-3 py-1.5 text-muted-foreground">
                {typeLabel[s.type] ?? String(s.type)}
              </td>
              <td className="px-3 py-1.5 font-mono text-xs break-all">
                {s.family_or_nvt || <span className="opacity-50">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
