import React, { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { API_BASE_URL, extractErrorMessage, fetchJson, getAuthHeaders } from '../lib/api'
import type {
  GlobalOpenPort,
  GlobalOpenPortListResponse,
  PolicyListResponse,
  NetworkListResponse,
} from '../types'

type SortKey =
  | 'ip'
  | 'port'
  | 'protocol'
  | 'service'
  | 'first_seen_at'
  | 'last_seen_at'
  | 'network'

type SortDirection = 'asc' | 'desc'

type PortRange = {
  min: number | null
  max: number | null
  error: string | null
}

type ToastMessage = {
  message: string
  tone: 'success' | 'error'
}

type WhitelistPayload = {
  network_id: number | null
  ip: string | null
  port: string
  description: string | null
}

const formatDateTime = (value: Date) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value)

const parseUtcDate = (dateStr: string) =>
  new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z')

const compressIpv6 = (value: string) => {
  const lower = value.toLowerCase()
  if (!lower.includes(':') || lower.includes('.')) return value
  const parts = lower.split('::')
  if (parts.length > 2) return value
  const left = parts[0] ? parts[0].split(':') : []
  const right = parts.length === 2 && parts[1] ? parts[1].split(':') : []
  if (parts.length === 1) {
    if (left.length !== 8) return value
  } else {
    const missing = 8 - (left.length + right.length)
    if (missing < 0) return value
    left.push(...Array(missing).fill('0'))
    left.push(...right)
  }
  const normalized = left.map((s) => s.replace(/^0+(?=[0-9a-f])/i, '') || '0')
  let bestStart = -1, bestLen = 0, currentStart = -1, currentLen = 0
  normalized.forEach((s, i) => {
    if (s === '0') {
      if (currentStart === -1) { currentStart = i; currentLen = 1 }
      else currentLen++
    } else {
      if (currentLen > bestLen) { bestLen = currentLen; bestStart = currentStart }
      currentStart = -1; currentLen = 0
    }
  })
  if (currentLen > bestLen) { bestLen = currentLen; bestStart = currentStart }
  if (bestLen < 2) return normalized.join(':')
  const compressed = [...normalized]
  compressed.splice(bestStart, bestLen, '')
  let res = compressed.join(':')
  if (res === '') return '::'
  if (res.startsWith(':')) res = ':' + res
  if (res.endsWith(':')) res = res + ':'
  return res
}

const formatIpAddress = (val: string) => val.includes(':') ? compressIpv6(val) : val

const parsePortRange = (val: string): PortRange => {
  const t = val.trim()
  if (!t) return { min: null, max: null, error: null }
  if (/^\d+$/.test(t)) {
    const p = Number(t)
    if (p < 1 || p > 65535) return { min: null, max: null, error: 'Port 1-65535.' }
    return { min: p, max: p, error: null }
  }
  const m = /^(\d+)\s*-\s*(\d+)$/.exec(t)
  if (!m) return { min: null, max: null, error: 'Format: 443 or 80-443' }
  const min = Number(m[1]), max = Number(m[2])
  if (min < 1 || max > 65535 || min > max) return { min: null, max: null, error: 'Invalid range.' }
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
  const [portRangeInput, setPortRangeInput] = useState('')
  const [ipRangeInput, setIpRangeInput] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('last_seen_at')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [offset, setOffset] = useState(0)
  const limit = 50
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [whitelistTarget, setWhitelistTarget] = useState<GlobalOpenPort | null>(null)
  const [whitelistDescription, setWhitelistDescription] = useState('')
  const [whitelistError, setWhitelistError] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastMessage | null>(null)

  const portRange = useMemo(() => parsePortRange(portRangeInput), [portRangeInput])
  const isAdmin = user?.role === 'admin'

  useEffect(() => { setOffset(0) }, [portRangeInput, ipRangeInput, searchTerm, sortKey, sortDirection])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  const networksQuery = useQuery({
    queryKey: ['networks'],
    queryFn: () => fetchJson<NetworkListResponse>('/api/networks', token ?? ''),
    enabled: !!token
  })

  const portsQuery = useQuery({
    queryKey: ['ports', portRange.min, portRange.max, ipRangeInput, searchTerm, sortKey, sortDirection, offset],
    queryFn: () => {
      const p = new URLSearchParams()
      if (portRange.min) p.set('port_min', String(portRange.min))
      if (portRange.max) p.set('port_max', String(portRange.max))
      if (ipRangeInput.trim()) p.set('ip_range', ipRangeInput.trim())
      if (searchTerm.trim()) p.set('service', searchTerm.trim())
      p.set('sort_by', serverSortKeys[sortKey] ?? 'last_seen_at')
      p.set('sort_dir', sortDirection)
      p.set('offset', String(offset))
      p.set('limit', String(limit))
      return fetchJson<GlobalOpenPortListResponse>(`/api/global-ports?${p.toString()}`, token ?? '')
    },
    enabled: !!token && !portRange.error
  })

  const ports = useMemo(() => (portsQuery.data?.ports ?? []) as GlobalOpenPort[], [portsQuery.data])
  const networkMap = useMemo(() => new Map((networksQuery.data?.networks ?? []).map(n => [n.id, n.name])), [networksQuery.data])

  const policyQuery = useQuery({
    queryKey: ['policy'],
    queryFn: () => fetchJson<PolicyListResponse>('/api/policy', token ?? ''),
    enabled: !!token
  })

  const allowedSets = useMemo(() => {
    const ipKeys = new Set<string>(), portKeys = new Set<string>(), ruleIdMap = new Map<string, { id: number, scope: string }>()
    const rules = policyQuery.data?.rules ?? []
    rules.forEach(r => {
      if (r.rule_type !== 'allow') return
      const k = r.ip ? `${r.ip}:${r.port}` : String(r.port)
      if (r.ip) ipKeys.add(k); else portKeys.add(k)
      ruleIdMap.set(k, { id: r.id, scope: r.network_id === null ? 'global' : 'network' })
    })
    return { ipKeys, portKeys, ruleIdMap }
  }, [policyQuery.data])

  const whitelistMutation = useMutation({
    mutationFn: async (payload: WhitelistPayload) => {
      const res = await fetch(`${API_BASE_URL}/api/policy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders(token ?? '') },
        body: JSON.stringify(payload)
      })
      if (!res.ok) throw new Error(await extractErrorMessage(res))
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policy'] })
      setToast({ message: 'Added to security policy', tone: 'success' })
      setWhitelistTarget(null); setWhitelistDescription('')
    },
    onError: (e) => setWhitelistError(e instanceof Error ? e.message : 'Error')
  })

  const handleRemoveWhitelist = (port: GlobalOpenPort) => {
    const rule = allowedSets.ruleIdMap.get(`${port.ip}:${port.port}`) || allowedSets.ruleIdMap.get(String(port.port))
    if (rule) {
      fetch(`${API_BASE_URL}/api/policy/${rule.scope}/${rule.id}`, { method: 'DELETE', headers: getAuthHeaders(token ?? '') })
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ['policy'] })
          setToast({ message: 'Removed from policy', tone: 'success' })
        })
    }
  }

  const handleWhitelistSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || !whitelistTarget) return
    if (!whitelistDescription.trim()) {
      setWhitelistError('A reason for whitelisting is required')
      return
    }
    whitelistMutation.mutate({
      network_id: null, // Default to Global from this view
      ip: whitelistTarget.ip,
      port: String(whitelistTarget.port),
      description: whitelistDescription.trim()
    })
  }

  const handleExport = () => {
    const headers = ['IP', 'Port', 'Protocol', 'Service', 'Banner', 'First Seen', 'Last Seen', 'Networks']
    const csv = [
      headers.join(','),
      ...ports.map(p => [
        p.ip,
        p.port,
        p.protocol,
        `"${(p.service_guess || '').replace(/"/g, '""')}"`,
        `"${(p.banner || '').replace(/"/g, '""')}"`,
        p.first_seen_at,
        p.last_seen_at,
        p.seen_by_networks.length
      ].join(','))
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `open-ports-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
  }

  const toggleExpanded = (key: string) => setExpandedRows(prev => {
    const n = new Set(prev)
    if (n.has(key)) n.delete(key); else n.add(key)
    return n
  })

  const pageNum = Math.floor(offset / limit) + 1
  const renderSort = (label: string, key: SortKey) => (
    <button onClick={() => {
      if (sortKey === key) setSortDirection(d => d === 'asc' ? 'desc' : 'asc')
      else { setSortKey(key); setSortDirection('asc') }
    }} className="flex items-center gap-1 font-black uppercase text-[11px] tracking-widest text-slate-400 hover:text-slate-600 transition-colors">
      {label} {sortKey === key && (sortDirection === 'asc' ? '↑' : '↓')}
    </button>
  )

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-700">
      {toast && (
        <div className="fixed top-8 right-8 z-[100] animate-in slide-in-from-top-4 duration-300">
          <div className={`px-8 py-4 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.2)] font-black uppercase text-xs tracking-[0.2em] border ${toast.tone === 'success' ? 'bg-emerald-500 border-emerald-400 text-white' : 'bg-rose-500 border-rose-400 text-white'}`}>
            {toast.message}
          </div>
        </div>
      )}

      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-5xl font-black text-slate-900 dark:text-white tracking-tighter leading-none">Security Exposure</h1>
          <p className="text-indigo-500 mt-3 uppercase text-[11px] font-black tracking-[0.3em] flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Global Network Monitor
          </p>
        </div>
        <div className="flex gap-4">
          <button onClick={handleExport} className="px-6 py-3 bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-2 border-slate-100 dark:border-slate-800 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:border-indigo-100 transition-all shadow-sm active:scale-95">Export Metadata</button>
          <Link to="/policy" className="px-6 py-3 bg-slate-900 text-white dark:bg-white dark:text-slate-900 rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-2xl hover:scale-105 active:scale-95 transition-all">Policy Manager</Link>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-800/50 shadow-sm group hover:shadow-xl transition-all">
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Global Endpoints</p>
          <p className="text-5xl font-black mt-2 text-indigo-600 tracking-tighter">{ports.length}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-800/50 shadow-sm text-center">
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Active Scale</p>
          <p className="text-5xl font-black mt-2 tracking-tighter">{pageNum}</p>
        </div>
        <div className="md:col-span-2 bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/5 blur-[60px] -mr-24 -mt-24 transition-colors group-focus-within:bg-indigo-500/10" />
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest pl-1">Intelligent Filter</p>
          <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search IP, service, mac..." className="w-full mt-2 bg-transparent border-none focus:ring-0 text-2xl font-black tracking-tight placeholder:text-slate-200 dark:placeholder:text-slate-800" />
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.05)] overflow-hidden">
        <div className="px-10 py-8 bg-slate-50/30 dark:bg-slate-800/20 flex flex-wrap gap-10 border-b border-slate-50 dark:border-slate-800/50">
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Range Query</span>
            <input type="text" value={portRangeInput} onChange={e => setPortRangeInput(e.target.value)} className="bg-white dark:bg-slate-950 border-2 border-slate-100 dark:border-slate-800 rounded-2xl px-5 py-3 text-xs font-black focus:ring-8 ring-indigo-500/5 focus:border-indigo-500/30 outline-none w-44 transition-all shadow-inner uppercase tracking-widest" placeholder="80-443" />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">CIDR Filter</span>
            <input type="text" value={ipRangeInput} onChange={e => setIpRangeInput(e.target.value)} className="bg-white dark:bg-slate-950 border-2 border-slate-100 dark:border-slate-800 rounded-2xl px-5 py-3 text-xs font-black focus:ring-8 ring-indigo-500/5 focus:border-indigo-500/30 outline-none w-64 transition-all shadow-inner tracking-widest" placeholder="192.168.1.0/24" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-50 dark:border-slate-800/50 bg-white dark:bg-slate-900">
                <th className="px-10 py-6">{renderSort('Address', 'ip')}</th>
                <th className="px-10 py-6">{renderSort('Port', 'port')}</th>
                <th className="px-10 py-6 text-[11px] font-black text-slate-400 uppercase tracking-widest">Protocol</th>
                <th className="px-10 py-6">{renderSort('Service', 'service')}</th>
                <th className="px-10 py-6 text-right text-[11px] font-black text-slate-400 uppercase tracking-widest">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800/30">
              {ports.map((p: GlobalOpenPort) => {
                const k = `${p.ip}-${p.port}-${p.protocol}`
                const allowed = allowedSets.portKeys.has(String(p.port)) || allowedSets.ipKeys.has(`${p.ip}:${p.port}`)
                const isOpen = expandedRows.has(k)
                return (
                  <React.Fragment key={k}>
                    <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors group">
                      <td className="px-10 py-8 font-mono text-sm">
                        <div className="flex items-center gap-4">
                          <span className="text-slate-900 dark:text-slate-100 font-black tracking-tight text-base">{formatIpAddress(p.ip)}</span>
                          <button onClick={() => { navigator.clipboard.writeText(p.ip); setToast({ message: 'Address Copied', tone: 'success' }) }} className="opacity-0 group-hover:opacity-100 p-2 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 rounded-xl transition-all hover:scale-110 active:scale-95">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                          </button>
                        </div>
                      </td>
                      <td className="px-10 py-8 text-slate-700 dark:text-slate-300"><span className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-xl font-black text-sm">{p.port}</span></td>
                      <td className="px-10 py-8">
                        <span className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest ${p.protocol === 'tcp' ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300' : 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'}`}>{p.protocol}</span>
                      </td>
                      <td className="px-10 py-8 text-slate-500 dark:text-slate-400 text-sm font-bold italic tracking-tight">{p.service_guess || 'unidentified'}</td>
                      <td className="px-10 py-8 text-right">
                        <div className="flex justify-end items-center gap-4">
                          {allowed ? (
                            <button onClick={() => handleRemoveWhitelist(p)} className="px-5 py-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[11px] font-black uppercase tracking-[0.2em] rounded-2xl border-2 border-emerald-500/10 hover:bg-emerald-500/20 transition-all">Cleared</button>
                          ) : (
                            isAdmin && <button onClick={() => setWhitelistTarget(p)} className="px-5 py-2 bg-slate-50 dark:bg-slate-950 text-slate-400 text-[11px] font-black uppercase tracking-[0.2em] rounded-2xl border-2 border-slate-100 dark:border-slate-800 hover:text-indigo-600 hover:border-indigo-500/30 transition-all">Authorize</button>
                          )}
                          <button onClick={() => toggleExpanded(k)} className={`p-3 rounded-2xl transition-all ${isOpen ? 'bg-indigo-500 text-white shadow-lg' : 'text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                            <svg className={`w-6 h-6 transition-transform duration-500 ${isOpen ? 'rotate-180 scale-110' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" /></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-slate-50/20 dark:bg-slate-800/10">
                        <td colSpan={5} className="px-16 py-12">
                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-16">
                            <div className="space-y-8">
                              <div>
                                <h4 className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.25em] mb-4">Infrastructural Footprint ({p.seen_by_networks.length})</h4>
                                <div className="flex flex-wrap gap-2.5">
                                  {p.seen_by_networks.map((id: number) => (
                                    <span key={id} className="px-4 py-2 bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-2xl text-[11px] font-black text-slate-600 dark:text-slate-300 shadow-sm">{networkMap.get(id) || `Gateway ${id}`}</span>
                                  ))}
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-8 pt-4 border-t border-slate-100 dark:border-slate-800/50">
                                <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Discovery</p><p className="text-xs font-black text-slate-700 dark:text-slate-300">{formatDateTime(parseUtcDate(p.first_seen_at))}</p></div>
                                <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Activity</p><p className="text-xs font-black text-slate-700 dark:text-slate-300">{formatDateTime(parseUtcDate(p.last_seen_at))}</p></div>
                              </div>
                            </div>
                            <div className="space-y-8 border-l border-slate-100 dark:border-slate-800/50 pl-16">
                              <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mb-2">Physical Identification</p>
                                <p className="text-lg font-black tracking-widest text-slate-900 dark:text-white uppercase">{p.mac_address || 'Unregistered'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mb-2">Interface Origin</p>
                                <p className="text-sm font-black text-indigo-600 uppercase tracking-widest italic">{p.mac_vendor || 'Proprietary Hardware'}</p>
                              </div>
                            </div>
                            <div className="border-l border-slate-100 dark:border-slate-800/50 pl-16">
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mb-4">Application Banner</p>
                              <div className="bg-slate-950 rounded-[2rem] p-8 overflow-hidden border border-slate-800 relative group/code shadow-[inset_0_2px_20px_rgba(0,0,0,0.5)]">
                                <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-500 via-purple-600 to-pink-500 opacity-60" />
                                <pre className="text-[12px] font-mono text-emerald-400/80 whitespace-pre-wrap leading-loose select-all italic">{p.banner || 'NO PAYLOAD DATA DETECTED'}</pre>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="p-8 bg-slate-50/50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800/50 flex justify-between items-center px-12">
          <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em]">Telemetry sync active • {ports.length} Rows</span>
          <div className="flex gap-4">
            <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))} className="px-8 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 disabled:opacity-30 hover:border-indigo-100 transition-all shadow-sm active:scale-95">Previous</button>
            <button disabled={ports.length < limit} onClick={() => setOffset(offset + limit)} className="px-10 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest bg-slate-900 text-white dark:bg-white dark:text-slate-900 disabled:opacity-30 hover:scale-[1.03] active:scale-95 transition-all shadow-2xl">Next Batch</button>
          </div>
        </div>
      </div>

      {whitelistTarget && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/95 backdrop-blur-2xl p-4 animate-in fade-in duration-500">
          <div className="bg-white dark:bg-slate-900 p-16 rounded-[4rem] w-full max-w-2xl border border-slate-100 dark:border-slate-800 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)] relative overflow-hidden animate-in zoom-in-95 duration-500">
            <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 blur-[120px] rounded-full -mr-32 -mt-32" />

            <div className="relative">
              <div className="w-20 h-20 bg-emerald-500/5 rounded-[2rem] flex items-center justify-center text-emerald-500 mb-10 border-2 border-emerald-500/10">
                <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              </div>

              <h3 className="text-5xl font-black text-slate-900 dark:text-white tracking-tighter leading-none">Security Approval</h3>
              <p className="text-slate-500 mt-6 text-lg leading-relaxed font-bold">
                Granting universal authorization for <span className="text-indigo-600 underline underline-offset-8 decoration-4 decoration-indigo-100 dark:decoration-indigo-900/50">{whitelistTarget.port}/{whitelistTarget.protocol}</span> on
                <span className="text-indigo-600 block mt-2 text-3xl tracking-tighter">{whitelistTarget.ip}</span>
              </p>
              <p className="text-xs text-slate-400 mt-6 uppercase tracking-[0.2em] font-black opacity-60 italic">Global dynamic policy application in effect.</p>

              <form onSubmit={handleWhitelistSubmit} className="mt-12 space-y-10">
                <div className="space-y-4">
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] ml-1">Documentation Reference (Required)</label>
                  <input type="text" autoFocus value={whitelistDescription} onChange={e => setWhitelistDescription(e.target.value)} placeholder="e.g. Authorized customer API gateway exposure" className="w-full border-4 border-slate-50 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 rounded-[2rem] px-8 py-6 text-lg font-black focus:ring-[16px] ring-indigo-500/5 focus:border-indigo-500 focus:bg-white outline-none transition-all shadow-inner tracking-tight" />
                </div>

                {whitelistError && (
                  <div className="p-6 bg-rose-50 dark:bg-rose-900/20 rounded-[2rem] text-[11px] font-black text-rose-600 dark:text-rose-400 border-2 border-rose-100 dark:border-rose-900/50 uppercase tracking-[0.2em] flex items-center gap-4">
                    <svg className="w-6 h-6 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    {whitelistError}
                  </div>
                )}

                <div className="flex items-center gap-8 pt-6">
                  <button type="button" onClick={() => setWhitelistTarget(null)} className="text-[11px] font-black text-slate-400 hover:text-slate-900 dark:hover:text-white uppercase tracking-[0.3em] transition-all px-4">Cancel</button>
                  <button type="submit" disabled={whitelistMutation.isPending || !whitelistDescription.trim()} className="flex-1 py-6 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-[2.5rem] font-black uppercase text-xs tracking-[0.3em] shadow-[0_20px_50px_rgba(0,0,0,0.3)] hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-30 disabled:grayscale">
                    {whitelistMutation.isPending ? 'Propagating...' : 'Declare Authorized'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default OpenPorts
