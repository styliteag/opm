import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../context/AuthContext'
import { API_BASE_URL, extractErrorMessage, fetchJson, getAuthHeaders } from '../../../lib/api'
import type {
  HostDiscoveryScanListResponse,
  PortRuleCreatePayload,
  PortRuleListResponse,
  ScanListResponse,
  ScannerListResponse,
  SSHAlertConfig,
  TriggerHostDiscoveryResponse,
  UpdateNetworkPayload,
} from '../../../types'
import type { NetworkResponse } from '../types'

export function useNetworkDetail(networkId: number) {
  const { token, user } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const isAdmin = user?.role === 'admin'

  const networkQuery = useQuery({
    queryKey: ['networks', networkId],
    queryFn: () => fetchJson<NetworkResponse>(`/api/networks/${networkId}`, token ?? ''),
    enabled: Boolean(token && networkId > 0),
  })

  const scannersQuery = useQuery({
    queryKey: ['scanners'],
    queryFn: () => fetchJson<ScannerListResponse>('/api/scanners', token ?? ''),
    enabled: Boolean(token),
  })

  const scansQuery = useQuery({
    queryKey: ['networks', networkId, 'scans', 'recent'],
    queryFn: () =>
      fetchJson<ScanListResponse>(`/api/networks/${networkId}/scans?limit=10`, token ?? ''),
    enabled: Boolean(token && networkId > 0),
    refetchInterval: (query) => {
      const data = query.state.data as ScanListResponse | undefined
      const hasRunning = data?.scans?.some((s) => s.status === 'running')
      return hasRunning ? 5000 : false
    },
  })

  const rulesQuery = useQuery({
    queryKey: ['networks', networkId, 'rules'],
    queryFn: () => fetchJson<PortRuleListResponse>(`/api/networks/${networkId}/rules`, token ?? ''),
    enabled: Boolean(token && networkId > 0),
  })

  const hostDiscoveryScansQuery = useQuery({
    queryKey: ['networks', networkId, 'host-discovery-scans'],
    queryFn: () =>
      fetchJson<HostDiscoveryScanListResponse>(
        `/api/networks/${networkId}/host-discovery-scans?limit=10`,
        token ?? '',
      ),
    enabled: Boolean(token && networkId > 0),
    refetchInterval: (query) => {
      const data = query.state.data as HostDiscoveryScanListResponse | undefined
      const hasRunning = data?.scans?.some((s) => s.status === 'running')
      return hasRunning ? 5000 : false
    },
  })

  const network = networkQuery.data ?? null
  const rules = rulesQuery.data?.rules ?? []
  const scans = useMemo(() => scansQuery.data?.scans ?? [], [scansQuery.data?.scans])
  const hostDiscoveryScans = useMemo(
    () => hostDiscoveryScansQuery.data?.scans ?? [],
    [hostDiscoveryScansQuery.data?.scans],
  )

  const runningScan = useMemo(() => {
    return scans.find((scan) => scan.status === 'running') ?? null
  }, [scans])

  const runningHostDiscoveryScan = useMemo(() => {
    return hostDiscoveryScans.find((scan) => scan.status === 'running') ?? null
  }, [hostDiscoveryScans])

  const scanner = useMemo(() => {
    if (!network || !scannersQuery.data?.scanners) return null
    return scannersQuery.data.scanners.find((item) => item.id === network.scanner_id) ?? null
  }, [network, scannersQuery.data?.scanners])

  const updateNetworkMutation = useMutation({
    mutationFn: async (payload: UpdateNetworkPayload) => {
      const response = await fetch(`${API_BASE_URL}/api/networks/${networkId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(token ?? ''),
        },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error(await extractErrorMessage(response))
      return response.json()
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['networks', networkId] })
      await queryClient.invalidateQueries({ queryKey: ['networks'] })
    },
  })

  const triggerScanMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API_BASE_URL}/api/networks/${networkId}/scan`, {
        method: 'POST',
        headers: getAuthHeaders(token ?? ''),
      })
      if (!response.ok) throw new Error(await extractErrorMessage(response))
      return response.json()
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['networks', networkId, 'scans', 'recent'],
      })
    },
  })

  const triggerHostDiscoveryMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API_BASE_URL}/api/networks/${networkId}/discover-hosts`, {
        method: 'POST',
        headers: getAuthHeaders(token ?? ''),
      })
      if (!response.ok) throw new Error(await extractErrorMessage(response))
      return response.json() as Promise<TriggerHostDiscoveryResponse>
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['networks', networkId, 'host-discovery-scans'],
      })
    },
  })

  const cancelScanMutation = useMutation({
    mutationFn: async (scanId: number) => {
      const response = await fetch(`${API_BASE_URL}/api/scans/${scanId}/cancel`, {
        method: 'POST',
        headers: getAuthHeaders(token ?? ''),
      })
      if (!response.ok) throw new Error(await extractErrorMessage(response))
      return response.json()
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['networks', networkId, 'scans', 'recent'],
      })
    },
  })

  const deleteNetworkMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API_BASE_URL}/api/networks/${networkId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(token ?? ''),
      })
      if (!response.ok) throw new Error(await extractErrorMessage(response))
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['networks'] })
      navigate('/networks')
    },
  })

  const createRuleMutation = useMutation({
    mutationFn: async (payload: PortRuleCreatePayload) => {
      const response = await fetch(`${API_BASE_URL}/api/networks/${networkId}/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders(token ?? '') },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error(await extractErrorMessage(response))
      return response.json()
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['networks', networkId, 'rules'] })
    },
  })

  const deleteRuleMutation = useMutation({
    mutationFn: async (ruleId: number) => {
      const response = await fetch(`${API_BASE_URL}/api/networks/${networkId}/rules/${ruleId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(token ?? ''),
      })
      if (!response.ok) throw new Error(await extractErrorMessage(response))
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['networks', networkId, 'rules'] })
    },
  })

  const updateAlertSettingsMutation = useMutation({
    mutationFn: async (alertConfig: SSHAlertConfig) => {
      const response = await fetch(`${API_BASE_URL}/api/networks/${networkId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(token ?? ''),
        },
        body: JSON.stringify({ alert_config: alertConfig }),
      })
      if (!response.ok) throw new Error(await extractErrorMessage(response))
      return response.json()
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['networks', networkId] })
    },
  })

  const isLoading = networkQuery.isLoading || scannersQuery.isLoading || scansQuery.isLoading
  const hasError = networkQuery.isError || scannersQuery.isError || scansQuery.isError

  return {
    // Data
    network,
    scanner,
    scans,
    rules,
    hostDiscoveryScans,
    runningScan,
    runningHostDiscoveryScan,
    scanners: scannersQuery.data?.scanners ?? [],
    // State
    isLoading,
    hasError,
    isAdmin,
    // Queries for refetch
    hostDiscoveryScansQuery,
    rulesQuery,
    // Mutations
    updateNetworkMutation,
    triggerScanMutation,
    triggerHostDiscoveryMutation,
    cancelScanMutation,
    deleteNetworkMutation,
    createRuleMutation,
    deleteRuleMutation,
    updateAlertSettingsMutation,
  }
}
