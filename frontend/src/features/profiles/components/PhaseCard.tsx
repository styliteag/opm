import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'

import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface PhaseCardProps {
  name: string
  label: string
  description: string
  enabled: boolean
  tool: string
  config: Record<string, unknown>
  toolOptions: { value: string; label: string }[]
  onToggle: (enabled: boolean) => void
  onToolChange: (tool: string) => void
  onConfigChange: (config: Record<string, unknown>) => void
  warningMessage?: string
  children?: React.ReactNode
}

export function PhaseCard({
  name,
  label,
  description,
  enabled,
  tool,
  config,
  toolOptions,
  onToggle,
  onToolChange,
  onConfigChange,
  warningMessage,
  children,
}: PhaseCardProps) {
  const [expanded, setExpanded] = useState(enabled)

  const aggressive = (config.aggressive as boolean) ?? false
  const maxRetries = (config.max_retries as number) ?? 3

  return (
    <div
      className={`rounded-lg border p-4 transition-colors ${
        enabled
          ? 'border-primary/40 bg-primary/5'
          : 'border-muted bg-muted/30 opacity-60'
      }`}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          id={`phase-${name}`}
          checked={enabled}
          onCheckedChange={(checked) => onToggle(checked === true)}
          className="mt-0.5"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <div>
              <label
                htmlFor={`phase-${name}`}
                className="font-medium text-sm cursor-pointer"
              >
                {label}
              </label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {description}
              </p>
            </div>
            {enabled && (
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                {expanded ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
                Config
              </button>
            )}
          </div>

          {warningMessage && !enabled && (
            <p className="text-xs text-yellow-500 mt-1">{warningMessage}</p>
          )}

          {enabled && expanded && (
            <div className="mt-3 space-y-3 border-t border-border/50 pt-3">
              {/* Tool selector */}
              {toolOptions.length > 1 && (
                <div className="space-y-1">
                  <Label className="text-xs">Tool</Label>
                  <select
                    value={tool}
                    onChange={(e) => onToolChange(e.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                  >
                    {toolOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Shared config */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`${name}-aggressive`}
                    checked={aggressive}
                    onCheckedChange={(checked) =>
                      onConfigChange({
                        ...config,
                        aggressive: checked === true,
                      })
                    }
                  />
                  <label
                    htmlFor={`${name}-aggressive`}
                    className="text-xs cursor-pointer"
                  >
                    Aggressive
                  </label>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Max Retries</Label>
                  <Input
                    type="number"
                    min={0}
                    max={10}
                    value={maxRetries}
                    onChange={(e) =>
                      onConfigChange({
                        ...config,
                        max_retries: parseInt(e.target.value) || 0,
                      })
                    }
                    className="h-7 text-xs"
                  />
                </div>
              </div>

              {/* Phase-specific config passed as children */}
              {children}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
