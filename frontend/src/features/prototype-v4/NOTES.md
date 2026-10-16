# PROTOTYPE — UI v4 Home + Host detail (throwaway)

**Questions:**
1. Which Home layout answers "which ports are new, and are they okay?" fastest?
2. How should a ports-first host page show status, Why, and per-port findings?

Context: [docs/redesign/ui-v4-plan.md](../../../../docs/redesign/ui-v4-plan.md), ADRs 0008–0014.

## How to view

Dev stack running (`just dev-up`), then:

| Page | URL |
|---|---|
| Home | http://localhost:5173/?variant=A (B, C) |
| Host | http://localhost:5173/hosts/82?variant=A (B, C) — any host id works |

Without `?variant` the existing v3 page renders. ←/→ or the pink bottom bar switch
variants. Bar is hidden in production builds.

| Key | Home | Host |
|---|---|---|
| A | Queue list — one column, grouped host:port rows, inline Expected ▾ / Snooze, findings below | Port table, Why column, findings expand under each port |
| B | Board by network — one column per network, findings rail | Split view — port list left, selected port detail right |
| C | One at a time — big decision card, Why quick picks, progress | Needs you first — decision cards, important findings, explained ports as one line |

Real data from existing hooks (read-only). Every action is a stub toast — nothing is
saved. Host findings = GVM/nuclei vulnerabilities + open SSH/NSE host alerts folded in.

## Verdict

Decided by Claude while the user was AFK (2026-10-16) — **review and override if you disagree.**

- **Home → A (Queue list)**, plus from C: Why quick picks offered right after clicking
  Expected (optional), and keyboard flow (j/k, e = Expected, s = Snooze).
  - B rejected: with 9+ networks the board scrolls sideways and splits one decision list
    into many; network context is already a badge on the row.
  - C rejected as default: one-at-a-time is slow for 10+ items and hides the overview.
    Could return later as an optional "focus mode".
- **Host → A (Port table + expand)**, plus from C: ports needing a decision sort first,
  informational findings collapsed to a count.
  - B rejected: split view hides the port overview, which is the whole point of the page.
  - C rejected: no single table of all ports; operators compare ports side by side.
- Data finding: vulnerabilities endpoint covers GVM/nuclei only. The real Findings
  component needs one source covering GVM, nuclei, NSE and SSH per port.

## Cleanup when decided

Delete `features/prototype-v4/`, remove the `validateSearch` + `HomeRoute`/`HostRoute`
wrappers from `routes/_authenticated/index.tsx` and `routes/_authenticated/hosts/$hostId.tsx`,
record the verdict in ui-v4-plan.md, then build the winner properly in phase 2/3.
