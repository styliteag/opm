# Alert States & Actions — Explained Simply

## The Two Big Ideas

An alert has **two independent properties**:

1. **Visibility**: Is the alert **active** (you see it) or **dismissed** (hidden)?
2. **Resolution**: Is the alert **open**, **in progress**, **fix planned**, or **resolved**?

These are independent — you can dismiss an alert that's still "open", or resolve one that's still visible.

---

## Alert Types

Alerts are created by scanners and have a **type** and **source**:

### Port Alerts (source: `port`)
| Type | Description | Default Severity |
|------|-------------|-----------------|
| `new_port` | New open port detected | High |
| `not_allowed` | Port not in allow-list | Medium |
| `blocked` | Port matches block-list | Critical |

### SSH Alerts (source: `ssh`)
| Type | Description | Default Severity |
|------|-------------|-----------------|
| `ssh_insecure_auth` | Password/keyboard-interactive login enabled | High |
| `ssh_weak_cipher` | Weak ciphers detected | Medium |
| `ssh_weak_kex` | Weak key exchange algorithms | Medium |
| `ssh_outdated_version` | Outdated SSH version | Medium |
| `ssh_config_regression` | SSH config changed for the worse | Medium |

---

## Severity

Each alert has a **computed severity** based on its type and matching rules:

| Level | Meaning |
|-------|---------|
| **Critical** | Blocked port or blocked rule match |
| **High** | New port or SSH insecure auth |
| **Medium** | Not allowed, SSH weak cipher/kex/outdated |
| **Info** | Acknowledged/monitoring |

### Severity Override

Users can manually override the computed severity to any level (critical, high, medium, info).
Setting the override to `null` resets it back to the computed default.

Priority: **manual override > blocked rule > alert type default**

---

## The 6 Actions

### Dismiss
> "I've seen this, hide it for now."

- Hides the alert from the active list
- You can add a reason (becomes a comment on the alert)
- Optionally set a resolution status (e.g. "fix_planned")
- The alert still exists — it's just not in your face anymore
- Supports **bulk dismiss** for multiple alerts at once

### Fix (Dismiss with Fix Planned)
> "I know about this and a fix is planned."

- Dismisses the alert with resolution status set to `fix_planned`
- Opens a comment modal to describe what fix is planned
- A shortcut for: dismiss + set resolution to "fix_planned" + add comment

### Reopen
> "Wait, I need to look at this again."

- The opposite of Dismiss
- Brings a dismissed alert back to the active list
- Clears the dismiss reason
- Supports **bulk reopen** for multiple alerts at once

### Accept (Global or Network)
> "This port is fine. Don't bother me about it ever again."

- Creates a **permanent rule** (whitelist entry) for that IP:port
- Also dismisses the alert as a side effect
- Future scans won't create new alerts for this IP:port
- Two scopes:
  - **Global**: rule applies everywhere
  - **Network**: rule applies only in one network
- Supports **bulk accept** for multiple alerts at once

### Revoke
> "I changed my mind — that port shouldn't be whitelisted anymore."

- **Deletes the acceptance rule** created by Accept
- Future scans WILL create alerts for this IP:port again
- Does NOT reopen the already-dismissed alert (use Reopen for that)

### Delete
> "Remove this alert permanently."

- Gone forever. Cannot be undone.
- Supports **bulk delete** for multiple alerts at once

---

## State Diagram

```
                         +---------------------------+
                         |                           |
                         |    ACTIVE (New)           |
                         |    dismissed = false       |
                         |                           |
                         +----+-----------+----------+
                              |           |
                   +----------+           +----------+
                   |                                 |
                   v                                 v
    +------------------------+       +----------------------------+
    |                        |       |                            |
    |   DISMISS / FIX        |       |   ACCEPT                  |
    |   "Hide it"            |       |   "Whitelist it"          |
    |   (optional reason,    |       |                           |
    |    resolution status)  |       +------------+--------------+
    |                        |                    |
    +-----------+------------+                    |  (creates a rule
                |                                 |   AND dismisses)
                |                                 |
                v                                 v
    +------------------------------------------------------------+
    |                                                            |
    |    DISMISSED                                               |
    |    dismissed = true                                        |
    |                                                            |
    |    May or may not have an acceptance rule behind it        |
    |                                                            |
    +-----------+-----------------------------+------------------+
                |                             |
                v                             v
    +----------------------+    +---------------------------+
    |                      |    |                           |
    |   REOPEN             |    |   REVOKE                  |
    |   "Show it again"    |    |   "Delete the rule"       |
    |                      |    |                           |
    |   -> back to         |    |   Alert stays dismissed   |
    |      ACTIVE          |    |   but future scans will   |
    |                      |    |   create new alerts       |
    +----------------------+    +---------------------------+
```

---

## Dismiss vs Accept — What's the Difference?

| | Dismiss | Accept |
|---|---|---|
| **What it does** | Hides this one alert | Hides this alert AND creates a rule |
| **Future alerts** | New scan -> new alert appears | New scan -> no alert (rule blocks it) |
| **Undo action** | Reopen | Revoke (deletes rule) + Reopen (shows alert) |
| **Use when** | "I'll deal with it later" | "This is expected and safe" |

---

## Reopen vs Revoke — What's the Difference?

| | Reopen | Revoke |
|---|---|---|
| **What it does** | Un-dismisses an alert (shows it again) | Deletes an acceptance rule |
| **Affects** | One specific alert | Future scan behavior |
| **Use when** | "I need to re-investigate this" | "This port should no longer be whitelisted" |

---

## Resolution Status (Independent Track)

Separately from dismiss/active, each alert has a resolution status:

```
  OPEN  -->  IN PROGRESS  -->  FIX PLANNED  -->  RESOLVED
    ^             |                  |                |
    +-------------+------------------+                |
    +-------------------------------------------------+
```

| Status | Meaning |
|--------|---------|
| `open` | Not yet looked at |
| `in_progress` | Being investigated |
| `fix_planned` | A fix is planned (typically set via the Fix action with a comment) |
| `resolved` | Done |

This is for your own tracking ("am I investigating this?") and does **not**
affect whether the alert is visible or dismissed. You can change resolution
status at any time regardless of the dismissed state.

---

## Assignment

Alerts can be **assigned to a user** for ownership tracking. Assigning with a `null` user_id unassigns the alert. Assignment is independent of both visibility and resolution status.

---

## Comments

Each alert has a **comment thread** for discussion and context:

- Comments are created automatically when dismissing with a reason
- Comments are created automatically when using the Fix action
- Users can add, edit, and delete comments manually
- Comments are deleted when the alert is deleted (cascade)

---

## SSH Security Findings

SSH alerts are a special **category** of alerts. They flag security issues like:
- Insecure authentication (password login enabled)
- Weak ciphers or key exchange algorithms
- Outdated SSH versions
- Security regressions (config got worse since last scan)

They follow the **exact same state model** above. The only special behavior:
when you dismiss a port alert, you get the option **"Also dismiss SSH findings"**
which batch-dismisses related SSH security alerts for the same IP:port.

---

## Full Lifecycle Example

```
1. Scanner finds port 8080 open on 192.168.1.5
   -> Alert created: ACTIVE, resolution=open, severity=high

2. You override severity to "critical" (this is a production server)
   -> severity_override=critical

3. You assign it to yourself
   -> assigned_to_user_id=42

4. You change resolution status to "in_progress"
   -> resolution_status=in_progress

5. You click "Fix" with comment "Closing port in next maintenance window"
   -> Alert becomes: DISMISSED, resolution=fix_planned
   -> Comment added with the fix description

6. Maintenance done. You click "Reopen" to verify
   -> Alert becomes: ACTIVE again

7. Next scan confirms port is closed
   -> No new alert created (port is gone)

8. You mark resolution as "resolved"
   -> resolution_status=resolved
```

---

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/alerts` | GET | List alerts (with filters) |
| `/api/alerts/{id}/dismiss` | PUT | Dismiss single alert |
| `/api/alerts/dismiss-bulk` | PUT | Dismiss multiple alerts |
| `/api/alerts/{id}/reopen` | PUT | Reopen dismissed alert |
| `/api/alerts/bulk-reopen` | PUT | Bulk reopen alerts |
| `/api/alerts/bulk-accept-global` | POST | Accept globally (create rule) |
| `/api/alerts/bulk-accept-network` | POST | Accept in network (create rule) |
| `/api/alerts/bulk-delete` | DELETE | Permanently delete alerts |
| `/api/alerts/{id}/status` | PATCH | Update resolution status |
| `/api/alerts/{id}/severity` | PATCH | Update severity override |
| `/api/alerts/{id}/assign` | PATCH | Assign to user |
| `/api/alerts/{id}/comments` | GET | List comments |
| `/api/alerts/{id}/comments` | POST | Create comment |
| `/api/alerts/{id}/comments/{cid}` | PATCH | Update comment |
| `/api/alerts/{id}/comments/{cid}` | DELETE | Delete comment |
