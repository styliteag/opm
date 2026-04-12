import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod/v4'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useScannerMutations } from '@/features/scanners/hooks/useScanners'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  location: z.string().optional(),
  kind: z.enum(['standard', 'gvm', 'unified']).default('standard'),
})

type FormData = z.infer<typeof schema>

interface CreateScannerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (apiKey: string) => void
}

export function CreateScannerModal({ open, onOpenChange, onCreated }: CreateScannerModalProps) {
  const { create } = useScannerMutations()
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { kind: 'standard' },
  })

  const onSubmit = (data: FormData) => {
    create.mutate(data, {
      onSuccess: (res) => {
        toast.success('Scanner created')
        onCreated?.(res.api_key)
        onOpenChange(false)
        reset()
      },
      onError: (e) => toast.error(e.message),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Register Scanner</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" {...register('name')} placeholder="e.g. HQ Berlin" />
            {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" {...register('description')} placeholder="Optional description" rows={2} />
          </div>
          <div>
            <Label htmlFor="location">Location</Label>
            <Input id="location" {...register('location')} placeholder="e.g. AWS eu-west-1" />
          </div>
          <div>
            <Label htmlFor="kind">Kind</Label>
            <Select id="kind" {...register('kind')}>
              <option value="standard">Standard (masscan / nmap / nse)</option>
              <option value="gvm">GVM (Greenbone bridge only)</option>
              <option value="unified">Unified (standard + GVM)</option>
            </Select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Pick Unified for opm-scanner-unified (standard tools + GVM socket).
              Pick GVM for the lightweight opm-scanner-gvm bridge image.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
