import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { useNseMutations } from '@/features/nse/hooks/useNse'

interface ScriptUploadModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

interface FormState {
  name: string
  description: string
  categories: string
  severity: string
  content: string
}

const INITIAL_FORM: FormState = {
  name: '',
  description: '',
  categories: '',
  severity: 'medium',
  content: '',
}

export function ScriptUploadModal({
  open,
  onOpenChange,
  onSuccess,
}: ScriptUploadModalProps) {
  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const { createScript } = useNseMutations()
  const navigate = useNavigate()

  const selectClass =
    'w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring'

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      const fileContent = ev.target?.result
      if (typeof fileContent === 'string') {
        setForm((prev) => ({
          ...prev,
          content: fileContent,
          name: prev.name || file.name.replace(/\.nse$/, '').replace(/\.lua$/, ''),
        }))
      }
    }
    reader.readAsText(file)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!form.name.trim()) {
      toast.error('Name is required')
      return
    }
    if (!form.content.trim()) {
      toast.error('Script source code is required')
      return
    }

    // Auto-prefix custom_ if not present
    const scriptName = form.name.trim().startsWith('custom_')
      ? form.name.trim()
      : `custom_${form.name.trim()}`

    createScript.mutate(
      {
        name: scriptName,
        content: form.content,
        description: form.description.trim() || undefined,
        categories: form.categories
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean),
        severity: form.severity || undefined,
      },
      {
        onSuccess: () => {
          toast.success('Script uploaded')
          setForm(INITIAL_FORM)
          onOpenChange(false)
          onSuccess?.()
          navigate({
            to: '/nse/editor/$scriptName',
            params: { scriptName },
          })
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : 'Upload failed')
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload NSE Script</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div>
            <Label htmlFor="script-name">Name</Label>
            <Input
              id="script-name"
              value={form.name}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="my-custom-check"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Will be prefixed with custom_ automatically
            </p>
          </div>
          <div>
            <Label htmlFor="script-description">Description</Label>
            <Input
              id="script-description"
              value={form.description}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, description: e.target.value }))
              }
              placeholder="What this script checks for"
            />
          </div>
          <div>
            <Label htmlFor="script-categories">Categories (comma-separated)</Label>
            <Input
              id="script-categories"
              value={form.categories}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, categories: e.target.value }))
              }
              placeholder="vuln, safe, default"
            />
          </div>
          <div>
            <Label htmlFor="script-severity">Severity</Label>
            <select
              id="script-severity"
              value={form.severity}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, severity: e.target.value }))
              }
              className={selectClass}
            >
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="info">Info</option>
            </select>
          </div>
          <div>
            <Label htmlFor="script-file">Upload .nse file</Label>
            <Input
              id="script-file"
              type="file"
              accept=".nse,.lua"
              onChange={handleFileUpload}
              className="cursor-pointer"
            />
          </div>
          <div>
            <Label htmlFor="script-content">Script Source Code</Label>
            <Textarea
              id="script-content"
              value={form.content}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, content: e.target.value }))
              }
              placeholder="-- NSE script source code..."
              rows={12}
              className="font-mono text-xs"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createScript.isPending}>
              {createScript.isPending ? 'Uploading...' : 'Upload Script'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
