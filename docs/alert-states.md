# Alert States & Actions — Explained Simply

## The Two Big Ideas

An alert has **two independent properties**:

1. **Visibility**: Is the alert **active** (you see it) or **dismissed** (hidden)?
2. **Resolution**: Is the alert **open**, **in progress**, or **resolved**?

These are independent — you can dismiss an alert that's still "open", or resolve one that's still visible.

---

## The 5 Actions

### Dismiss
> "I've seen this, hide it for now."

- Hides the alert from the active list
- You can add a reason ("known service", "testing port", etc.)
- The alert still exists — it's just not in your face anymore

### Reopen
> "Wait, I need to look at this again."

- The opposite of Dismiss
- Brings a dismissed alert back to the active list
- Clears the dismiss reason

### Accept (Global or Network)
> "This port is fine. Don't bother me about it ever again."

- Creates a **permanent rule** (whitelist entry) for that IP:port
- Also dismisses the alert as a side effect
- Future scans won't create new alerts for this IP:port
- Two scopes:
  - **Global**: rule applies everywhere
  - **Network**: rule applies only in one network

### Revoke
> "I changed my mind — that port shouldn't be whitelisted anymore."

- **Deletes the acceptance rule** created by Accept
- Future scans WILL create alerts for this IP:port again
- Does NOT reopen the already-dismissed alert (use Reopen for that)

### Delete
> "Remove this alert permanently."

- Gone forever. Cannot be undone.

---

## State Diagram

```
                         ┌─────────────────────────┐
                         │                         │
                         │    🟢 ACTIVE (New)       │
                         │    dismissed = false     │
                         │                         │
                         └────┬──────────┬─────────┘
                              │          │
                   ┌──────────┘          └──────────┐
                   │                                │
                   ▼                                ▼
    ┌──────────────────────┐         ┌──────────────────────────┐
    │                      │         │                          │
    │   DISMISS            │         │   ACCEPT                 │
    │   "Hide it"          │         │   "Whitelist it"         │
    │                      │         │                          │
    └──────────┬───────────┘         └─────────┬────────────────┘
               │                               │
               │                               │  (creates a rule
               │                               │   AND dismisses)
               ▼                               ▼
    ┌──────────────────────────────────────────────────────────┐
    │                                                          │
    │    🔵 DISMISSED                                          │
    │    dismissed = true                                      │
    │                                                          │
    │    May or may not have an acceptance rule behind it      │
    │                                                          │
    └──────────┬──────────────────────────────┬────────────────┘
               │                              │
               ▼                              ▼
    ┌────────────────────┐       ┌─────────────────────────┐
    │                    │       │                         │
    │   REOPEN           │       │   REVOKE                │
    │   "Show it again"  │       │   "Delete the rule"     │
    │                    │       │                         │
    │   → back to 🟢     │       │   Alert stays dismissed │
    │     ACTIVE         │       │   but future scans will │
    │                    │       │   create new alerts     │
    └────────────────────┘       └─────────────────────────┘
```

---

## Dismiss vs Accept — What's the Difference?

| | Dismiss | Accept |
|---|---|---|
| **What it does** | Hides this one alert | Hides this alert AND creates a rule |
| **Future alerts** | New scan → new alert appears | New scan → no alert (rule blocks it) |
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

## Full Lifecycle Example

```
1. Scanner finds port 8080 open on 192.168.1.5
   → Alert created: 🟢 ACTIVE

2. You click "Accept Globally" with reason "Web server"
   → Rule created: 192.168.1.5:8080 = ACCEPTED
   → Alert becomes: 🔵 DISMISSED

3. Next scan finds port 8080 still open
   → No new alert (rule matches, so it's ignored)

4. You realize the web server was decommissioned, click "Revoke"
   → Rule deleted
   → Original alert still 🔵 DISMISSED (unchanged)

5. Next scan finds port 8080 still open
   → NEW alert created: 🟢 ACTIVE (because rule is gone now)

6. You click "Dismiss" with reason "Shutting down tomorrow"
   → Alert becomes: 🔵 DISMISSED

7. Tomorrow comes, port is still open. You click "Reopen"
   → Alert becomes: 🟢 ACTIVE again
```

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

## Resolution Status (Independent Track)

Separately from dismiss/active, each alert has a resolution status:

```
  OPEN  ──→  IN PROGRESS  ──→  RESOLVED
    ↑             │                │
    └─────────────┘                │
    └──────────────────────────────┘
```

This is for your own tracking ("am I investigating this?") and does **not**
affect whether the alert is visible or dismissed. You can change resolution
status at any time regardless of the dismissed state.
