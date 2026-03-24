import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { fetchApi, postApi, putApi, deleteApi } from '@/lib/api'

export interface ScanPhase {
  name: 'host_discovery' | 'port_scan' | 'vulnerability'
  enabled: boolean
  tool: string
  config: Record<string, unknown>
}

export interface ScanProfile {
  id: number
  name: string
  description: string
  phases: ScanPhase[] | null
  severity: string | null
  platform: string
  category: string | null
  type: 'builtin' | 'custom'
  enabled: boolean
  priority: number
  created_at: string
  updated_at: string
}

interface ScanProfileListResponse {
  profiles: ScanProfile[]
  total: number
}

export function useScanProfiles(search?: string) {
  const params = new URLSearchParams()
  if (search) params.set('search', search)
  const qs = params.toString()
  return useQuery({
    queryKey: ['scan-profiles', { search }],
    queryFn: () =>
      fetchApi<ScanProfileListResponse>(
        `/api/scan-profiles${qs ? `?${qs}` : ''}`,
      ),
  })
}

export function useScanProfile(id: number) {
  return useQuery({
    queryKey: ['scan-profiles', id],
    queryFn: () => fetchApi<ScanProfile>(`/api/scan-profiles/${id}`),
    enabled: id > 0,
  })
}

export function useScanProfileMutations() {
  const qc = useQueryClient()

  const createProfile = useMutation({
    mutationFn: (data: {
      name: string
      description?: string
      phases: ScanPhase[]
      severity?: string
      category?: string
    }) => postApi<ScanProfile>('/api/scan-profiles', data),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['scan-profiles'] }),
  })

  const updateProfile = useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: number
      name?: string
      description?: string
      phases?: ScanPhase[]
      severity?: string
    }) => putApi<ScanProfile>(`/api/scan-profiles/${id}`, data),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['scan-profiles'] }),
  })

  const deleteProfile = useMutation({
    mutationFn: (id: number) => deleteApi(`/api/scan-profiles/${id}`),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['scan-profiles'] }),
  })

  const cloneProfile = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      postApi<ScanProfile>(
        `/api/scan-profiles/${id}/clone?name=${encodeURIComponent(name)}`,
        {},
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['scan-profiles'] }),
  })

  return { createProfile, updateProfile, deleteProfile, cloneProfile }
}
