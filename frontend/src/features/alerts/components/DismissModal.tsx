import { useState } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useAlertMutations, useDismissSuggestions } from '@/features/alerts/hooks/useAlerts'

interface DismissModalProps {
  alertId: number
  port?: number
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DismissModal({ alertId, port, open, onOpenChange }: DismissModalProps) {
  const [reason, setReason] = useState('')
  const { dismiss } = useAlertMutations()
  const suggestions = useDismissSuggestions(port)

  const handleDismiss = () => {
    dismiss.mutate(
      { id: alertId, reason: reason || 'Dismissed' },
      {
        onSuccess: () => {
          toast.success('Alert dismissed')
          onOpenChange(false)
          setReason('')
        },
        onError: (e) => toast.error(e.message),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dismiss Alert</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Reason
            </label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this alert being dismissed?"
              rows={3}
            />
          </div>

          {(suggestions.data?.suggestions ?? []).length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">Suggestions:</p>
              <div className="flex flex-wrap gap-1.5">
                {(suggestions.data?.suggestions ?? []).slice(0, 5).map((s) => (
                  <button
                    key={s.reason}
                    onClick={() => setReason(s.reason)}
                    className="rounded-md bg-secondary px-2 py-1 text-xs text-secondary-foreground hover:bg-accent transition-colors"
                  >
                    {s.reason}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleDismiss} disabled={dismiss.isPending}>
            {dismiss.isPending ? 'Dismissing...' : 'Dismiss'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
