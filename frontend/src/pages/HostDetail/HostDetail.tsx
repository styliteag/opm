import { Link, useParams } from 'react-router-dom'
import { useHostDetail } from './hooks/useHostDetail'
import HostInfoCard from './components/HostInfoCard'
import EnrichedPortTable from './components/EnrichedPortTable'
import AlertsSection from './components/AlertsSection'
import SSHSecuritySection from './components/SSHSecuritySection'
import AppliedRulesSection from './components/AppliedRulesSection'
import ScanHistorySection from './components/ScanHistorySection'

const HostDetail = () => {
  const { hostId } = useParams()
  const parsedHostId = Number(hostId)
  const isValidId = Number.isFinite(parsedHostId) && parsedHostId > 0

  const {
    overviewQuery,
    dismissMutation,
    reopenMutation,
    updateCommentMutation,
    updateHostnameMutation,
    rescanMutation,
    createRuleMutation,
    deleteRuleMutation,
    isAdmin,
  } = useHostDetail(isValidId ? parsedHostId : 0)

  if (!isValidId) {
    return (
      <div className="p-6">
        <p className="text-red-600 dark:text-red-400">Invalid host ID.</p>
        <Link
          to="/hosts"
          className="text-blue-600 dark:text-blue-400 hover:underline mt-2 inline-block"
        >
          Back to Hosts
        </Link>
      </div>
    )
  }

  if (overviewQuery.isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-1/3"></div>
          <div className="h-40 bg-slate-200 dark:bg-slate-700 rounded"></div>
          <div className="h-60 bg-slate-200 dark:bg-slate-700 rounded"></div>
        </div>
      </div>
    )
  }

  if (overviewQuery.isError) {
    return (
      <div className="p-6">
        <p className="text-red-600 dark:text-red-400">
          Failed to load host: {overviewQuery.error?.message ?? 'Unknown error'}
        </p>
        <Link
          to="/hosts"
          className="text-blue-600 dark:text-blue-400 hover:underline mt-2 inline-block"
        >
          Back to Hosts
        </Link>
      </div>
    )
  }

  const data = overviewQuery.data
  if (!data) return null

  return (
    <div className="p-6 space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <Link to="/hosts" className="hover:text-slate-700 dark:hover:text-slate-200">
          Hosts
        </Link>
        <span>/</span>
        <span className="text-slate-900 dark:text-white font-mono">{data.host.ip}</span>
      </nav>

      {/* Host Info */}
      <HostInfoCard
        host={data.host}
        networks={data.networks}
        isAdmin={isAdmin}
        onUpdateComment={(comment) => updateCommentMutation.mutate(comment)}
        onUpdateHostname={(hostname) => updateHostnameMutation.mutate(hostname)}
        onRescan={() => rescanMutation.mutate(data.host.ip)}
        isRescanPending={rescanMutation.isPending}
      />

      {/* Enriched Port Table */}
      <EnrichedPortTable
        ports={data.ports}
        isAdmin={isAdmin}
        networks={data.networks}
        onDismiss={(alertId) => dismissMutation.mutate({ alertId })}
        onCreateRule={(payload) => createRuleMutation.mutate(payload)}
        isCreatingRule={createRuleMutation.isPending}
      />

      {/* Alerts */}
      <AlertsSection
        alerts={data.alerts}
        dismissedAlerts={data.dismissed_alerts}
        dismissedCount={data.dismissed_alert_count}
        hostIp={data.host.ip}
        isAdmin={isAdmin}
        onDismiss={(alertId, reason, includeSSH) =>
          dismissMutation.mutate({ alertId, reason, include_ssh_findings: includeSSH })
        }
        onFix={(alertId, reason) =>
          dismissMutation.mutate({ alertId, reason, resolution_status: 'fix_planned' })
        }
        onReopen={(alertId) => reopenMutation.mutate(alertId)}
        onCreateRule={(payload) => createRuleMutation.mutate(payload)}
        isDismissing={dismissMutation.isPending}
        isReopening={reopenMutation.isPending}
      />

      {/* SSH Security */}
      {data.ssh && <SSHSecuritySection ssh={data.ssh} />}

      {/* Applied Port Rules */}
      <AppliedRulesSection
        rules={data.matching_rules}
        isAdmin={isAdmin}
        onDeleteRule={(scope, ruleId) => deleteRuleMutation.mutate({ scope, ruleId })}
      />

      {/* Scan History */}
      <ScanHistorySection scans={data.recent_scans} />
    </div>
  )
}

export default HostDetail
