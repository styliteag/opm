import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod/v4'
import { toast } from 'sonner'
import cronstrue from 'cronstrue'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useNetworkMutations } from '@/features/networks/hooks/useNetworkDetail'
import { useScanners } from '@/features/dashboard/hooks/useDashboardData'
import { useNseProfiles } from '@/features/nse/hooks/useNse'
import { computeScanEstimate } from '@/lib/scan-estimate'
import type { Network } from '@/lib/types'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  cidr: z.string().min(1, 'CIDR is required'),
  port_spec: z.string().min(1, 'Port spec is required'),
  scanner_id: z.coerce.number().min(1, 'Scanner is required'),
  scanner_type: z.enum(['masscan', 'nmap']),
  scan_protocol: z.enum(['tcp', 'udp', 'both']),
  scan_rate: z.coerce.number().optional(),
  scan_timeout: z.preprocess(
    (val) => (val === '' || val === undefined || val === null ? undefined : Number(val)),
    z.number().min(60).max(86400).optional(),
  ),
  port_timeout: z.preprocess(
    (val) => (val === '' || val === undefined || val === null ? undefined : Number(val)),
    z.number().min(100).max(30000).optional(),
  ),
  scan_schedule: z.string().optional(),
  nse_profile_id: z.preprocess(
    (val) => (val === '' || val === undefined || val === null ? undefined : Number(val)),
    z.number().optional(),
  ),
  email_recipients: z.string().optional(),
})

type FormData = z.infer<typeof schema>

const RATE_PRESETS = [
  { label: 'Slow', value: 100, desc: 'Safe for production' },
  { label: 'Normal', value: 1000, desc: 'Balanced' },
  { label: 'Fast', value: 10000, desc: 'Aggressive' },
  { label: 'Max', value: 100000, desc: 'Lab/isolated only' },
]

const SCHEDULE_PRESETS = [
  { label: 'Hourly', value: '0 * * * *' },
  { label: 'Daily 2am', value: '0 2 * * *' },
  { label: 'Weekly', value: '0 2 * * 1' },
  { label: 'Monthly', value: '0 2 1 * *' },
]

interface NetworkFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  network?: Network
}

export function NetworkForm({ open, onOpenChange, network }: NetworkFormProps) {
  const { create, update } = useNetworkMutations()
  const scanners = useScanners()
  const profiles = useNseProfiles()
  const isEdit = Boolean(network)

  const { register, handleSubmit, reset, setValue, control, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: network
      ? {
          name: network.name,
          cidr: network.cidr,
          port_spec: network.port_spec,
          scanner_id: network.scanner_id,
          scanner_type: network.scanner_type as 'masscan' | 'nmap',
          scan_protocol: network.scan_protocol as 'tcp' | 'udp' | 'both',
          scan_rate: network.scan_rate ?? undefined,
          scan_timeout: network.scan_timeout ?? undefined,
          port_timeout: network.port_timeout ?? undefined,
          scan_schedule: network.scan_schedule ?? undefined,
          nse_profile_id: network.nse_profile_id ?? undefined,
          email_recipients: (network.alert_config as Record<string, unknown> | null)?.email_recipients
            ? String((network.alert_config as Record<string, unknown>).email_recipients)
            : '',
        }
      : {
          scanner_type: 'masscan',
          scan_protocol: 'tcp',
          port_spec: '1-65535',
          scan_rate: 1000,
          scan_timeout: 3600,
          port_timeout: 1500,
        },
  })

  const watchedCidr = useWatch({ control, name: 'cidr' }) ?? ''
  const watchedPortSpec = useWatch({ control, name: 'port_spec' }) ?? ''
  const watchedRate = useWatch({ control, name: 'scan_rate' }) ?? 1000
  const watchedSchedule = useWatch({ control, name: 'scan_schedule' }) ?? ''

  const estimate = computeScanEstimate(watchedCidr, watchedPortSpec, watchedRate)

  let cronHuman = ''
  try {
    if (watchedSchedule.trim()) {
      cronHuman = cronstrue.toString(watchedSchedule)
    }
  } catch {
    cronHuman = ''
  }

  const selectClass =
    'w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring'

  const onSubmit = (data: FormData) => {
    const { email_recipients, ...rest } = data
    const payload: Record<string, unknown> = { ...rest }

    // Build alert_config with email_recipients if provided
    if (email_recipients?.trim()) {
      const recipients = email_recipients.split(',').map((e) => e.trim()).filter(Boolean)
      const existingConfig = (network?.alert_config as Record<string, unknown> | null) ?? {}
      payload.alert_config = { ...existingConfig, email_recipients: recipients }
    } else if (isEdit && network?.alert_config) {
      // Clear email_recipients but keep other alert_config settings
      const existing = { ...(network.alert_config as Record<string, unknown>) }
      delete existing.email_recipients
      payload.alert_config = Object.keys(existing).length > 0 ? existing : null
    }

    if (isEdit && network) {
      update.mutate(
        { id: network.id, ...(payload as Partial<Network>) },
        {
          onSuccess: () => {
            toast.success('Network updated')
            onOpenChange(false)
          },
          onError: (e) => toast.error(e.message),
        },
      )
    } else {
      create.mutate(payload as Partial<Network>, {
        onSuccess: () => {
          toast.success('Network created')
          onOpenChange(false)
          reset()
        },
        onError: (e) => toast.error(e.message),
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Network' : 'Add Network'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" {...register('name')} placeholder="Internal LAN" />
              {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="col-span-2">
              <Label htmlFor="cidr">CIDR</Label>
              <Input id="cidr" {...register('cidr')} placeholder="192.168.1.0/24" className="font-mono" />
              {errors.cidr && <p className="mt-1 text-xs text-destructive">{errors.cidr.message}</p>}
            </div>
            <div className="col-span-2">
              <Label htmlFor="port_spec">Port Specification</Label>
              <Input id="port_spec" {...register('port_spec')} placeholder="1-65535" className="font-mono" />
              {errors.port_spec && <p className="mt-1 text-xs text-destructive">{errors.port_spec.message}</p>}
            </div>
            <div>
              <Label htmlFor="scanner_id">Scanner</Label>
              <select id="scanner_id" {...register('scanner_id')} className={selectClass}>
                <option value="">Select scanner...</option>
                {(scanners.data?.scanners ?? []).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              {errors.scanner_id && <p className="mt-1 text-xs text-destructive">{errors.scanner_id.message}</p>}
            </div>
            <div>
              <Label htmlFor="scanner_type">Scanner Type</Label>
              <select id="scanner_type" {...register('scanner_type')} className={selectClass}>
                <option value="masscan">Masscan</option>
                <option value="nmap">Nmap</option>
              </select>
            </div>
            <div>
              <Label htmlFor="scan_protocol">Protocol</Label>
              <select id="scan_protocol" {...register('scan_protocol')} className={selectClass}>
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
                <option value="both">Both</option>
              </select>
            </div>

            {/* Scan Rate with Presets */}
            <div>
              <Label htmlFor="scan_rate">Scan Rate (pps)</Label>
              <Input id="scan_rate" type="number" {...register('scan_rate')} placeholder="1000" />
              <div className="mt-1.5 flex gap-1">
                {RATE_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setValue('scan_rate', p.value)}
                    className={`rounded px-1.5 py-0.5 text-[10px] transition-colors ${
                      watchedRate === p.value
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-accent text-muted-foreground hover:text-foreground'
                    }`}
                    title={p.desc}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Timeouts */}
            <div>
              <Label htmlFor="scan_timeout">Scan Timeout (seconds)</Label>
              <Input id="scan_timeout" type="number" {...register('scan_timeout')} placeholder="3600" />
              {errors.scan_timeout && <p className="mt-1 text-xs text-destructive">{errors.scan_timeout.message}</p>}
              <p className="mt-0.5 text-[10px] text-muted-foreground">Max duration per scan (60-86400)</p>
            </div>
            <div>
              <Label htmlFor="port_timeout">Port Timeout (ms)</Label>
              <Input id="port_timeout" type="number" {...register('port_timeout')} placeholder="1500" />
              {errors.port_timeout && <p className="mt-1 text-xs text-destructive">{errors.port_timeout.message}</p>}
              <p className="mt-0.5 text-[10px] text-muted-foreground">Per-port response timeout (100-30000)</p>
            </div>

            {/* Runtime Estimate */}
            {estimate.ips > 0 && estimate.ports > 0 && watchedRate > 0 && (
              <div className="flex items-end">
                <div title={estimate.tooltip}>
                  <p className="text-xs text-muted-foreground">Est. Runtime</p>
                  <p className={`text-sm font-medium ${estimate.color}`}>{estimate.display}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {estimate.ips.toLocaleString()} IPs × {estimate.ports.toLocaleString()} ports
                  </p>
                </div>
              </div>
            )}

            {/* NSE Profile */}
            <div className="col-span-2">
              <Label htmlFor="nse_profile_id">NSE Profile (optional)</Label>
              <select id="nse_profile_id" {...register('nse_profile_id')} className={selectClass}>
                <option value="">None</option>
                {(profiles.data?.profiles ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Schedule with Presets */}
            <div className="col-span-2">
              <Label htmlFor="scan_schedule">Schedule (cron)</Label>
              <Input id="scan_schedule" {...register('scan_schedule')} placeholder="0 2 * * *" className="font-mono" />
              <div className="mt-1.5 flex gap-1">
                {SCHEDULE_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setValue('scan_schedule', p.value)}
                    className={`rounded px-1.5 py-0.5 text-[10px] transition-colors ${
                      watchedSchedule === p.value
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-accent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {cronHuman && (
                <p className="mt-1 text-xs text-muted-foreground">{cronHuman}</p>
              )}
            </div>
            {/* Email Recipients */}
            <div className="col-span-2">
              <Label htmlFor="email_recipients">Alert Email Recipients</Label>
              <Input
                id="email_recipients"
                {...register('email_recipients')}
                placeholder="admin@example.com, security@example.com"
              />
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Comma-separated email addresses for alert notifications on this network
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={create.isPending || update.isPending}>
              {(create.isPending || update.isPending) ? 'Saving...' : isEdit ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
