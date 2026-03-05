import { useState, useEffect, useCallback } from 'react'

export type ToastMessage = {
  message: string
  tone: 'success' | 'error'
}

export const useToast = (dismissMs = 3000) => {
  const [toast, setToast] = useState<ToastMessage | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), dismissMs)
    return () => clearTimeout(t)
  }, [toast, dismissMs])

  const showToast = useCallback((message: string, tone: 'success' | 'error') => {
    setToast({ message, tone })
  }, [])

  return { toast, showToast } as const
}
