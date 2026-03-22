import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { fetchApi, postApi, putApi, deleteApi } from '@/lib/api'

interface NseProfile {
  id: number
  name: string
  description: string | null
  nse_scripts: string[]
  severity: string | null
  platform: string | null
  type: 'builtin' | 'custom'
  enabled: boolean
  script_args: Record<string, unknown> | null
  priority: number | null
  created_at: string
  updated_at: string
}

export interface NseScript {
  id?: number
  name: string
  description: string | null
  content: string | null
  content_hash?: string
  categories: string[]
  severity: string | null
  type: 'builtin' | 'custom'
  cloned_from: string | null
  author: string | null
  created_at?: string
  updated_at?: string
}

interface NseScriptListItem {
  id?: number | null
  name: string
  description?: string | null
  categories?: string[]
  severity?: string | null
  type: string
  cloned_from?: string | null
  author?: string
}

interface NseProfileListResponse {
  profiles: NseProfile[]
}

interface NseScriptListResponse {
  scripts: NseScriptListItem[]
  total: number
}

export function useNseProfiles() {
  return useQuery({
    queryKey: ['nse', 'profiles'],
    queryFn: () => fetchApi<NseProfileListResponse>('/api/nse/profiles'),
  })
}

export function useNseScripts(search?: string, type?: string) {
  const params = new URLSearchParams()
  if (search) params.set('search', search)
  if (type) params.set('type', type)
  const qs = params.toString()
  return useQuery({
    queryKey: ['nse', 'scripts', { search, type }],
    queryFn: () => fetchApi<NseScriptListResponse>(`/api/nse/scripts${qs ? `?${qs}` : ''}`),
  })
}

export function useNseScriptDetail(scriptName: string) {
  return useQuery({
    queryKey: ['nse', 'scripts', scriptName],
    queryFn: () => fetchApi<NseScript>(`/api/nse/scripts/${encodeURIComponent(scriptName)}`),
    enabled: Boolean(scriptName),
  })
}

export function useNseMutations() {
  const qc = useQueryClient()

  // ── Profile mutations ──

  const createProfile = useMutation({
    mutationFn: (data: { name: string; description?: string; nse_scripts: string[]; severity?: string }) =>
      postApi<NseProfile>('/api/nse/profiles', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nse', 'profiles'] }),
  })

  const updateProfile = useMutation({
    mutationFn: ({ id, ...data }: { id: number; name?: string; description?: string; nse_scripts?: string[]; severity?: string }) =>
      putApi<NseProfile>(`/api/nse/profiles/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nse', 'profiles'] }),
  })

  const deleteProfile = useMutation({
    mutationFn: (id: number) => deleteApi(`/api/nse/profiles/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nse', 'profiles'] }),
  })

  const duplicateProfile = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      postApi<NseProfile>(`/api/nse/profiles/${id}/clone?name=${encodeURIComponent(name)}`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nse', 'profiles'] }),
  })

  // ── Script mutations ──

  const createScript = useMutation({
    mutationFn: (data: { name: string; description?: string; content: string; categories?: string[]; severity?: string; author?: string }) =>
      postApi<NseScript>('/api/nse/scripts', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nse', 'scripts'] }),
  })

  const updateScript = useMutation({
    mutationFn: ({ name, ...data }: { name: string; content?: string; description?: string; categories?: string[]; severity?: string }) =>
      putApi<NseScript>(`/api/nse/scripts/${encodeURIComponent(name)}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nse', 'scripts'] }),
  })

  const deleteScript = useMutation({
    mutationFn: (name: string) => deleteApi(`/api/nse/scripts/${encodeURIComponent(name)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nse', 'scripts'] }),
  })

  const cloneScript = useMutation({
    mutationFn: (name: string) =>
      postApi<NseScript>(`/api/nse/scripts/${encodeURIComponent(name)}/clone`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nse', 'scripts'] }),
  })

  const restoreScript = useMutation({
    mutationFn: (name: string) =>
      postApi<NseScript>(`/api/nse/scripts/${encodeURIComponent(name)}/restore`, {}),
    onSuccess: (_data, name) => {
      qc.invalidateQueries({ queryKey: ['nse', 'scripts'] })
      qc.invalidateQueries({ queryKey: ['nse', 'scripts', name] })
    },
  })

  return {
    createProfile, updateProfile, deleteProfile, duplicateProfile,
    createScript, updateScript, deleteScript, cloneScript, restoreScript,
  }
}
