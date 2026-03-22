import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Send } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { postApi } from '@/lib/api'

interface CommentInputProps {
  alertId: number
}

export function CommentInput({ alertId }: CommentInputProps) {
  const [comment, setComment] = useState('')
  const qc = useQueryClient()

  const createComment = useMutation({
    mutationFn: (text: string) =>
      postApi(`/api/alerts/${alertId}/comments`, { comment: text }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts', alertId, 'comments'] })
      setComment('')
      toast.success('Comment posted')
    },
    onError: (e) => toast.error(e.message),
  })

  const handleSubmit = () => {
    const trimmed = comment.trim()
    if (!trimmed) return
    createComment.mutate(trimmed)
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Add a comment..."
        rows={2}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            handleSubmit()
          }
        }}
      />
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={!comment.trim() || createComment.isPending}
        >
          <Send className="h-3.5 w-3.5 mr-1.5" />
          {createComment.isPending ? 'Posting...' : 'Post'}
        </Button>
      </div>
    </div>
  )
}
