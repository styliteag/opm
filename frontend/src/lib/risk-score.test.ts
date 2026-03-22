import { describe, it, expect } from 'vitest'

import { computeRiskScore, riskScoreColor, riskScoreLabel } from './risk-score'
import type { HostAlertSummary, EnrichedHostPort, AlertSSHSummary } from './types'

const makeAlert = (severity: string, dismissed = false): HostAlertSummary => ({
  id: 1,
  type: 'new_port',
  port: 80,
  message: 'test',
  severity,
  dismissed,
  resolution_status: 'open',
  created_at: new Date().toISOString(),
  dismiss_reason: null,
  network_id: null,
  network_name: null,
  ssh_summary: null,
  related_ssh_alert_count: 0,
  related_ssh_alerts_dismissed: true,
})

const makePort = (ruleStatus: 'accepted' | 'critical' | null = null): EnrichedHostPort => ({
  id: 1,
  ip: '1.2.3.4',
  port: 80,
  protocol: 'tcp',
  banner: null,
  service_guess: null,
  user_comment: null,
  first_seen_at: new Date().toISOString(),
  last_seen_at: new Date().toISOString(),
  alert_id: null,
  alert_status: null,
  alert_severity: null,
  dismiss_reason: null,
  rule_status: ruleStatus,
  matching_rules: [],
  ssh_summary: null,
})

describe('computeRiskScore', () => {
  it('returns 0 for no issues', () => {
    expect(computeRiskScore([], [], null)).toBe(0)
  })

  it('scores critical alerts at 25 points', () => {
    expect(computeRiskScore([makeAlert('critical')], [], null)).toBe(25)
  })

  it('scores high alerts at 15 points', () => {
    expect(computeRiskScore([makeAlert('high')], [], null)).toBe(15)
  })

  it('scores medium alerts at 5 points', () => {
    expect(computeRiskScore([makeAlert('medium')], [], null)).toBe(5)
  })

  it('scores info alerts at 1 point', () => {
    expect(computeRiskScore([makeAlert('info')], [], null)).toBe(1)
  })

  it('ignores dismissed alerts', () => {
    expect(computeRiskScore([makeAlert('critical', true)], [], null)).toBe(0)
  })

  it('accumulates multiple alert scores', () => {
    const alerts = [makeAlert('critical'), makeAlert('high'), makeAlert('medium')]
    expect(computeRiskScore(alerts, [], null)).toBe(45) // 25 + 15 + 5
  })

  it('scores unapproved ports at 3 points each', () => {
    expect(computeRiskScore([], [makePort(), makePort()], null)).toBe(6)
  })

  it('does not score accepted ports', () => {
    expect(computeRiskScore([], [makePort('accepted')], null)).toBe(0)
  })

  it('does not score critical-rule ports', () => {
    expect(computeRiskScore([], [makePort('critical')], null)).toBe(0)
  })

  it('scores SSH password enabled at 5 points', () => {
    const ssh: AlertSSHSummary = {
      ssh_version: null,
      publickey_enabled: true,
      password_enabled: true,
      has_weak_ciphers: false,
      has_weak_kex: false,
      keyboard_interactive_enabled: false,
      last_scanned: new Date().toISOString(),
    }
    expect(computeRiskScore([], [], ssh)).toBe(5)
  })

  it('scores SSH weak ciphers at 5 points', () => {
    const ssh: AlertSSHSummary = {
      ssh_version: null,
      publickey_enabled: true,
      password_enabled: false,
      has_weak_ciphers: true,
      has_weak_kex: false,
      keyboard_interactive_enabled: false,
      last_scanned: new Date().toISOString(),
    }
    expect(computeRiskScore([], [], ssh)).toBe(5)
  })

  it('scores SSH weak KEX at 5 points', () => {
    const ssh: AlertSSHSummary = {
      ssh_version: null,
      publickey_enabled: true,
      password_enabled: false,
      has_weak_ciphers: false,
      has_weak_kex: true,
      keyboard_interactive_enabled: false,
      last_scanned: new Date().toISOString(),
    }
    expect(computeRiskScore([], [], ssh)).toBe(5)
  })

  it('scores missing publickey at 3 points', () => {
    const ssh: AlertSSHSummary = {
      ssh_version: null,
      publickey_enabled: false,
      password_enabled: false,
      has_weak_ciphers: false,
      has_weak_kex: false,
      keyboard_interactive_enabled: false,
      last_scanned: new Date().toISOString(),
    }
    expect(computeRiskScore([], [], ssh)).toBe(3)
  })

  it('combines all SSH scores', () => {
    const ssh: AlertSSHSummary = {
      ssh_version: 'OpenSSH_7.4',
      publickey_enabled: false,
      password_enabled: true,
      has_weak_ciphers: true,
      has_weak_kex: true,
      keyboard_interactive_enabled: false,
      last_scanned: new Date().toISOString(),
    }
    expect(computeRiskScore([], [], ssh)).toBe(18) // 5+5+5+3
  })

  it('caps at 100', () => {
    const alerts = Array.from({ length: 10 }, () => makeAlert('critical'))
    expect(computeRiskScore(alerts, [], null)).toBe(100)
  })

  it('combines alerts, ports, and SSH', () => {
    const ssh: AlertSSHSummary = {
      ssh_version: null,
      publickey_enabled: true,
      password_enabled: true,
      has_weak_ciphers: false,
      has_weak_kex: false,
      keyboard_interactive_enabled: false,
      last_scanned: new Date().toISOString(),
    }
    // 25 (critical) + 6 (2 unapproved ports * 3) + 5 (password) = 36
    expect(computeRiskScore([makeAlert('critical')], [makePort(), makePort()], ssh)).toBe(36)
  })
})

describe('riskScoreColor', () => {
  it('returns red for >= 75', () => {
    expect(riskScoreColor(75)).toContain('red')
    expect(riskScoreColor(100)).toContain('red')
  })

  it('returns orange for >= 50', () => {
    expect(riskScoreColor(50)).toContain('orange')
    expect(riskScoreColor(74)).toContain('orange')
  })

  it('returns yellow for >= 25', () => {
    expect(riskScoreColor(25)).toContain('yellow')
    expect(riskScoreColor(49)).toContain('yellow')
  })

  it('returns emerald for < 25', () => {
    expect(riskScoreColor(0)).toContain('emerald')
    expect(riskScoreColor(24)).toContain('emerald')
  })
})

describe('riskScoreLabel', () => {
  it('returns Critical for >= 75', () => {
    expect(riskScoreLabel(75)).toBe('Critical')
  })

  it('returns High for >= 50', () => {
    expect(riskScoreLabel(50)).toBe('High')
  })

  it('returns Medium for >= 25', () => {
    expect(riskScoreLabel(25)).toBe('Medium')
  })

  it('returns Low for < 25', () => {
    expect(riskScoreLabel(0)).toBe('Low')
  })
})
