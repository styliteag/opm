import React, { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { API_BASE_URL, extractErrorMessage, fetchJson, getAuthHeaders } from '../lib/api'
import type {
  ExcludedPort,
  ExcludedPortListResponse,
  NetworkListResponse,
  OpenPort,
  OpenPortListResponse,
  PortRuleListResponse,
} from '../types'

type SortKey =
  | 'ip'
  | 'port'
  | 'protocol'
  | 'service'
  | 'ttl'
  | 'banner'
  | 'mac'
  | 'first_seen_at'
  | 'last_seen_at'
  | 'network'

type SortDirection = 'asc' | 'desc'

type ProtocolFilter = '' | 'tcp' | 'udp'

const protocolStyles: Record<string, string> = {
  tcp: 'border-sky-300/60 bg-sky-500/15 text-sky-700 dark:border-sky-500/40 dark:bg-sky-500/20 dark:text-sky-200',
  udp: 'border-purple-300/60 bg-purple-500/15 text-purple-700 dark:border-purple-500/40 dark:bg-purple-500/20 dark:text-purple-200',
}

type PortRange = {
  min: number | null
  max: number | null
  error: string | null
}

type ToastMessage = {
  message: string
  tone: 'success' | 'error'
}

type WhitelistScope = 'ip' | 'network'

type WhitelistPayload = {
  network_id: number
  ip: string | null
  port: string
  description: string | null
  scope: WhitelistScope
}

type ExcludeScope = 'ip' | 'network'

type ExcludePayload = {
  network_id: number
  ip: string | null
  port: number
  reason: string
  scope: ExcludeScope
}

const formatDateTime = (value: Date) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value)

const parseUtcDate = (dateStr: string) => {
  // API returns UTC timestamps without timezone suffix, so append 'Z' to parse as UTC
  return new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z')
}

const compressIpv6 = (value: string) => {
  const lower = value.toLowerCase()
  if (!lower.includes(':') || lower.includes('.')) {
    return value
  }

  const parts = lower.split('::')
  if (parts.length > 2) {
    return value
  }

  const left = parts[0] ? parts[0].split(':') : []
  const right = parts.length === 2 && parts[1] ? parts[1].split(':') : []

  if (parts.length === 1) {
    if (left.length !== 8) {
      return value
    }
  } else {
    const missing = 8 - (left.length + right.length)
    if (missing < 0) {
      return value
    }
    left.push(...Array(missing).fill('0'))
    left.push(...right)
  }

  const normalized = left.map((segment) => {
    const trimmed = segment.replace(/^0+(?=[0-9a-f])/i, '')
    return trimmed === '' ? '0' : trimmed
  })

  let bestStart = -1
  let bestLen = 0
  let currentStart = -1
  let currentLen = 0

  normalized.forEach((segment, index) => {
    if (segment === '0') {
      if (currentStart === -1) {
        currentStart = index
        currentLen = 1
      } else {
        currentLen += 1
      }
    } else if (currentLen > 0) {
      if (currentLen > bestLen) {
        bestLen = currentLen
        bestStart = currentStart
      }
      currentStart = -1
      currentLen = 0
    }
  })

  if (currentLen > bestLen) {
    bestLen = currentLen
    bestStart = currentStart
  }

  if (bestLen < 2) {
    return normalized.join(':')
  }

  const compressed = [...normalized]
  compressed.splice(bestStart, bestLen, '')
  let result = compressed.join(':')

  if (result === '') {
    return '::'
  }
  if (result.startsWith(':')) {
    result = `:${result}`
  }
  if (result.endsWith(':')) {
    result = `${result}:`
  }
  return result
}

const formatIpAddress = (value: string) => {
  if (!value.includes(':')) {
    return value
  }
  return compressIpv6(value)
}

const formatSocketAddress = (ip: string, port: number) => {
  const formattedIp = formatIpAddress(ip)
  return formattedIp.includes(':') ? `[${formattedIp}]:${port}` : `${formattedIp}:${port}`
}

const parsePortRange = (value: string): PortRange => {
  const trimmed = value.trim()
  if (!trimmed) {
    return { min: null, max: null, error: null }
  }

  const singleMatch = /^\d+$/.exec(trimmed)
  if (singleMatch) {
    const port = Number(trimmed)
    if (port < 1 || port > 65535) {
      return { min: null, max: null, error: 'Port must be between 1 and 65535.' }
    }
    return { min: port, max: port, error: null }
  }

  const rangeMatch = /^(\d+)\s*-\s*(\d+)$/.exec(trimmed)
  if (!rangeMatch) {
    return {
      min: null,
      max: null,
      error: 'Use a single port (443) or range (80-443).',
    }
  }

  const min = Number(rangeMatch[1])
  const max = Number(rangeMatch[2])
  if (min < 1 || max > 65535) {
    return { min: null, max: null, error: 'Ports must be between 1 and 65535.' }
  }
  if (min > max) {
    return { min: null, max: null, error: 'Port range start must be <= end.' }
  }

  return { min, max, error: null }
}

const serverSortKeys: Partial<Record<SortKey, string>> = {
  ip: 'ip',
  port: 'port',
  first_seen_at: 'first_seen_at',
  last_seen_at: 'last_seen_at',
}

const OpenPorts = () => {
  const { token, user } = useAuth()
  const queryClient = useQueryClient()

  const [networkIdFilter, setNetworkIdFilter] = useState<string>('')
  const [portRangeInput, setPortRangeInput] = useState<string>('')
  const [ipRangeInput, setIpRangeInput] = useState<string>('')
  const [protocolFilter, setProtocolFilter] = useState<ProtocolFilter>('')
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [sortKey, setSortKey] = useState<SortKey>('last_seen_at')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [offset, setOffset] = useState<number>(0)
  const [limit, setLimit] = useState<number>(50)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [whitelistTarget, setWhitelistTarget] = useState<OpenPort | null>(null)
  const [whitelistScope, setWhitelistScope] = useState<WhitelistScope>('ip')
  const [whitelistDescription, setWhitelistDescription] = useState<string>('')
  const [whitelistError, setWhitelistError] = useState<string | null>(null)
  const [excludeTarget, setExcludeTarget] = useState<OpenPort | null>(null)
  const [excludeScope, setExcludeScope] = useState<ExcludeScope>('ip')
  const [excludeReason, setExcludeReason] = useState<string>('')
  const [excludeError, setExcludeError] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastMessage | null>(null)

  const portRange = useMemo(() => parsePortRange(portRangeInput), [portRangeInput])
  const trimmedIpRange = ipRangeInput.trim()
  const networkIdValue = networkIdFilter ? Number(networkIdFilter) : null
  const isAdmin = user?.role === 'admin'

  const serverSortBy = useMemo(() => {
    return serverSortKeys[sortKey] ?? 'last_seen_at'
  }, [sortKey])

  const serverSortDir = useMemo(() => {
    if (serverSortKeys[sortKey]) {
      return sortDirection
    }
    return 'desc'
  }, [sortDirection, sortKey])

  const handleCopyIp = async (ip: string) => {
    const formatted = formatIpAddress(ip)
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(formatted)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = formatted
        textarea.style.position = 'fixed'
        textarea.style.left = '-9999px'
        textarea.setAttribute('readonly', 'true')
        document.body.appendChild(textarea)
        textarea.select()
        const success = document.execCommand('copy')
        document.body.removeChild(textarea)
        if (!success) {
          throw new Error('Copy failed')
        }
      }
      setToast({ message: 'IP address copied to clipboard.', tone: 'success' })
    } catch (error) {
      setToast({
        message: error instanceof Error ? error.message : 'Failed to copy IP address.',
        tone: 'error',
      })
    }
  }

  useEffect(() => {
    setOffset(0)
  }, [networkIdFilter, portRangeInput, ipRangeInput, protocolFilter, sortKey, sortDirection, limit])

  useEffect(() => {
    if (!toast) {
      return
    }
    const timeout = window.setTimeout(() => {
      setToast(null)
    }, 3200)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const networksQuery = useQuery({
    queryKey: ['networks'],
    queryFn: () => fetchJson<NetworkListResponse>('/api/networks', token ?? ''),
    enabled: Boolean(token),
  })

  const portsQuery = useQuery({
    queryKey: [
      'ports',
      networkIdValue,
      portRange.min,
      portRange.max,
      trimmedIpRange,
      serverSortBy,
      serverSortDir,
      offset,
      limit,
    ],
    queryFn: () => {
      const params = new URLSearchParams()
      if (networkIdValue && Number.isFinite(networkIdValue)) {
        params.set('network_id', String(networkIdValue))
      }
      if (portRange.min !== null) {
        params.set('port_min', String(portRange.min))
      }
      if (portRange.max !== null) {
        params.set('port_max', String(portRange.max))
      }
      if (trimmedIpRange) {
        params.set('ip_range', trimmedIpRange)
      }
      params.set('sort_by', serverSortBy)
      params.set('sort_dir', serverSortDir)
      params.set('offset', String(offset))
      params.set('limit', String(limit))
      const queryString = params.toString()
      return fetchJson<OpenPortListResponse>(
        `/api/ports${queryString ? `?${queryString}` : ''}`,
        token ?? '',
      )
    },
    enabled: Boolean(token) && !portRange.error,
  })

  const ports = useMemo(() => portsQuery.data?.ports ?? [], [portsQuery.data])
  const networks = useMemo(() => networksQuery.data?.networks ?? [], [networksQuery.data])
  const networkMap = useMemo(() => {
    return new Map(networks.map((network) => [network.id, network.name]))
  }, [networks])
  const excludedNetworkIds = useMemo(() => {
    if (networkIdValue && Number.isFinite(networkIdValue)) {
      return [networkIdValue]
    }
    const ids = new Set(ports.map((port) => port.network_id))
    return Array.from(ids).sort((a, b) => a - b)
  }, [networkIdValue, ports])
  const excludedNetworkKey = excludedNetworkIds.join(',')

  const exclusionsQuery = useQuery({
    queryKey: ['excluded-ports', excludedNetworkKey],
    queryFn: async () => {
      const results = await Promise.all(
        excludedNetworkIds.map((networkId) =>
          fetchJson<ExcludedPortListResponse>(`/api/networks/${networkId}/excluded`, token ?? ''),
        ),
      )
      return results.flatMap((result) => result.excluded_ports)
    },
    enabled: Boolean(token) && excludedNetworkIds.length > 0 && isAdmin,
  })

  const exclusions = useMemo(() => exclusionsQuery.data ?? [], [exclusionsQuery.data])
  const exclusionSets = useMemo(() => {
    const ipKeys = new Set<string>()
    const networkKeys = new Set<string>()
    const reasonMap = new Map<string, string>()
    const exclusionIdMap = new Map<string, { exclusionId: number; networkId: number }>()
    exclusions.forEach((exclusion) => {
      if (exclusion.ip) {
        const key = `${exclusion.network_id}:${exclusion.ip}:${exclusion.port}`
        ipKeys.add(key)
        reasonMap.set(key, exclusion.reason)
        exclusionIdMap.set(key, { exclusionId: exclusion.id, networkId: exclusion.network_id })
      } else {
        const key = `${exclusion.network_id}:${exclusion.port}`
        networkKeys.add(key)
        reasonMap.set(key, exclusion.reason)
        exclusionIdMap.set(key, { exclusionId: exclusion.id, networkId: exclusion.network_id })
      }
    })
    return { ipKeys, networkKeys, reasonMap, exclusionIdMap }
  }, [exclusions])

  const portRulesQuery = useQuery({
    queryKey: ['port-rules', excludedNetworkKey],
    queryFn: async () => {
      const results = await Promise.all(
        excludedNetworkIds.map((networkId) =>
          fetchJson<PortRuleListResponse>(`/api/networks/${networkId}/rules`, token ?? ''),
        ),
      )
      return results.flatMap((result) => result.rules)
    },
    enabled: Boolean(token) && excludedNetworkIds.length > 0 && isAdmin,
  })

  const portRules = useMemo(() => portRulesQuery.data ?? [], [portRulesQuery.data])

  const allowedSets = useMemo(() => {
    const ipKeys = new Set<string>()
    const networkKeys = new Set<string>()
    const ruleIdMap = new Map<string, { ruleId: number; networkId: number }>()
    portRules.forEach((rule) => {
      if (rule.rule_type !== 'allow') return
      if (rule.ip) {
        const key = `${rule.network_id}:${rule.ip}:${rule.port}`
        ipKeys.add(key)
        ruleIdMap.set(key, { ruleId: rule.id, networkId: rule.network_id })
      } else {
        const key = `${rule.network_id}:${rule.port}`
        networkKeys.add(key)
        ruleIdMap.set(key, { ruleId: rule.id, networkId: rule.network_id })
      }
    })
    return { ipKeys, networkKeys, ruleIdMap }
  }, [portRules])

  const whitelistMutation = useMutation({
    mutationFn: async (payload: WhitelistPayload) => {
      const body = {
        network_id: payload.network_id,
        ip: payload.ip,
        port: payload.port,
        description: payload.description,
      }
      const response = await fetch(`${API_BASE_URL}/api/ports/whitelist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(token ?? ''),
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const message = await extractErrorMessage(response)
        throw new Error(message)
      }

      return response.json()
    },
    onSuccess: async (_data, payload) => {
      await queryClient.invalidateQueries({ queryKey: ['port-rules'] })

      setToast({
        message:
          payload.scope === 'network'
            ? `Port ${payload.port} allowlisted for network.`
            : `Port ${payload.port} on ${payload.ip} allowlisted.`,
        tone: 'success',
      })
      setWhitelistTarget(null)
      setWhitelistScope('ip')
      setWhitelistDescription('')
      setWhitelistError(null)
    },
    onError: (error) => {
      setWhitelistError(error instanceof Error ? error.message : 'Failed to whitelist port.')
    },
  })

  const excludeMutation = useMutation({
    mutationFn: async (payload: ExcludePayload) => {
      const body = {
        network_id: payload.network_id,
        ip: payload.ip,
        port: payload.port,
        reason: payload.reason,
      }
      const response = await fetch(`${API_BASE_URL}/api/ports/exclude`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(token ?? ''),
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const message = await extractErrorMessage(response)
        throw new Error(message)
      }

      return response.json() as Promise<ExcludedPort>
    },
    onSuccess: async (data) => {
      setToast({
        message: data.ip
          ? `Port ${data.port} on ${data.ip} excluded.`
          : `Port ${data.port} excluded for entire network.`,
        tone: 'success',
      })
      setExcludeTarget(null)
      setExcludeScope('ip')
      setExcludeReason('')
      setExcludeError(null)
      queryClient.setQueryData<ExcludedPort[]>(['excluded-ports', excludedNetworkKey], (prev) => {
        const next = prev ? [...prev] : []
        if (!next.find((entry) => entry.id === data.id)) {
          next.push(data)
        }
        return next
      })
      await queryClient.invalidateQueries({ queryKey: ['excluded-ports'] })
    },
    onError: (error) => {
      setExcludeError(error instanceof Error ? error.message : 'Failed to exclude port.')
    },
  })

  const removeWhitelistMutation = useMutation({
    mutationFn: async (payload: { networkId: number; ruleId: number }) => {
      const response = await fetch(
        `${API_BASE_URL}/api/networks/${payload.networkId}/rules/${payload.ruleId}`,
        {
          method: 'DELETE',
          headers: {
            ...getAuthHeaders(token ?? ''),
          },
        },
      )

      if (!response.ok) {
        const message = await extractErrorMessage(response)
        throw new Error(message)
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['port-rules'] })
      setToast({
        message: 'Whitelist entry removed.',
        tone: 'success',
      })
    },
    onError: (error) => {
      setToast({
        message: error instanceof Error ? error.message : 'Failed to remove whitelist.',
        tone: 'error',
      })
    },
  })

  const removeExclusionMutation = useMutation({
    mutationFn: async (payload: { networkId: number; exclusionId: number }) => {
      const response = await fetch(
        `${API_BASE_URL}/api/networks/${payload.networkId}/excluded/${payload.exclusionId}`,
        {
          method: 'DELETE',
          headers: {
            ...getAuthHeaders(token ?? ''),
          },
        },
      )

      if (!response.ok) {
        const message = await extractErrorMessage(response)
        throw new Error(message)
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['excluded-ports'] })
      setToast({
        message: 'Exclusion removed.',
        tone: 'success',
      })
    },
    onError: (error) => {
      setToast({
        message: error instanceof Error ? error.message : 'Failed to remove exclusion.',
        tone: 'error',
      })
    },
  })

  const searchNeedle = searchTerm.trim().toLowerCase()

  const filteredPorts = useMemo(() => {
    let filtered = ports

    // Filter by protocol
    if (protocolFilter) {
      filtered = filtered.filter((port) => port.protocol.toLowerCase() === protocolFilter)
    }

    // Filter by search term
    if (searchNeedle) {
      filtered = filtered.filter((port) => {
        const networkName = networkMap.get(port.network_id) ?? ''
        const values = [
          port.ip,
          String(port.port),
          port.protocol,
          port.service_guess ?? '',
          port.banner ?? '',
          port.mac_address ?? '',
          port.mac_vendor ?? '',
          networkName,
        ]
        return values.some((value) => value.toLowerCase().includes(searchNeedle))
      })
    }

    return filtered
  }, [networkMap, ports, protocolFilter, searchNeedle])

  const sortedPorts = useMemo(() => {
    const direction = sortDirection === 'asc' ? 1 : -1
    const sorted = [...filteredPorts]
    const getValue = (port: OpenPort): string | number => {
      switch (sortKey) {
        case 'ip':
          return port.ip
        case 'port':
          return port.port
        case 'protocol':
          return port.protocol
        case 'service':
          return port.service_guess ?? ''
        case 'ttl':
          return port.ttl ?? -1
        case 'banner':
          return port.banner ?? ''
        case 'mac':
          return port.mac_address ?? port.mac_vendor ?? ''
        case 'first_seen_at':
          return parseUtcDate(port.first_seen_at).getTime()
        case 'last_seen_at':
          return parseUtcDate(port.last_seen_at).getTime()
        case 'network':
          return networkMap.get(port.network_id) ?? ''
        default:
          return port.ip
      }
    }
    sorted.sort((a, b) => {
      const valueA = getValue(a)
      const valueB = getValue(b)
      if (typeof valueA === 'number' && typeof valueB === 'number') {
        return (valueA - valueB) * direction
      }
      return String(valueA).localeCompare(String(valueB)) * direction
    })
    return sorted
  }, [filteredPorts, networkMap, sortDirection, sortKey])

  const getNetworkAllowKey = (port: OpenPort) => `${port.network_id}:${String(port.port)}`

  const getIpAllowKey = (port: OpenPort) => `${port.network_id}:${port.ip}:${String(port.port)}`

  const isAllowed = (port: OpenPort) =>
    allowedSets.networkKeys.has(getNetworkAllowKey(port)) ||
    allowedSets.ipKeys.has(getIpAllowKey(port))

  const getNetworkExcludeKey = (port: OpenPort) => `${port.network_id}:${String(port.port)}`

  const getIpExcludeKey = (port: OpenPort) => `${port.network_id}:${port.ip}:${String(port.port)}`

  const isExcluded = (port: OpenPort) =>
    exclusionSets.networkKeys.has(getNetworkExcludeKey(port)) ||
    exclusionSets.ipKeys.has(getIpExcludeKey(port))

  const getExcludeReason = (port: OpenPort) =>
    exclusionSets.reasonMap.get(getIpExcludeKey(port)) ??
    exclusionSets.reasonMap.get(getNetworkExcludeKey(port))

  const getAllowRuleInfo = (port: OpenPort) =>
    allowedSets.ruleIdMap.get(getIpAllowKey(port)) ??
    allowedSets.ruleIdMap.get(getNetworkAllowKey(port))

  const getExclusionInfo = (port: OpenPort) =>
    exclusionSets.exclusionIdMap.get(getIpExcludeKey(port)) ??
    exclusionSets.exclusionIdMap.get(getNetworkExcludeKey(port))

  const handleRemoveWhitelist = (port: OpenPort) => {
    const ruleInfo = getAllowRuleInfo(port)
    if (ruleInfo) {
      removeWhitelistMutation.mutate({
        networkId: ruleInfo.networkId,
        ruleId: ruleInfo.ruleId,
      })
    }
  }

  const handleRemoveExclusion = (port: OpenPort) => {
    const exclusionInfo = getExclusionInfo(port)
    if (exclusionInfo) {
      removeExclusionMutation.mutate({
        networkId: exclusionInfo.networkId,
        exclusionId: exclusionInfo.exclusionId,
      })
    }
  }

  const handleSortChange = (key: SortKey) => {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        setSortDirection((prevDirection) => (prevDirection === 'asc' ? 'desc' : 'asc'))
        return prevKey
      }
      setSortDirection('asc')
      return key
    })
  }

  const toggleExpanded = (rowKey: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(rowKey)) {
        next.delete(rowKey)
      } else {
        next.add(rowKey)
      }
      return next
    })
  }

  const openWhitelistModal = (port: OpenPort) => {
    setWhitelistTarget(port)
    setWhitelistScope('ip')
    setWhitelistDescription('')
    setWhitelistError(null)
  }

  const closeWhitelistModal = () => {
    setWhitelistTarget(null)
    setWhitelistScope('ip')
    setWhitelistDescription('')
    setWhitelistError(null)
  }

  const openExcludeModal = (port: OpenPort) => {
    setExcludeTarget(port)
    setExcludeScope('ip')
    setExcludeReason('')
    setExcludeError(null)
  }

  const closeExcludeModal = () => {
    setExcludeTarget(null)
    setExcludeScope('ip')
    setExcludeReason('')
    setExcludeError(null)
  }

  const handleWhitelistSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setWhitelistError(null)

    if (!token || !whitelistTarget) {
      setWhitelistError('Authentication required to whitelist ports.')
      return
    }

    whitelistMutation.mutate({
      network_id: whitelistTarget.network_id,
      ip: whitelistScope === 'ip' ? whitelistTarget.ip : null,
      port: String(whitelistTarget.port),
      description: whitelistDescription.trim() || null,
      scope: whitelistScope,
    })
  }

  const handleExcludeSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setExcludeError(null)

    if (!token || !excludeTarget) {
      setExcludeError('Authentication required to exclude ports.')
      return
    }

    const trimmedReason = excludeReason.trim()
    if (!trimmedReason) {
      setExcludeError('Reason is required to exclude a port.')
      return
    }

    excludeMutation.mutate({
      network_id: excludeTarget.network_id,
      ip: excludeScope === 'ip' ? excludeTarget.ip : null,
      port: excludeTarget.port,
      reason: trimmedReason,
      scope: excludeScope,
    })
  }

  const handleExport = () => {
    if (sortedPorts.length === 0) {
      return
    }
    const headers = [
      'ip',
      'port',
      'protocol',
      'service',
      'ttl',
      'banner',
      'mac_address',
      'mac_vendor',
      'first_seen_at',
      'last_seen_at',
      'network',
    ]

    const escapeValue = (value: string | number | null | undefined) => {
      if (value === null || value === undefined) {
        return ''
      }
      const stringValue = String(value)
      const escaped = stringValue.replace(/"/g, '""')
      if (/[,\n"]/.test(escaped)) {
        return `"${escaped}"`
      }
      return escaped
    }

    const rows = sortedPorts.map((port) => [
      port.ip,
      port.port,
      port.protocol,
      port.service_guess ?? '',
      port.ttl ?? '',
      port.banner ?? '',
      port.mac_address ?? '',
      port.mac_vendor ?? '',
      port.first_seen_at,
      port.last_seen_at,
      networkMap.get(port.network_id) ?? `Network ${port.network_id}`,
    ])

    const csv = [headers.join(','), ...rows.map((row) => row.map(escapeValue).join(','))]
      .join('\n')
      .trim()

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `open-ports-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  }

  const hasError = portsQuery.isError || networksQuery.isError
  const isLoading = portsQuery.isLoading || networksQuery.isLoading
  const isFetching = portsQuery.isFetching
  const isEmpty = sortedPorts.length === 0

  const page = Math.floor(offset / limit) + 1
  const hasPrevious = offset > 0
  const hasNext = ports.length === limit

  const uniqueNetworks = useMemo(() => {
    const networkIds = new Set(sortedPorts.map((port) => port.network_id))
    return networkIds.size
  }, [sortedPorts])

  const renderSortButton = (label: string, key: SortKey) => {
    const isActive = sortKey === key
    return (
      <button
        type="button"
        onClick={() => handleSortChange(key)}
        className="group flex items-center gap-2 text-left"
      >
        <span>{label}</span>
        <span
          className={`text-[10px] font-semibold ${
            isActive ? 'text-slate-700 dark:text-slate-200' : 'text-slate-300 dark:text-slate-600'
          }`}
        >
          {isActive ? (sortDirection === 'asc' ? '^' : 'v') : ''}
        </span>
      </button>
    )
  }

  return (
    <div className="relative">
      <div className="pointer-events-none absolute -left-24 top-20 h-72 w-72 animate-drift rounded-full bg-cyan-500/15 blur-[140px]" />
      <div className="pointer-events-none absolute right-8 top-16 h-64 w-64 animate-drift rounded-full bg-emerald-500/20 blur-[140px]" />
      <div className="pointer-events-none absolute right-0 top-80 h-64 w-64 animate-drift rounded-full bg-sky-500/15 blur-[140px]" />

      {toast ? (
        <div className="fixed right-6 top-6 z-50">
          <div
            className={`animate-rise rounded-2xl border px-4 py-3 text-sm font-semibold shadow-xl ${
              toast.tone === 'success'
                ? 'border-emerald-200/70 bg-emerald-50/90 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-100'
                : 'border-rose-200/70 bg-rose-50/90 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-100'
            }`}
          >
            {toast.message}
          </div>
        </div>
      ) : null}

      <section className="relative z-10 space-y-8">
        <div className="rounded-3xl border border-slate-200/70 bg-white/80 p-8 shadow-[0_20px_80px_rgba(15,23,42,0.12)] backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/70">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Open Ports</p>
              <h2 className="mt-3 font-display text-3xl text-slate-900 dark:text-white">
                Network Exposure Snapshot
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
                Review the latest open ports across your networks, filter down to the riskiest
                services, and export what you need for reporting.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleExport}
                className="rounded-full border border-emerald-200 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-500/20 dark:border-emerald-500/40 dark:text-emerald-200 dark:hover:border-emerald-400 dark:hover:bg-emerald-500/30"
              >
                Export CSV
              </button>
              <Link
                to="/alerts"
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
              >
                View alerts
              </Link>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-[1.1fr_0.8fr_0.9fr_1fr]">
            <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-4 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Ports in view
              </p>
              <p className="mt-3 text-3xl font-semibold text-slate-900 dark:text-white">
                {sortedPorts.length}
              </p>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Page {page} {isFetching ? '(refreshing)' : ''}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-4 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Networks represented
              </p>
              <p className="mt-3 text-3xl font-semibold text-slate-900 dark:text-white">
                {uniqueNetworks}
              </p>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                From latest scans only
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-4 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Current filters
              </p>
              <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">
                {networkIdValue
                  ? (networkMap.get(networkIdValue) ?? `Network ${networkIdValue}`)
                  : 'All networks'}
              </p>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {portRangeInput ? `Ports ${portRangeInput}` : 'All ports'}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {trimmedIpRange ? `IP ${trimmedIpRange}` : 'Any IP range'}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-4 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Quick search
              </p>
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search IP, service, banner, MAC"
                className="mt-3 w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
              />
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {searchNeedle ? `Filtering ${sortedPorts.length} rows` : 'Type to filter'}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-[1.1fr_0.9fr_1fr_0.7fr_0.7fr]">
            <div>
              <label
                htmlFor="network-filter"
                className="text-xs font-semibold text-slate-500 dark:text-slate-400"
              >
                Network
              </label>
              <select
                id="network-filter"
                value={networkIdFilter}
                onChange={(event) => setNetworkIdFilter(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="">All networks</option>
                {networks.map((network) => (
                  <option key={network.id} value={network.id}>
                    {network.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="port-range"
                className="text-xs font-semibold text-slate-500 dark:text-slate-400"
              >
                Port range
              </label>
              <input
                id="port-range"
                type="text"
                value={portRangeInput}
                onChange={(event) => setPortRangeInput(event.target.value)}
                placeholder="80-443"
                className="mt-2 w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
              />
              {portRange.error ? (
                <p className="mt-2 text-xs text-rose-500">{portRange.error}</p>
              ) : null}
            </div>
            <div>
              <label
                htmlFor="ip-range"
                className="text-xs font-semibold text-slate-500 dark:text-slate-400"
              >
                IP range
              </label>
              <input
                id="ip-range"
                type="text"
                value={ipRangeInput}
                onChange={(event) => setIpRangeInput(event.target.value)}
                placeholder="192.168.1.0/24 or 192.168.1.10-192.168.1.50"
                className="mt-2 w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label
                htmlFor="protocol-filter"
                className="text-xs font-semibold text-slate-500 dark:text-slate-400"
              >
                Protocol
              </label>
              <select
                id="protocol-filter"
                value={protocolFilter}
                onChange={(event) => setProtocolFilter(event.target.value as ProtocolFilter)}
                className="mt-2 w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="">All protocols</option>
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
              </select>
            </div>
            <div>
              <label
                htmlFor="page-size"
                className="text-xs font-semibold text-slate-500 dark:text-slate-400"
              >
                Page size
              </label>
              <select
                id="page-size"
                value={limit}
                onChange={(event) => setLimit(Number(event.target.value))}
                className="mt-2 w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
                <option value={500}>500</option>
                <option value={10000}>10000</option>
              </select>
            </div>
          </div>

          {hasError ? (
            <div className="mt-6 rounded-2xl border border-rose-200/70 bg-rose-50/80 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100">
              {portRange.error
                ? 'Fix the port range filter to load open ports.'
                : 'Unable to load open ports right now.'}
            </div>
          ) : null}

          <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200/70 dark:border-slate-800/70">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-200/70 bg-slate-50/80 text-xs font-semibold text-slate-500 dark:border-slate-800/70 dark:bg-slate-900/60 dark:text-slate-300">
                  <th className="whitespace-nowrap px-4 py-3">{renderSortButton('IP', 'ip')}</th>
                  <th className="whitespace-nowrap px-4 py-3">
                    {renderSortButton('Port', 'port')}
                  </th>
                  <th className="whitespace-nowrap px-4 py-3">
                    {renderSortButton('Protocol', 'protocol')}
                  </th>
                  <th className="whitespace-nowrap px-4 py-3">
                    {renderSortButton('First Seen', 'first_seen_at')}
                  </th>
                  <th className="whitespace-nowrap px-4 py-3">
                    {renderSortButton('Last Seen', 'last_seen_at')}
                  </th>
                  <th className="whitespace-nowrap px-4 py-3">
                    {renderSortButton('Network', 'network')}
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
                {isLoading ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400"
                    >
                      Loading open ports...
                    </td>
                  </tr>
                ) : isEmpty ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400"
                    >
                      No open ports match the current filters.
                    </td>
                  </tr>
                ) : (
                  sortedPorts.map((port) => {
                    const rowKey = `${port.network_id}-${port.ip}-${port.port}-${port.protocol}`
                    const isExpanded = expandedRows.has(rowKey)
                    const networkName =
                      networkMap.get(port.network_id) ?? `Network ${port.network_id}`
                    const allowed = isAllowed(port)
                    const excluded = isExcluded(port)
                    const excludedReason = getExcludeReason(port)

                    return (
                      <React.Fragment key={rowKey}>
                        <tr className="bg-white/60 text-sm transition hover:bg-slate-50/80 dark:bg-slate-950/40 dark:hover:bg-slate-900/40">
                          <td className="px-4 py-3 font-mono text-slate-900 dark:text-white">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className="max-w-[240px] break-all text-slate-900 dark:text-white"
                                title={port.ip}
                              >
                                {formatIpAddress(port.ip)}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCopyIp(port.ip)}
                                className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-900"
                              >
                                Copy
                              </button>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 font-mono text-slate-700 dark:text-slate-200">
                            {port.port}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${
                                protocolStyles[port.protocol.toLowerCase()] ??
                                'border-slate-300/60 bg-slate-500/15 text-slate-700 dark:border-slate-500/40 dark:bg-slate-500/20 dark:text-slate-200'
                              }`}
                            >
                              {port.protocol}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-500 dark:text-slate-400">
                            {formatDateTime(parseUtcDate(port.first_seen_at))}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-500 dark:text-slate-400">
                            {formatDateTime(parseUtcDate(port.last_seen_at))}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">
                            {networkName}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {allowed && isAdmin ? (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveWhitelist(port)}
                                  disabled={removeWhitelistMutation.isPending}
                                  title="Click to remove from whitelist"
                                  className="inline-flex cursor-pointer items-center rounded-full border border-emerald-300/60 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-500/40 dark:bg-emerald-500/20 dark:text-emerald-200 dark:hover:bg-emerald-500/30"
                                >
                                  Allowed ×
                                </button>
                              ) : allowed ? (
                                <span className="inline-flex items-center rounded-full border border-emerald-300/60 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/20 dark:text-emerald-200">
                                  Allowed
                                </span>
                              ) : null}
                              {excluded && isAdmin ? (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveExclusion(port)}
                                  disabled={removeExclusionMutation.isPending}
                                  title={`${excludedReason ?? 'Excluded'} - Click to remove`}
                                  className="inline-flex cursor-pointer items-center rounded-full border border-rose-300/60 bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-600 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-500/40 dark:bg-rose-500/20 dark:text-rose-200 dark:hover:bg-rose-500/30"
                                >
                                  Excluded ×
                                </button>
                              ) : excluded ? (
                                <span
                                  title={excludedReason ?? 'Excluded'}
                                  className="inline-flex items-center rounded-full border border-rose-300/60 bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-600 dark:border-rose-500/40 dark:bg-rose-500/20 dark:text-rose-200"
                                >
                                  Excluded
                                </span>
                              ) : null}
                              {isAdmin ? (
                                <button
                                  type="button"
                                  onClick={() => openWhitelistModal(port)}
                                  disabled={allowed}
                                  className="rounded border border-emerald-200 px-2 py-1 text-xs font-medium text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-500/40 dark:text-emerald-200 dark:hover:border-emerald-400 dark:hover:bg-emerald-500/20"
                                >
                                  {allowed ? 'Whitelisted' : 'Whitelist'}
                                </button>
                              ) : null}
                              {isAdmin ? (
                                <button
                                  type="button"
                                  onClick={() => openExcludeModal(port)}
                                  disabled={excluded}
                                  className="rounded border border-rose-200 px-2 py-1 text-xs font-medium text-rose-600 transition hover:border-rose-300 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-500/40 dark:text-rose-200 dark:hover:border-rose-400 dark:hover:bg-rose-500/20"
                                >
                                  {excluded ? 'Excluded' : 'Exclude'}
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => toggleExpanded(rowKey)}
                                className="rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
                              >
                                {isExpanded ? 'Hide' : 'Details'}
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded ? (
                          <tr className="bg-slate-50/50 dark:bg-slate-900/30">
                            <td colSpan={7} className="px-4 py-4">
                              <div className="rounded-xl border border-slate-200/70 bg-white p-4 text-sm text-slate-700 dark:border-slate-800/70 dark:bg-slate-900 dark:text-slate-200">
                                <div className="grid gap-4 md:grid-cols-3">
                                  <div>
                                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                      Address
                                    </p>
                                    <div className="mt-1 flex flex-wrap items-center gap-2">
                                      <p
                                        className="max-w-full break-all font-mono text-slate-900 dark:text-white"
                                        title={port.ip}
                                      >
                                        {formatSocketAddress(port.ip, port.port)}
                                      </p>
                                      <button
                                        type="button"
                                        onClick={() => handleCopyIp(port.ip)}
                                        className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-900"
                                      >
                                        Copy IP
                                      </button>
                                    </div>
                                    <p className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                                      Protocol:{' '}
                                      <span
                                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${
                                          protocolStyles[port.protocol.toLowerCase()] ??
                                          'border-slate-300/60 bg-slate-500/15 text-slate-700 dark:border-slate-500/40 dark:bg-slate-500/20 dark:text-slate-200'
                                        }`}
                                      >
                                        {port.protocol}
                                      </span>
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                      Service
                                    </p>
                                    <p className="mt-1 text-slate-900 dark:text-white">
                                      {port.service_guess || '--'}
                                    </p>
                                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                      TTL: {port.ttl ?? '--'}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                      Network
                                    </p>
                                    <p className="mt-1 text-slate-900 dark:text-white">
                                      {networkName}
                                    </p>
                                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                      First seen: {formatDateTime(parseUtcDate(port.first_seen_at))}
                                    </p>
                                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                      Last seen: {formatDateTime(parseUtcDate(port.last_seen_at))}
                                    </p>
                                  </div>
                                </div>
                                <div className="mt-4 grid gap-4 md:grid-cols-2">
                                  <div>
                                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                      MAC address
                                    </p>
                                    <p className="mt-1 font-mono text-slate-900 dark:text-white">
                                      {port.mac_address || '--'}
                                    </p>
                                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                      Vendor: {port.mac_vendor || '--'}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                      Banner
                                    </p>
                                    <div className="mt-1 rounded-lg border border-slate-200/70 bg-slate-50 p-2 text-xs dark:border-slate-700 dark:bg-slate-800">
                                      <pre className="whitespace-pre-wrap break-words font-mono text-slate-700 dark:text-slate-200">
                                        {port.banner || 'No banner captured.'}
                                      </pre>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </React.Fragment>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600 dark:text-slate-300">
            <div>
              Showing {sortedPorts.length} of {ports.length} ports on page {page}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={!hasPrevious}
                onClick={() => setOffset(Math.max(0, offset - limit))}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={!hasNext}
                onClick={() => setOffset(offset + limit)}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </section>

      {whitelistTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-8">
          <div className="w-full max-w-lg rounded-3xl border border-emerald-200/70 bg-white/95 p-6 shadow-2xl dark:border-emerald-500/40 dark:bg-slate-950">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-300">
                  Whitelist port
                </p>
                <h3 className="mt-2 font-display text-2xl text-slate-900 dark:text-white">
                  Add to allowlist
                </h3>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  Add port {whitelistTarget.port} on {whitelistTarget.ip} to the allowlist?
                </p>
              </div>
              <button
                type="button"
                onClick={closeWhitelistModal}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
              >
                Close
              </button>
            </div>

            <form className="mt-6 space-y-4" onSubmit={handleWhitelistSubmit}>
              <fieldset className="space-y-3">
                <legend className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Scope
                </legend>
                <label className="flex items-center gap-3 rounded-2xl border border-slate-200/70 bg-slate-50/80 px-4 py-3 text-sm text-slate-700 dark:border-slate-800/70 dark:bg-slate-900/60 dark:text-slate-200">
                  <input
                    type="radio"
                    name="whitelist-scope"
                    value="ip"
                    checked={whitelistScope === 'ip'}
                    onChange={() => setWhitelistScope('ip')}
                    className="h-4 w-4 border-slate-300 text-emerald-600 focus:ring-emerald-500 dark:border-slate-600 dark:bg-slate-800"
                  />
                  <span>
                    This IP only ({whitelistTarget.ip}:{whitelistTarget.port})
                  </span>
                </label>
                <label className="flex items-center gap-3 rounded-2xl border border-slate-200/70 bg-slate-50/80 px-4 py-3 text-sm text-slate-700 dark:border-slate-800/70 dark:bg-slate-900/60 dark:text-slate-200">
                  <input
                    type="radio"
                    name="whitelist-scope"
                    value="network"
                    checked={whitelistScope === 'network'}
                    onChange={() => setWhitelistScope('network')}
                    className="h-4 w-4 border-slate-300 text-emerald-600 focus:ring-emerald-500 dark:border-slate-600 dark:bg-slate-800"
                  />
                  <span>Any IP in network</span>
                </label>
              </fieldset>

              <label className="block space-y-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                Description (optional)
                <input
                  type="text"
                  value={whitelistDescription}
                  onChange={(event) => setWhitelistDescription(event.target.value)}
                  placeholder="Why this port is expected"
                  className="w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>

              {whitelistError ? (
                <div className="rounded-2xl border border-rose-200/70 bg-rose-50/80 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100">
                  {whitelistError}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeWhitelistModal}
                  className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={whitelistMutation.isPending}
                  className="rounded-full border border-emerald-200 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-500/40 dark:text-emerald-200 dark:hover:border-emerald-400 dark:hover:bg-emerald-500/30"
                >
                  {whitelistMutation.isPending ? 'Allowlisting...' : 'Confirm allowlist'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {excludeTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-8">
          <div className="w-full max-w-lg rounded-3xl border border-rose-200/70 bg-white/95 p-6 shadow-2xl dark:border-rose-500/40 dark:bg-slate-950">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-rose-600 dark:text-rose-300">
                  Exclude port
                </p>
                <h3 className="mt-2 font-display text-2xl text-slate-900 dark:text-white">
                  Hide from results
                </h3>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  Exclude port {excludeTarget.port} on {excludeTarget.ip} from scan results?
                </p>
              </div>
              <button
                type="button"
                onClick={closeExcludeModal}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
              >
                Close
              </button>
            </div>

            <form className="mt-6 space-y-4" onSubmit={handleExcludeSubmit}>
              <fieldset className="space-y-3">
                <legend className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Scope
                </legend>
                <label className="flex items-center gap-3 rounded-2xl border border-slate-200/70 bg-slate-50/80 px-4 py-3 text-sm text-slate-700 dark:border-slate-800/70 dark:bg-slate-900/60 dark:text-slate-200">
                  <input
                    type="radio"
                    name="exclude-scope"
                    value="ip"
                    checked={excludeScope === 'ip'}
                    onChange={() => setExcludeScope('ip')}
                    className="h-4 w-4 border-slate-300 text-rose-600 focus:ring-rose-500 dark:border-slate-600 dark:bg-slate-800"
                  />
                  <span>
                    This IP only ({excludeTarget.ip}:{excludeTarget.port})
                  </span>
                </label>
                <label className="flex items-center gap-3 rounded-2xl border border-slate-200/70 bg-slate-50/80 px-4 py-3 text-sm text-slate-700 dark:border-slate-800/70 dark:bg-slate-900/60 dark:text-slate-200">
                  <input
                    type="radio"
                    name="exclude-scope"
                    value="network"
                    checked={excludeScope === 'network'}
                    onChange={() => setExcludeScope('network')}
                    className="h-4 w-4 border-slate-300 text-rose-600 focus:ring-rose-500 dark:border-slate-600 dark:bg-slate-800"
                  />
                  <span>Any IP in network</span>
                </label>
              </fieldset>

              <label className="block space-y-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                Reason (required)
                <textarea
                  value={excludeReason}
                  onChange={(event) => setExcludeReason(event.target.value)}
                  placeholder="Why this port should be excluded"
                  rows={3}
                  className="w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-rose-400 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>

              {excludeError ? (
                <div className="rounded-2xl border border-rose-200/70 bg-rose-50/80 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100">
                  {excludeError}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeExcludeModal}
                  className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={excludeMutation.isPending}
                  className="rounded-full border border-rose-200 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-500/40 dark:text-rose-200 dark:hover:border-rose-400 dark:hover:bg-rose-500/30"
                >
                  {excludeMutation.isPending ? 'Excluding...' : 'Confirm exclusion'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default OpenPorts
