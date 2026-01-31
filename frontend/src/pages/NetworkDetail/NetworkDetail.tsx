import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { PortRule, SSHAlertConfig } from '../../types'
import {
  HostDiscoveryScansSection,
  NetworkInfoCards,
  PortRulesSection,
  RecentScansSection,
  RunningScanProgress,
  SSHAlertSettingsSection,
} from './components'
import {
  AddPortRuleModal,
  AlertSettingsModal,
  CancelScanConfirmModal,
  DeleteNetworkConfirmModal,
  DeleteRuleConfirmModal,
  EditNetworkModal,
} from './components/modals'
import { useNetworkDetail } from './hooks/useNetworkDetail'
import type { EditFormValues, RuleFormValues } from './types'
import {
  DEFAULT_PORT_TIMEOUT,
  DEFAULT_SCAN_TIMEOUT_MINUTES,
  formatDateTime,
  formatRelativeTime,
  parseUtcDate,
} from './utils'

const NetworkDetail = () => {
  const { networkId } = useParams()
  const now = new Date()

  const parsedNetworkId = Number(networkId)
  const isValidNetworkId = Number.isFinite(parsedNetworkId) && parsedNetworkId > 0

  // Modal visibility state
  const [showEdit, setShowEdit] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [showAddRule, setShowAddRule] = useState(false)
  const [showAlertSettings, setShowAlertSettings] = useState(false)
  const [ruleToDelete, setRuleToDelete] = useState<PortRule | null>(null)

  // Form error state
  const [formError, setFormError] = useState<string | null>(null)
  const [ruleFormError, setRuleFormError] = useState<string | null>(null)
  const [alertSettingsError, setAlertSettingsError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [isCancellingScan, setIsCancellingScan] = useState(false)

  // Form values
  const [formValues, setFormValues] = useState<EditFormValues>({
    name: '',
    cidr: '',
    portSpec: '',
    scannerId: '',
    schedule: '',
    scanRate: '',
    scanTimeoutMinutes: DEFAULT_SCAN_TIMEOUT_MINUTES,
    portTimeout: DEFAULT_PORT_TIMEOUT,
    scannerType: 'masscan',
    scanProtocol: 'tcp',
    hostDiscoveryEnabled: true,
  })

  const [ruleFormValues, setRuleFormValues] = useState<RuleFormValues>({
    port: '',
    ruleType: 'allow',
    description: '',
  })

  const [alertSettings, setAlertSettings] = useState<SSHAlertConfig>({
    ssh_insecure_auth: true,
    ssh_weak_cipher: false,
    ssh_weak_kex: false,
    ssh_outdated_version: false,
    ssh_config_regression: true,
    ssh_version_threshold: '8.0.0',
  })

  const {
    network,
    scanner,
    scans,
    rules,
    hostDiscoveryScans,
    runningScan,
    runningHostDiscoveryScan,
    scanners,
    isLoading,
    hasError,
    isAdmin,
    hostDiscoveryScansQuery,
    rulesQuery,
    updateNetworkMutation,
    triggerScanMutation,
    triggerHostDiscoveryMutation,
    cancelScanMutation,
    deleteNetworkMutation,
    createRuleMutation,
    deleteRuleMutation,
    updateAlertSettingsMutation,
  } = useNetworkDetail(parsedNetworkId)

  // Reset cancelling state when scan finishes
  useEffect(() => {
    if (!runningScan && isCancellingScan) setIsCancellingScan(false)
    if (!runningScan && showCancelConfirm) setShowCancelConfirm(false)
  }, [isCancellingScan, runningScan, showCancelConfirm])

  // Handler functions
  const openEditModal = () => {
    if (!network) return
    setFormError(null)
    setFormValues({
      name: network.name,
      cidr: network.cidr,
      portSpec: network.port_spec,
      scannerId: String(network.scanner_id),
      schedule: network.scan_schedule ?? '',
      scanRate: network.scan_rate ? String(network.scan_rate) : '',
      scanTimeoutMinutes:
        network.scan_timeout !== null
          ? String(Math.round(network.scan_timeout / 60))
          : DEFAULT_SCAN_TIMEOUT_MINUTES,
      portTimeout:
        network.port_timeout !== null ? String(network.port_timeout) : DEFAULT_PORT_TIMEOUT,
      scannerType: network.scanner_type,
      scanProtocol: network.scan_protocol ?? 'tcp',
      hostDiscoveryEnabled: network.host_discovery_enabled ?? true,
    })
    setShowEdit(true)
  }

  const handleEditSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setFormError(null)
    if (!formValues.scannerId) {
      setFormError('Please select a scanner for this network.')
      return
    }
    const rate = formValues.scanRate ? Number.parseInt(formValues.scanRate, 10) : null
    const scanTimeoutSeconds = Number.parseInt(formValues.scanTimeoutMinutes, 10) * 60
    const portTimeout = Number.parseInt(formValues.portTimeout, 10)

    updateNetworkMutation.mutate(
      {
        name: formValues.name.trim(),
        cidr: formValues.cidr.trim(),
        port_spec: formValues.portSpec.trim(),
        scanner_id: Number(formValues.scannerId),
        scan_schedule: formValues.schedule.trim() || null,
        scan_rate: rate,
        scan_timeout: scanTimeoutSeconds,
        port_timeout: portTimeout,
        scanner_type: formValues.scannerType,
        scan_protocol: formValues.scanProtocol,
        host_discovery_enabled: formValues.hostDiscoveryEnabled,
      },
      {
        onSuccess: () => {
          setShowEdit(false)
          setFormError(null)
        },
        onError: (error) =>
          setFormError(error instanceof Error ? error.message : 'Failed to update network'),
      },
    )
  }

  const openAlertSettingsModal = () => {
    if (!network) return
    setAlertSettingsError(null)
    const config = network.alert_config as SSHAlertConfig | null
    setAlertSettings({
      ssh_insecure_auth: config?.ssh_insecure_auth ?? true,
      ssh_weak_cipher: config?.ssh_weak_cipher ?? false,
      ssh_weak_kex: config?.ssh_weak_kex ?? false,
      ssh_outdated_version: config?.ssh_outdated_version ?? false,
      ssh_config_regression: config?.ssh_config_regression ?? true,
      ssh_version_threshold: config?.ssh_version_threshold ?? '8.0.0',
    })
    setShowAlertSettings(true)
  }

  const handleAlertSettingsSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setAlertSettingsError(null)
    updateAlertSettingsMutation.mutate(alertSettings, {
      onSuccess: () => {
        setShowAlertSettings(false)
        setAlertSettingsError(null)
      },
      onError: (error) =>
        setAlertSettingsError(error instanceof Error ? error.message : 'Failed to save settings'),
    })
  }

  const handleAddRuleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setRuleFormError(null)
    if (!ruleFormValues.port.trim()) {
      setRuleFormError('Port is required.')
      return
    }
    createRuleMutation.mutate(
      {
        port: ruleFormValues.port.trim(),
        rule_type: ruleFormValues.ruleType,
        description: ruleFormValues.description.trim() || null,
      },
      {
        onSuccess: () => {
          setShowAddRule(false)
          setRuleFormError(null)
          setRuleFormValues({ port: '', ruleType: 'allow', description: '' })
        },
        onError: (error) =>
          setRuleFormError(error instanceof Error ? error.message : 'Failed to create rule'),
      },
    )
  }

  const handleTriggerScan = () => {
    triggerScanMutation.mutate(undefined, {
      onSuccess: () => setActionMessage('Manual scan queued. The scanner will claim it shortly.'),
      onError: (error) =>
        setActionMessage(error instanceof Error ? error.message : 'Failed to trigger scan'),
    })
  }

  const handleTriggerHostDiscovery = () => {
    triggerHostDiscoveryMutation.mutate(undefined, {
      onSuccess: () =>
        setActionMessage('Host discovery scan queued. The scanner will claim it shortly.'),
      onError: (error) =>
        setActionMessage(
          error instanceof Error ? error.message : 'Failed to trigger host discovery',
        ),
    })
  }

  const handleCancelScan = () => {
    if (!runningScan) return
    setIsCancellingScan(true)
    cancelScanMutation.mutate(runningScan.id, {
      onSuccess: () => {
        setShowCancelConfirm(false)
        setActionMessage('Cancellation requested. The scanner will stop shortly.')
      },
      onError: (error) => {
        setIsCancellingScan(false)
        setActionMessage(error instanceof Error ? error.message : 'Failed to cancel scan')
      },
    })
  }

  const handleDeleteNetwork = () => {
    deleteNetworkMutation.mutate(undefined, {
      onError: (error) =>
        setFormError(error instanceof Error ? error.message : 'Failed to delete network'),
    })
  }

  const handleDeleteRule = () => {
    if (!ruleToDelete) return
    deleteRuleMutation.mutate(ruleToDelete.id, {
      onSuccess: () => setRuleToDelete(null),
      onError: (error) =>
        setRuleFormError(error instanceof Error ? error.message : 'Failed to delete rule'),
    })
  }

  // Computed values
  const lastScan = scans[0]
  const lastScanDateRaw = lastScan?.completed_at ?? lastScan?.cancelled_at ?? lastScan?.started_at
  const lastScanDate = lastScanDateRaw ? parseUtcDate(lastScanDateRaw) : null
  const lastScanLabel = lastScanDate ? formatRelativeTime(lastScanDate, now) : 'No scans yet'
  const lastScanDetail = lastScanDate ? formatDateTime(lastScanDate) : 'Awaiting the first scan'

  if (!isValidNetworkId) {
    return (
      <section className="rounded-3xl border border-slate-200/70 bg-white/80 p-8 shadow-sm dark:border-slate-800/70 dark:bg-slate-950/70">
        <p className="text-sm text-rose-600 dark:text-rose-200">
          This network identifier is invalid.
        </p>
        <Link
          to="/networks"
          className="mt-4 inline-flex items-center text-xs font-semibold text-cyan-600 dark:text-cyan-300"
        >
          Back to networks
        </Link>
      </section>
    )
  }

  return (
    <div className="relative">
      <div className="pointer-events-none absolute -left-20 top-16 h-64 w-64 animate-drift rounded-full bg-sky-500/15 blur-[130px]" />
      <div className="pointer-events-none absolute right-0 top-32 h-64 w-64 animate-drift rounded-full bg-emerald-500/20 blur-[140px]" />

      <section className="relative z-10 space-y-8">
        {/* Header Section */}
        <div className="rounded-3xl border border-slate-200/70 bg-white/80 p-8 shadow-[0_20px_80px_rgba(15,23,42,0.12)] backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/70">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Network details
              </p>
              <h2 className="mt-3 font-display text-3xl text-slate-900 dark:text-white">
                {network?.name ?? 'Loading network...'}
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
                Review configuration, trigger scans, and keep tabs on the most recent results for
                this monitored range.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 px-4 py-3 text-xs text-slate-500 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/60 dark:text-slate-300">
                {isLoading ? 'Syncing network status...' : `Updated ${formatDateTime(now)}`}
              </div>
              <Link
                to="/networks"
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900"
              >
                Back to networks
              </Link>
              {isAdmin && (
                <button
                  type="button"
                  onClick={handleTriggerScan}
                  disabled={triggerScanMutation.isPending}
                  className="rounded-full border border-cyan-600 bg-cyan-600 px-4 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {triggerScanMutation.isPending ? 'Triggering...' : 'Trigger Scan'}
                </button>
              )}
              {isAdmin && network?.host_discovery_enabled && (
                <button
                  type="button"
                  onClick={handleTriggerHostDiscovery}
                  disabled={triggerHostDiscoveryMutation.isPending}
                  className="rounded-full border border-violet-600 bg-violet-600 px-4 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {triggerHostDiscoveryMutation.isPending ? 'Triggering...' : 'Discover Hosts'}
                </button>
              )}
              {isAdmin && runningScan && (
                <button
                  type="button"
                  onClick={() => setShowCancelConfirm(true)}
                  disabled={isCancellingScan}
                  className="rounded-full border border-rose-500/40 bg-rose-500/15 px-4 py-2 text-xs font-semibold text-rose-600 transition hover:-translate-y-0.5 hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-70 dark:text-rose-200"
                >
                  {isCancellingScan ? 'Cancelling...' : 'Cancel Scan'}
                </button>
              )}
              {isAdmin && (
                <button
                  type="button"
                  onClick={openEditModal}
                  className="rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800 dark:border-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                >
                  Edit
                </button>
              )}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setFormError(null)
                    setShowDeleteConfirm(true)
                  }}
                  className="rounded-full border border-rose-500/40 bg-rose-500/15 px-4 py-2 text-xs font-semibold text-rose-600 transition hover:-translate-y-0.5 hover:bg-rose-500/25 dark:text-rose-200"
                >
                  Delete
                </button>
              )}
            </div>
          </div>

          {hasError && (
            <div className="mt-6 rounded-2xl border border-rose-200/70 bg-rose-50/80 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100">
              Unable to load network details right now.
            </div>
          )}

          {actionMessage && (
            <div className="mt-4 rounded-2xl border border-slate-200/70 bg-slate-50/80 px-4 py-3 text-sm text-slate-600 dark:border-slate-800/70 dark:bg-slate-900/60 dark:text-slate-200">
              {actionMessage}
            </div>
          )}

          {runningScan && <RunningScanProgress scan={runningScan} now={now} />}

          <NetworkInfoCards network={network} scanner={scanner} lastScanLabel={lastScanLabel} />
        </div>

        <RecentScansSection
          scans={scans}
          networkId={parsedNetworkId}
          isLoading={isLoading}
          lastScanDetail={lastScanDetail}
          now={now}
        />

        {network?.host_discovery_enabled && (
          <HostDiscoveryScansSection
            scans={hostDiscoveryScans}
            runningHostDiscoveryScan={runningHostDiscoveryScan}
            isLoading={hostDiscoveryScansQuery.isLoading}
            now={now}
          />
        )}

        <PortRulesSection
          rules={rules}
          isLoading={rulesQuery.isLoading}
          isAdmin={isAdmin}
          onAddRule={() => {
            setRuleFormError(null)
            setRuleFormValues({ port: '', ruleType: 'allow', description: '' })
            setShowAddRule(true)
          }}
          onDeleteRule={(rule) => {
            setRuleFormError(null)
            setRuleToDelete(rule)
          }}
        />

        <SSHAlertSettingsSection
          network={network}
          isAdmin={isAdmin}
          onConfigure={openAlertSettingsModal}
        />
      </section>

      {/* Modals */}
      {showAddRule && (
        <AddPortRuleModal
          formValues={ruleFormValues}
          setFormValues={setRuleFormValues}
          error={ruleFormError}
          isPending={createRuleMutation.isPending}
          onSubmit={handleAddRuleSubmit}
          onClose={() => setShowAddRule(false)}
        />
      )}

      {ruleToDelete && (
        <DeleteRuleConfirmModal
          rule={ruleToDelete}
          isPending={deleteRuleMutation.isPending}
          onConfirm={handleDeleteRule}
          onClose={() => setRuleToDelete(null)}
        />
      )}

      {showAlertSettings && (
        <AlertSettingsModal
          alertSettings={alertSettings}
          setAlertSettings={setAlertSettings}
          error={alertSettingsError}
          isPending={updateAlertSettingsMutation.isPending}
          onSubmit={handleAlertSettingsSubmit}
          onClose={() => setShowAlertSettings(false)}
        />
      )}

      {showEdit && (
        <EditNetworkModal
          formValues={formValues}
          setFormValues={setFormValues}
          scanners={scanners}
          error={formError}
          isPending={updateNetworkMutation.isPending}
          onSubmit={handleEditSubmit}
          onClose={() => setShowEdit(false)}
        />
      )}

      {showDeleteConfirm && (
        <DeleteNetworkConfirmModal
          isPending={deleteNetworkMutation.isPending}
          onConfirm={handleDeleteNetwork}
          onClose={() => setShowDeleteConfirm(false)}
        />
      )}

      {showCancelConfirm && runningScan && (
        <CancelScanConfirmModal
          isPending={cancelScanMutation.isPending || isCancellingScan}
          onConfirm={handleCancelScan}
          onClose={() => setShowCancelConfirm(false)}
        />
      )}
    </div>
  )
}

export default NetworkDetail
