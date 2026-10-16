# UI Simplification — Feature Inventory

Snapshot of the UI after the v3 merge (`ac3bbab`, 2026-10-16), built from a code read of
`frontend/src`. Purpose: decide per feature whether it belongs in the **Basic** UI, moves
behind **Advanced**, stays **Admin**-only, or is **Cut**. The `Draft tier` column is a
proposal to argue with, not a decision.

Context: UI v3 ([ui-v3-plan.md](ui-v3-plan.md)) already cut navigation from 16 to 12 items
and added the alert inbox and network wizard. ADR 0006 deliberately kept tool names
(GVM / NSE / nuclei / OID) in the UI — that decision is the main lever left on the table.

## 1. Numbers at a glance

| Metric | Value |
|---|---|
| Sidebar entries | 12 (+ "Scan Now") in 3 groups + Overview |
| Routes | 33 files, 11 of them pure redirect stubs |
| Heaviest page | Host detail: ~30 controls + 15-field Custom Scan dialog |
| Network form | ~45 values, ~75 clickable controls worst case |
| Ways to start a scan | 4 (Quick Scan, Network "Scan Now", Host Rescan, Host Custom Scan) |
| Ways to change how loud a finding is | 4 (alert Severity Override, OID severity rule, network/nuclei alert threshold, alert rule "Critical") |
| Ways to silence something | 4 (Mute, Allow, severity-rule downgrade, Delete) |
| Delete-confirm styles | 4 (modal, AlertDialog, native `confirm()`, none) |
| Page-level role guards | 0 — sidebar hides areas, pages render every control for every role |

## 2. Inventory

Tiers: **B** Basic · **A** Advanced (hidden by default / behind toggle) · **Adm** admin
area · **Cut** remove or merge. Roles column = backend minimum for mutations.

### Monitor

| Page / feature | What it does | Jargon / pain | Roles | Draft tier |
|---|---|---|---|---|
| Overview `/overview` | Per-network traffic lights, top 5 risks, 30d chart | Duplicates Dashboard chart + counts | all | **B** — merge with Dashboard into one home |
| Dashboard `/` ("Triage") | Severity tiles, scanner health, last/next scans, 30d chart | Sidebar says "Dashboard", h1 says "Triage"; tiles look filtered but aren't; "Threat Pulse" | all | **B** — merge with Overview |
| Alerts inbox: list, status Open/Muted/Allowed, search, source + network filter | Triage queue | Source filter lists GVM/NSE/Nuclei | all read | **B** |
| Alerts: Allow / Mute / Assign / Reopen / Comment | Triage actions | Allow vs Mute well-explained; Reopen keeps allow rule (tooltip only) | analyst+ | **B** |
| Alerts: per-alert Severity Override select | Reweight one alert | Overlaps severity rules; 4 levels vs 5 elsewhere | analyst+ | **Cut?** or **A** |
| Alerts: bulk Delete | Permanent delete | Next to Mute/Allow, easy to confuse | operator+ | **A** |
| Alerts: keyboard shortcuts j/k/a/m/s | Power triage | — | analyst+ | **B** (invisible to novices anyway) |
| Alerts: SSH context, matching rules, scan presence, activity | Detail pane panels | KEX, "Matching Rules" | all | **B** collapsed, details **A** |
| Alerts: CSV/PDF export | Export | Export ignores Muted vs Allowed distinction (bug) | all | **B** |
| Hosts list | Inventory, inline hostname/comment, bulk delete | IPv4/IPv6 filter is dead UI; native `confirm()` | all / operator+ delete | **B** (delete **A**) |
| Hosts: Global Ports view | Cross-host open ports, service chips, stale filter | Same search box changes meaning by mode | all | **A** |
| Host detail: header, stats, ports, alerts tabs | 360° host view | "Coverage %" unexplained; ports show raw `accepted` | all | **B** |
| Host detail: Vulnerabilities tab (nuclei / GVM / NSE sections) | Findings | OID, QoD, CVSS vector, matcher | all | **B** as one "Findings" list, raw fields **A** |
| Host detail: Known Hostnames, vhost refresh | Reverse-IP vhosts | SNI fan-out, HackerTarget/RapidDNS | all (refresh: any user, see §4) | **A** |
| Host detail: SSH tab | SSH assessment | KEX, keyboard-interactive; export is global, not this host | all | **B** summary, export **A** |
| Host detail: Timeline | Event feed | — | all | **B** |
| Host detail: Rescan / Custom Scan (15 fields) | Ad-hoc scans | 3rd and 4th way to scan; full engine knobs | operator+ | Rescan **B**, Custom Scan **A** |
| Host detail: Export CSV/PDF | Exports *all* hosts, not this one (bug) | Misleading | all | fix or **Cut** |
| Scans list | History by network | No status/sort filter; hidden scans unreachable | all | **B** |
| Scan detail: status, progress, ports found, diff vs previous | Result summary | — | all | **B** |
| Scan detail: vulnerabilities table, nuclei summary | Findings | Second implementation of the host Findings UI | all | **B** (unify with host) |
| Scan detail: Engine Logs, Hide/Show | Debugging | Engine logs = operator debugging | all | **A** |
| Quick Scan dialog (sidebar "Scan Now") | Scan a network from anywhere | NSE mode ignores chosen profile (bug); visible to viewers | operator+ | **B** port scan only, NSE **A** |

### Configuration (operator+)

| Page / feature | What it does | Jargon / pain | Draft tier |
|---|---|---|---|
| Networks list: cards, sort, Clone, Scan Now | Network overview | 6-column grid of engine data per card; pills mix toggles and read-only; schedule badge is a hidden pause button | **B** slimmed (name, CIDR, last status, next run, Scan Now) |
| Networks list: phase pill toggles (host discovery, SSH, nuclei) | One-click phase toggles | Click may also follow card link (bug); jargon | **A** |
| Network wizard: Basics (name, CIDR), scanner, schedule preset, email recipients | Create a network | CIDR | **B** |
| Network wizard: scanner type masscan/nmap/greenbone, protocol | Engine choice | Tool names | **A** — Basic picks a sensible default ("Standard scan") |
| Network form: rate pps + presets, scan/port timeout, port spec | Engine tuning | pps, ms | **B** port spec only as presets ("Common ports / All ports"); rest **A** |
| Network form: phase cards (host discovery, port scan, vuln scan) with aggressive/retries/parallel | Pipeline tuning | Hidden behind unlabeled chevron; port-scan Tool select is dead (overwritten on save); Port Range Override duplicates port spec | **A**; dead Tool select **Cut**; Port Range Override **Cut?** |
| Network form: Exclude ports | Skip ports | Only reachable inside phase card | **B** — promote to visible field |
| Network form: NSE profile | Vuln scripts | Auto-selects "Vulners" silently | **A** |
| Network form: Nuclei block (tags, 11 chips, threshold, timeout, SNI fan-out) | Web vuln scanning | Heavy jargon | **B** = one "Web vulnerability check" toggle; rest **A** |
| Network form: Greenbone block (config, port list, keep reports, threshold) | GVM | GVM, port_list_id, GSA | **A** |
| Network form: Schedule builder (6 types, cron, presets) | Scheduling | No "manual / no schedule" option; cron | **B** presets + "Manual only"; custom/cron **A** |
| Network form: SSH probe toggle + 6 SSH overrides | SSH alerting | KEX, diffie-hellman; German validation message | toggle **B**, overrides **A** |
| Network detail: health cards, trend, tabs Overview / Configuration / Scans | Per-network view | Config shown 3× (Overview tab, Config tab, Edit modal) | **B** — one read-only summary + Edit |
| Network detail: Port Rules editor | Network-scoped allow/critical rules | Separate from Alerting hub; delete without confirm | **A** (Allow from inbox covers the common case) |
| Network detail: Host discovery runs | Discovery history | — | **A** |
| Scanners list + detail | Register agents, API keys, stats | Kind GVM/Unified, image names; Delete + Regenerate key **without confirm** | **A** (set up once) |
| Scanner detail: GVM mirror tabs | GVM config sync status | xml hash, "unmanaged", "will deploy" | **A** |
| Scan Templates hub: NSE Profiles, NSE Scripts, NSE Editor, GVM Library (3 tab levels) | Engine content | Heaviest jargon in the app; nested h1s; links via v2 redirects | **A** (whole hub) |
| Alerting hub → Alert Rules | Global allow/critical rules | Copy says "accepted/criticality", option says "Allowed" | **B** as "Allowed ports" list (view + revoke); add/edit **A** |
| Alerting hub → Severity Rules | Per-OID severity overrides, JSON import/export | Raw OIDs; delete without confirm | **A** |
| Alerting hub → SSH Defaults | Global SSH alert toggles | Mixed instant-save and Save button | **A** |

### Administration (admin)

| Page / feature | What it does | Pain | Draft tier |
|---|---|---|---|
| Users & Roles, user detail | Accounts, roles, 2FA reset | Delete + 2FA reset without confirm; subtitle promises login audit that doesn't exist | **Adm** |
| Organization | Name, description, contact, logo URL, policy URL | Unclear if logo/policy URL are used anywhere | **Adm** or **Cut** if unused |
| System → Hostname Lookup Cache | vhost cache, budgets, import/export | SNI fan-out, budgets | **Adm** |
| Account Security (header email link) | Own password + 2FA | Not discoverable (no menu) | **B** via a proper user menu |

## 3. Cross-cutting simplification levers

1. **Role-aware UI.** Backend enforces roles (alert actions analyst+, config/delete
   operator+), but pages render every control for viewers, who then hit 403s. Hiding
   controls by role is the cheapest simplification and needs no product decision.
2. **Basic / Advanced switch.** Most "Advanced" rows above are engine tuning. A per-user
   toggle (or "Show advanced settings" disclosure per form) removes ~60% of network-form
   controls from the default view without deleting features.
3. **Plain-language layer over tool names** (revisits ADR 0006): "Web vulnerability check"
   instead of Nuclei, "Deep vulnerability scan" instead of Greenbone/GVM, "Finding ID"
   instead of OID; tool names stay visible in Advanced.
4. **One concept, one place:**
   - Home: merge Dashboard + Overview.
   - Scanning: one "Scan" action with an optional "Customize" step, instead of 4 entry
     points with 4 different field sets.
   - Severity: keep severity rules, drop the per-alert Severity Override (or vice versa).
   - Findings: one component for host and scan vulnerability lists.
   - Port tables: 4 implementations → 1.
5. **Consistency:** one delete-confirm pattern; one severity scale (4 vs 5 levels);
   Allow/Mute wording everywhere (host alerts tab still says "Dismissed", ports say
   `accepted`); one export mechanism.

## 4. Bugs and dead UI found during the inventory

Not part of the simplification itself — fix separately (each needs its own regression test).

| # | Where | Problem |
|---|---|---|
| 1 | `features/scans/components/QuickScanModal.tsx` | NSE mode requires a profile but never sends it; runs a plain port scan |
| 2 | `routes/_authenticated/hosts/index.tsx` | All / IPv4 / IPv6 buttons only reset the page; no filter behind them |
| 3 | Host detail Export + SSH export | Export all hosts / global SSH report, not the current host |
| 4 | Network form `PhaseCards` port-scan Tool select | Overwritten by top-level Type in `buildNetworkPayload` — dead control |
| 5 | Network schedule builder | No way to set "manual / no schedule"; empty shows "Daily at 02:00" |
| 6 | `PhasePills.tsx` ~L128 | Buttons inside card `<Link>` call `stopPropagation` but not `preventDefault` — may navigate |
| 7 | Alerts export | Maps status preset to legacy `dismissed`; Muted and Allowed exports identical |
| 8 | Scanners list | Delete scanner + Regenerate API key fire without confirmation |
| 9 | Users, severity rules, NSE profiles, port rules | Delete without confirmation |
| 10 | `/scans` | Hidden scans cannot be listed or unhidden |
| 11 | NSE editor | Custom detection by `custom_` prefix vs `type === "custom"` in library; no Clone button |
| 12 | Old v2 links | NSE pages link to `/nse/library`, `/nse/profiles` redirect stubs |
| 13 | Nuclei timeout | Detail says "Default (30m)", form help says 120 |
| 14 | SSH override validation | German message "Format z. B. 8.0 oder 8.0.0" in English UI |
| 15 | Hosts list Export | Plain `<a href>` without Bearer header (alerts export sends one) — verify it works |
| 16 | `POST /api/hosts/{id}/hostname-lookup/refresh` | Accepts any `CurrentUser`; viewers can queue external reverse-IP lookups (low severity, budget abuse) |

## 5. Not covered yet

- **Real usage data.** Tiers above are guesses from structure, not from what users click.
  Need user input (or analytics) before Cut decisions.
- **Click-count walkthrough** of the top tasks in the browser (Chrome extension was not
  connected during this inventory).
- Which roles the complaining users actually have — if most are viewers/analysts, lever 1
  alone changes a lot.
