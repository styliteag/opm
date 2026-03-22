import { useState, useCallback } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, Pencil, Save, RotateCcw } from 'lucide-react'
import CodeMirror from '@uiw/react-codemirror'
import { StreamLanguage } from '@codemirror/language'
import { lua } from '@codemirror/legacy-modes/mode/lua'
import { oneDark } from '@codemirror/theme-one-dark'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { LoadingState } from '@/components/data-display/LoadingState'
import { ErrorState } from '@/components/data-display/ErrorState'
import { useNseScriptDetail, useNseMutations } from '@/features/nse/hooks/useNse'
import { useThemeStore } from '@/stores/theme.store'

export const Route = createFileRoute('/_authenticated/nse/editor/$scriptName')({
  component: NseEditorPage,
})

function NseEditorPage() {
  const { scriptName } = Route.useParams()
  const { data, isLoading, error, refetch } = useNseScriptDetail(scriptName)
  const { updateScript, restoreScript } = useNseMutations()
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme)

  const [editing, setEditing] = useState(false)
  const [editedSource, setEditedSource] = useState('')

  const isCustom = scriptName.startsWith('custom_')

  const handleStartEdit = () => {
    setEditedSource(data?.content ?? '')
    setEditing(true)
  }

  const handleCancelEdit = () => {
    setEditing(false)
    setEditedSource('')
  }

  const handleSave = () => {
    updateScript.mutate(
      { name: scriptName, content: editedSource },
      {
        onSuccess: () => {
          toast.success('Script saved')
          setEditing(false)
          refetch()
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : 'Save failed')
        },
      },
    )
  }

  const handleRestore = () => {
    restoreScript.mutate(scriptName, {
      onSuccess: () => {
        toast.success('Script restored to original')
        setEditing(false)
        refetch()
      },
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : 'Restore failed')
      },
    })
  }

  const handleEditorChange = useCallback((value: string) => {
    setEditedSource(value)
  }, [])

  if (isLoading) return <LoadingState rows={10} />
  if (error) return <ErrorState message={error.message} onRetry={refetch} />
  if (!data) return <ErrorState message="Script not found" />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/nse/library" className="rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="font-display text-xl font-bold text-foreground">
              NSE Editor
            </h1>
            <p className="mt-0.5 font-mono text-sm text-primary">{data.name}</p>
          </div>
        </div>
        {isCustom && (
          <div className="flex items-center gap-2">
            {data.cloned_from && !editing && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRestore}
                disabled={restoreScript.isPending}
              >
                <RotateCcw className="h-4 w-4 mr-1.5" />
                {restoreScript.isPending ? 'Restoring...' : 'Restore Original'}
              </Button>
            )}
            {editing ? (
              <>
                <Button variant="outline" size="sm" onClick={handleCancelEdit}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSave} disabled={updateScript.isPending}>
                  <Save className="h-4 w-4 mr-1.5" />
                  {updateScript.isPending ? 'Saving...' : 'Save'}
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={handleStartEdit}>
                <Pencil className="h-4 w-4 mr-1.5" />
                Edit
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        {/* Editor */}
        <div className="lg:col-span-3 rounded-lg border border-border overflow-hidden">
          <CodeMirror
            value={editing ? editedSource : (data.content ?? '-- Script content not available')}
            height="600px"
            readOnly={!editing}
            onChange={editing ? handleEditorChange : undefined}
            extensions={[StreamLanguage.define(lua)]}
            theme={resolvedTheme === 'dark' ? oneDark : undefined}
            basicSetup={{
              lineNumbers: true,
              foldGutter: true,
              highlightActiveLineGutter: true,
            }}
          />
        </div>

        {/* Metadata Panel */}
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="font-display text-sm font-semibold text-foreground mb-3">
              Script Metadata
            </h3>
            <dl className="space-y-3">
              <div>
                <dt className="text-xs text-muted-foreground">Name</dt>
                <dd className="mt-0.5 font-mono text-sm text-foreground">{data.name}</dd>
              </div>
              {data.description && (
                <div>
                  <dt className="text-xs text-muted-foreground">Description</dt>
                  <dd className="mt-0.5 text-sm text-foreground">{data.description}</dd>
                </div>
              )}
              {data.categories && data.categories.length > 0 && (
                <div>
                  <dt className="text-xs text-muted-foreground">Categories</dt>
                  <dd className="mt-1 flex flex-wrap gap-1">
                    {data.categories.map((cat) => (
                      <span key={cat} className="rounded bg-white/5 px-1.5 py-0.5 text-xs text-muted-foreground">
                        {cat}
                      </span>
                    ))}
                  </dd>
                </div>
              )}
              {data.cloned_from && (
                <div>
                  <dt className="text-xs text-muted-foreground">Cloned From</dt>
                  <dd className="mt-0.5 font-mono text-sm text-foreground">{data.cloned_from}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-muted-foreground">Type</dt>
                <dd className="mt-0.5 text-sm text-foreground">
                  {data.type === 'custom' ? 'Custom Script' : 'Built-in'}
                </dd>
              </div>
              {data.severity && (
                <div>
                  <dt className="text-xs text-muted-foreground">Severity</dt>
                  <dd className="mt-0.5 text-sm text-foreground capitalize">{data.severity}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      </div>
    </div>
  )
}
