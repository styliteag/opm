import type { HostAlertSummary, AlertSSHSummary, EnrichedHostPort } from './types'

export function computeRiskScore(
  alerts: HostAlertSummary[],
  ports: EnrichedHostPort[],
  ssh: AlertSSHSummary | null,
): number {
  const activeAlerts = alerts.filter((a) => !a.dismissed)

  const alertScore = activeAlerts.reduce((sum, a) => {
    switch (a.severity) {
      case 'critical':
        return sum + 25
      case 'high':
        return sum + 15
      case 'medium':
        return sum + 5
      default:
        return sum + 1
    }
  }, 0)

  const unapprovedPorts = ports.filter((p) => p.rule_status === null).length
  const portScore = unapprovedPorts * 3

  let sshScore = 0
  if (ssh) {
    if (ssh.password_enabled) sshScore += 5
    if (ssh.has_weak_ciphers) sshScore += 5
    if (ssh.has_weak_kex) sshScore += 5
    if (!ssh.publickey_enabled) sshScore += 3
  }

  return Math.min(100, alertScore + portScore + sshScore)
}

export function riskScoreColor(score: number): string {
  if (score >= 75) return 'text-red-400'
  if (score >= 50) return 'text-orange-400'
  if (score >= 25) return 'text-yellow-400'
  return 'text-emerald-400'
}

export function riskScoreLabel(score: number): string {
  if (score >= 75) return 'Critical'
  if (score >= 50) return 'High'
  if (score >= 25) return 'Medium'
  return 'Low'
}
