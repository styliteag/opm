# Alert States

This document describes how alert state works in the current codebase across the database, API, and UI.

It is intentionally centered on the current implementation, because the alert system has changed over time and older terminology still appears in some historical notes and migrations.

## Core Model

An alert has four largely independent pieces of state:

1. `dismissed`
   Whether the alert is currently hidden from the active review queue.
2. `resolution_status`
   Workflow state for remediation tracking: `open`, `in_progress`, `fix_planned`, or `resolved`.
3. `assigned_to_user_id`
   Optional owner for follow-up.
4. `severity_override`
   Optional manual severity override. If unset, severity is computed from alert type and matching critical rules.

The current alert model lives in the `alerts` table and includes:

- `type` / `alert_type`
- `source`
- `ip`
- `port` (nullable for sources that may not use a port)
- `dismissed`
- `dismiss_reason`
- `resolution_status`
- `assigned_to_user_id`
- `severity_override`

Two practical consequences follow from that model:

1. Dismissing an alert does not mean it is resolved.
2. Accepting an alert does not just hide the current record; it changes future alert generation by creating a rule.

## Alert Sources And Types

Alerts are grouped by `source`.

### Port alerts (`source = "port"`)

| Type | Meaning |
|------|---------|
| `new_port` | A newly observed open port on the network |
| `not_allowed` | A port that violates the network policy |
| `blocked` | A port matched by a critical rule |

### SSH alerts (`source = "ssh"`)

| Type | Meaning |
|------|---------|
| `ssh_insecure_auth` | Password or keyboard-interactive auth is enabled |
| `ssh_weak_cipher` | Weak SSH ciphers were detected |
| `ssh_weak_kex` | Weak key exchange algorithms were detected |
| `ssh_outdated_version` | SSH version is below the configured threshold |
| `ssh_config_regression` | SSH security posture regressed compared to a previous scan |

The `source` field matters because rule matching, filtering, and UI grouping now operate on source directly rather than inferring category from the alert type name alone.

## Severity

Runtime severity is computed by the alerts router, not stored as a fixed column.

Default runtime mapping today:

| Condition | Severity |
|-----------|----------|
| Matching global critical rule | `critical` |
| `blocked` | `critical` |
| `new_port` | `high` |
| `not_allowed` | `medium` |
| `ssh_insecure_auth` | `high` |
| `ssh_weak_cipher` | `medium` |
| `ssh_weak_kex` | `medium` |
| `ssh_outdated_version` | `medium` |
| `ssh_config_regression` | `high` |

If `severity_override` is set, it wins over the computed value.

Important: dismissing an alert does not automatically force severity to `info`. `info` is only used when selected as an override.

In practice, the severity decision order is:

1. explicit `severity_override`
2. matching critical rule when applicable
3. built-in default for the alert type

## Dismiss, Accept, Reopen, Revoke

These actions are easy to confuse because they affect different layers.

## State Diagram

```text
                          +----------------------------------+
                          |                                  |
                          |   ACTIVE                         |
                          |   dismissed = false              |
                          |                                  |
                          +----------------+-----------------+
                                           |
                  +------------------------+------------------------+
                  |                                                 |
                  v                                                 v
      +---------------------------+                    +---------------------------+
      | DISMISS                   |                    | ACCEPT                    |
      | PUT /alerts/{id}/dismiss  |                    | POST bulk-accept-*        |
      |                           |                    |                           |
      | Optional:                 |                    | Creates accepted rule      |
      | - dismiss_reason          |                    | and dismisses matching     |
      | - resolution_status       |                    | current alerts             |
      +-------------+-------------+                    +-------------+-------------+
                    |                                                    |
                    +------------------------+---------------------------+
                                             |
                                             v
                          +----------------------------------+
                          |                                  |
                          |   DISMISSED                      |
                          |   dismissed = true               |
                          |                                  |
                          |   May or may not have an         |
                          |   accepted rule behind it        |
                          +----------------+-----------------+
                                           |
                     +---------------------+----------------------+
                     |                                            |
                     v                                            v
      +-----------------------------+              +-------------------------------+
      | REOPEN                      |              | REVOKE                        |
      | PUT /alerts/{id}/reopen     |              | DELETE /api/port-rules/...    |
      |                             |              |                               |
      | Clears dismiss_reason       |              | Removes future suppression    |
      | and shows the alert again   |              | but does not reopen old       |
      +--------------+--------------+              | dismissed alerts              |
                     |                             +-------------------------------+
                     |
                     v
          +---------------------------+
          | back to ACTIVE            |
          +---------------------------+
```

`resolution_status`, `assigned_to_user_id`, and `severity_override` move on separate tracks. They can be changed while an alert is active or dismissed.

If you want a quick mental model:

- `dismiss` is a review/queue action
- `accept` is a policy/rule action
- `reopen` is a review/queue action
- `revoke` is a policy/rule action

### Dismiss

`PUT /api/alerts/{id}/dismiss`

What it does:

- sets `dismissed = true`
- optionally stores `dismiss_reason`
- optionally updates `resolution_status`
- can optionally dismiss related SSH findings for the same `ip:port`

What it does not do:

- it does not create a suppression rule
- it does not prevent future scans from creating similar alerts
- it does not mark the issue resolved unless you explicitly set the resolution state

Bulk variant:

- `PUT /api/alerts/dismiss-bulk`

When a dismiss reason is provided, the backend also propagates it to:

- the related `global_open_ports.user_comment` when applicable
- the related host comment if the host does not already have one

That propagation is useful operationally because the same rationale can then appear in host and port views without duplicating the note manually.

### Accept

Accepting an alert creates an alert rule and dismisses matching current alerts.

Endpoints:

- `POST /api/alerts/bulk-accept-global`
- `POST /api/alerts/bulk-accept-network`

What it does:

- creates an `accepted` rule in the unified `alert_rules` table
- dismisses matching active alerts
- prevents future matching alerts from being generated

This is the closest thing to a permanent "this is expected" decision in the current system.

Accepted rules can be:

- global: `network_id = null`
- network-scoped: `network_id = <network>`

In the UI this appears as accepting globally or accepting within a network. In the backend both paths create unified rules; only the scope differs.

### Reopen

`PUT /api/alerts/{id}/reopen`

What it does:

- sets `dismissed = false`
- clears `dismiss_reason`

It does not remove any rule that may have caused the alert to be accepted earlier.

That distinction matters. Reopening makes the alert visible again for review, but it does not undo policy.

Bulk variant:

- `PUT /api/alerts/bulk-reopen`

### Revoke

There is no dedicated revoke-alert endpoint. Revoking acceptance means deleting the underlying rule.

Endpoint:

- `DELETE /api/port-rules/{scope}/{rule_id}`

Scopes:

- `global`
- `network`

Deleting the rule changes future alert generation. It does not automatically reopen old dismissed alerts.

If you want both effects, the full workflow is:

1. delete the accepted rule
2. reopen the alert if you want the existing record back in the active queue

## Unified Alert Rules

The legacy split between `port_rules` and `global_port_rules` has been replaced in active API usage by a unified `alert_rules` model exposed through `/api/port-rules`.

Each rule has:

- `source`: currently `port` or `ssh`
- `rule_type`: `accepted` or `critical`
- `match_criteria`: JSON criteria such as port ranges, IP, and optional SSH alert type
- optional `network_id`

This unified model is the biggest architectural change compared with older documentation. It replaces the older split between separate global and network rule tables as the active rule-management interface.

Examples:

- port rule: `{"ip": "10.0.0.5", "port": "22"}`
- SSH rule: `{"ip": "10.0.0.5", "port": "22", "alert_type": "ssh_weak_cipher"}`

The Alert Rules page in the UI uses `/api/port-rules` for both port and SSH rule management.

That page name is slightly historical. Despite the route name and page label, it is now a unified alert-rule management surface, not just a port-only rule editor.

## Resolution Workflow

`resolution_status` is independent from `dismissed`.

Allowed values:

| Value | Meaning |
|-------|---------|
| `open` | Default state |
| `in_progress` | Someone is actively working the issue |
| `fix_planned` | Remediation is planned but not done yet |
| `resolved` | Work is done |

The UI exposes a "Fix" shortcut, but there is no separate backend fix action. It is just a dismiss flow that sets `resolution_status = "fix_planned"` and usually adds a comment.

This means "Fix" should be read as a convenience workflow, not a distinct persistence model.

## Assignment

`PATCH /api/alerts/{id}/assign`

What it does:

- assigns the alert to a user
- `{"user_id": null}` removes the assignment

Assignment does not affect dismissal, severity, or resolution state.

This is purely an ownership signal for team coordination.

## Comments

Comment endpoints:

- `GET /api/alerts/{id}/comments`
- `POST /api/alerts/{id}/comments`
- `PATCH /api/alerts/{id}/comments/{comment_id}`
- `DELETE /api/alerts/{id}/comments/{comment_id}`

Comments are used for review history and operator notes. Dismissing with a reason affects `dismiss_reason`; comment creation is a separate API flow.

That split is deliberate:

- `dismiss_reason` is a structured field tied to queue state
- comments are a general discussion/history stream

## State Combinations That Matter

Typical combinations in the UI:

| Example | Meaning |
|---------|---------|
| `dismissed=false`, `resolution_status=open` | New or still-active alert |
| `dismissed=false`, `resolution_status=in_progress` | Visible and being investigated |
| `dismissed=true`, `resolution_status=fix_planned` | Hidden from active queue but fix is planned |
| `dismissed=true`, accepted rule exists | Suppressed now and in future |
| `dismissed=false`, accepted rule exists | Possible after manual reopen; future scans still follow the rule |

The last combination looks odd at first, but it is valid. It can happen if an operator reopens an alert for review while the suppression rule still exists underneath it.

## Example Lifecycle

```text
1. A scan finds 192.168.10.15:8080
   -> alert created as source=port, type=new_port

2. An operator reviews it and decides it is real but not urgent
   -> dismisses it with a reason
   -> dismissed=true, future scans can still create similar alerts

3. Later the team confirms this port is intentionally exposed
   -> accepts it at network scope
   -> an accepted rule is created
   -> future matching alerts are suppressed

4. Months later the exception is no longer valid
   -> the accepted rule is deleted
   -> future scans can alert again

5. If the team wants the old alert visible again immediately
   -> they reopen the alert separately
```

## Related Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/alerts` | `GET` | List alerts |
| `/api/alerts/{id}` | `GET` | Alert detail |
| `/api/alerts/{id}/dismiss` | `PUT` | Dismiss one alert |
| `/api/alerts/dismiss-bulk` | `PUT` | Dismiss many alerts |
| `/api/alerts/{id}/reopen` | `PUT` | Reopen one alert |
| `/api/alerts/bulk-reopen` | `PUT` | Reopen many alerts |
| `/api/alerts/bulk-accept-global` | `POST` | Create global accepted rules from alerts |
| `/api/alerts/bulk-accept-network` | `POST` | Create network accepted rules from alerts |
| `/api/alerts/bulk-delete` | `DELETE` | Permanently delete alerts |
| `/api/alerts/{id}/status` | `PATCH` | Update `resolution_status` |
| `/api/alerts/{id}/severity` | `PATCH` | Update `severity_override` |
| `/api/alerts/{id}/assign` | `PATCH` | Assign or unassign |
| `/api/port-rules` | `GET` / `POST` | List or create unified alert rules |
| `/api/port-rules/{scope}/{id}` | `PATCH` / `DELETE` | Update or delete a rule |
