import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { API_BASE_URL, extractErrorMessage, getAuthHeaders } from '../lib/api'
import type { AlertComment, AlertCommentListResponse } from '../types'

const formatDateTime = (value: Date) =>
    new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(value)

const parseUtcDate = (dateStr: string) =>
    new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z')

type AlertCommentsProps = {
    alertId: number
    onToast: (message: string, tone: 'success' | 'error') => void
}

const AlertComments = ({ alertId, onToast }: AlertCommentsProps) => {
    const { token, user } = useAuth()
    const queryClient = useQueryClient()
    const [newComment, setNewComment] = useState('')
    const [editingComment, setEditingComment] = useState<{
        id: number
        comment: string
    } | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)

    const isAdmin = user?.role === 'admin'

    // Fetch comments for this alert
    const commentsQuery = useQuery({
        queryKey: ['alert-comments', alertId],
        queryFn: async () => {
            const response = await fetch(
                `${API_BASE_URL}/api/alerts/${alertId}/comments`,
                { headers: getAuthHeaders(token ?? '') }
            )
            if (!response.ok) {
                throw new Error(await extractErrorMessage(response))
            }
            return response.json() as Promise<AlertCommentListResponse>
        },
        enabled: Boolean(token),
    })

    // Create comment mutation
    const createCommentMutation = useMutation({
        mutationFn: async (comment: string) => {
            const response = await fetch(
                `${API_BASE_URL}/api/alerts/${alertId}/comments`,
                {
                    method: 'POST',
                    headers: {
                        ...getAuthHeaders(token ?? ''),
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ comment }),
                }
            )
            if (!response.ok) {
                throw new Error(await extractErrorMessage(response))
            }
            return response.json()
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['alert-comments', alertId] })
            setNewComment('')
            onToast('Comment added', 'success')
        },
        onError: (error) => {
            onToast(error instanceof Error ? error.message : 'Failed to add comment', 'error')
        },
    })

    // Update comment mutation
    const updateCommentMutation = useMutation({
        mutationFn: async ({ commentId, comment }: { commentId: number; comment: string }) => {
            const response = await fetch(
                `${API_BASE_URL}/api/alerts/${alertId}/comments/${commentId}`,
                {
                    method: 'PATCH',
                    headers: {
                        ...getAuthHeaders(token ?? ''),
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ comment }),
                }
            )
            if (!response.ok) {
                throw new Error(await extractErrorMessage(response))
            }
            return response.json()
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['alert-comments', alertId] })
            setEditingComment(null)
            onToast('Comment updated', 'success')
        },
        onError: (error) => {
            onToast(error instanceof Error ? error.message : 'Failed to update comment', 'error')
        },
    })

    // Delete comment mutation
    const deleteCommentMutation = useMutation({
        mutationFn: async (commentId: number) => {
            const response = await fetch(
                `${API_BASE_URL}/api/alerts/${alertId}/comments/${commentId}`,
                {
                    method: 'DELETE',
                    headers: getAuthHeaders(token ?? ''),
                }
            )
            if (!response.ok) {
                throw new Error(await extractErrorMessage(response))
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['alert-comments', alertId] })
            onToast('Comment deleted', 'success')
        },
        onError: (error) => {
            onToast(error instanceof Error ? error.message : 'Failed to delete comment', 'error')
        },
    })

    const handleSubmitComment = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newComment.trim() || isSubmitting) return

        setIsSubmitting(true)
        try {
            await createCommentMutation.mutateAsync(newComment.trim())
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleUpdateComment = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!editingComment || !editingComment.comment.trim() || isSubmitting) return

        setIsSubmitting(true)
        try {
            await updateCommentMutation.mutateAsync({
                commentId: editingComment.id,
                comment: editingComment.comment.trim(),
            })
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleDeleteComment = async (commentId: number) => {
        if (!confirm('Are you sure you want to delete this comment?')) return
        await deleteCommentMutation.mutateAsync(commentId)
    }

    const canModifyComment = (comment: AlertComment) => {
        return user?.id === comment.user_id || isAdmin
    }

    const comments = commentsQuery.data?.comments ?? []

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <p className="text-[10px] font-black text-violet-500 uppercase tracking-[0.25em]">
                    Alert Comments
                </p>
                <span className="text-xs text-slate-400 dark:text-slate-500">
                    {comments.length} comment{comments.length !== 1 ? 's' : ''}
                </span>
            </div>

            {/* Comments list */}
            <div className="space-y-3 max-h-64 overflow-y-auto">
                {commentsQuery.isLoading ? (
                    <div className="flex items-center justify-center py-4">
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-slate-300 border-t-violet-500" />
                    </div>
                ) : comments.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400 italic py-2">
                        No comments yet. Be the first to add one.
                    </p>
                ) : (
                    comments.map((comment) => (
                        <div
                            key={comment.id}
                            className="bg-slate-50/80 dark:bg-slate-800/40 rounded-xl p-3 border border-slate-100 dark:border-slate-700/50"
                        >
                            {editingComment?.id === comment.id ? (
                                <form onSubmit={handleUpdateComment} className="space-y-2">
                                    <textarea
                                        value={editingComment.comment}
                                        onChange={(e) =>
                                            setEditingComment({
                                                ...editingComment,
                                                comment: e.target.value,
                                            })
                                        }
                                        className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none resize-none"
                                        rows={3}
                                        autoFocus
                                    />
                                    <div className="flex items-center gap-2 justify-end">
                                        <button
                                            type="button"
                                            onClick={() => setEditingComment(null)}
                                            className="text-[10px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 uppercase tracking-wider px-2 py-1"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={isSubmitting || !editingComment.comment.trim()}
                                            className="text-[10px] font-bold text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 uppercase tracking-wider px-2 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {isSubmitting ? 'Saving...' : 'Save'}
                                        </button>
                                    </div>
                                </form>
                            ) : (
                                <>
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1">
                                            <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">
                                                {comment.comment}
                                            </p>
                                        </div>
                                        {canModifyComment(comment) && (
                                            <div className="flex items-center gap-1 shrink-0">
                                                <button
                                                    onClick={() =>
                                                        setEditingComment({
                                                            id: comment.id,
                                                            comment: comment.comment,
                                                        })
                                                    }
                                                    className="text-[9px] font-bold text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300 uppercase tracking-wider px-1"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteComment(comment.id)}
                                                    className="text-[9px] font-bold text-rose-500 hover:text-rose-700 dark:hover:text-rose-300 uppercase tracking-wider px-1"
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500">
                                        <span className="font-medium text-slate-500 dark:text-slate-400">
                                            {comment.user_email}
                                        </span>
                                        <span>·</span>
                                        <span title={formatDateTime(parseUtcDate(comment.created_at))}>
                                            {formatDateTime(parseUtcDate(comment.created_at))}
                                        </span>
                                        {comment.updated_at !== comment.created_at && (
                                            <>
                                                <span>·</span>
                                                <span className="italic">edited</span>
                                            </>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Add comment form */}
            <form onSubmit={handleSubmitComment} className="space-y-2">
                <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Add a comment..."
                    className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-xl px-4 py-3 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none resize-none"
                    rows={2}
                />
                <div className="flex justify-end">
                    <button
                        type="submit"
                        disabled={isSubmitting || !newComment.trim()}
                        className="rounded-xl bg-violet-600 hover:bg-violet-700 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white shadow transition disabled:opacity-50 disabled:cursor-not-allowed dark:bg-violet-500 dark:hover:bg-violet-600"
                    >
                        {isSubmitting ? 'Posting...' : 'Post Comment'}
                    </button>
                </div>
            </form>
        </div>
    )
}

export default AlertComments
