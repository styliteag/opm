import { useMutation, useQueryClient } from '@tanstack/react-query'

import { postApi, putApi, deleteApi } from '@/lib/api'

// useQuery for scanner list is in useDashboardData.ts (useScanners)
// This file adds mutation hooks

export function useScannerMutations() {
  const qc = useQueryClient()

  const create = useMutation({
    mutationFn: (data: { name: string; description?: string; location?: string }) =>
      postApi<{ id: number; api_key: string }>('/api/scanners', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scanners'] }),
  })

  const update = useMutation({
    mutationFn: ({ id, ...data }: { id: number; name?: string; description?: string; location?: string }) =>
      putApi(`/api/scanners/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scanners'] }),
  })

  const remove = useMutation({
    mutationFn: (id: number) => deleteApi(`/api/scanners/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scanners'] }),
  })

  const regenerateKey = useMutation({
    mutationFn: (id: number) =>
      postApi<{ api_key: string }>(`/api/scanners/${id}/regenerate-key`, {}),
  })

  return { create, update, remove, regenerateKey }
}
