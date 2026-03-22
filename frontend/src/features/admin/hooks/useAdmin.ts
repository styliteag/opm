import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { fetchApi, postApi, putApi, deleteApi } from '@/lib/api'
import type { UserRole } from '@/stores/auth.store'

interface UserItem {
  id: number
  email: string
  role: UserRole
  theme_preference: string
  created_at: string
  updated_at: string
}

interface UserListResponse {
  users: UserItem[]
}

interface RoleInfo {
  name: string
  description: string
  permissions: string[]
}

interface OrgResponse {
  id: number
  name: string
  description: string | null
  logo_url: string | null
  contact_email: string | null
  security_policy_url: string | null
  created_at: string
  updated_at: string
}

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => fetchApi<UserListResponse>('/api/users'),
  })
}

export function useRoles() {
  return useQuery({
    queryKey: ['roles'],
    queryFn: () => fetchApi<RoleInfo[]>('/api/roles'),
  })
}

export function useOrganization() {
  return useQuery({
    queryKey: ['organization'],
    queryFn: () => fetchApi<OrgResponse>('/api/organization'),
  })
}

export function useUserMutations() {
  const qc = useQueryClient()

  const create = useMutation({
    mutationFn: (data: { email: string; password: string; role: UserRole }) =>
      postApi<UserItem>('/api/users', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })

  const update = useMutation({
    mutationFn: ({ id, ...data }: { id: number; email?: string; role?: UserRole }) =>
      putApi<UserItem>(`/api/users/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })

  const remove = useMutation({
    mutationFn: (id: number) => deleteApi(`/api/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })

  return { create, update, remove }
}

export function useOrgMutations() {
  const qc = useQueryClient()

  const update = useMutation({
    mutationFn: (data: { name?: string; description?: string; contact_email?: string }) =>
      putApi<OrgResponse>('/api/organization', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['organization'] }),
  })

  return { update }
}
