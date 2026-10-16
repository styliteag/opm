# UI v4 — Parity Audit (Phase 6)

Release gate for the v4 cut-over (ADR 0014). Every row of
[ui-v4-feature-inventory.md](ui-v4-feature-inventory.md) §2 and every bug in §4 is checked
against the `ui-v4` working tree. Audit date 2026-10-16. Method: code read and a read-only
browser walk at http://localhost:5173 as admin. No data was changed: no saves, scans,
triage actions, imports or deletes.

Legend: ✅ present · ✂️ intentionally removed (decision cited) · ⚠️ gap (severity:
**blocker** / **should-fix** / **later**).

## Checks

| Check | Result |
|---|---|
| Backend `mypy src/` | ✅ no issues (189 files) |
| Backend `ruff check src/` | ✅ all checks passed |
| Backend `pytest -q` | ✅ 518 passed |
| Frontend `npm run typecheck` | ✅ clean |
| Frontend `npm run lint` | ✅ clean |
| Frontend `npm run test` | ✅ 75 files, 525 tests (after the audit fixes below) |
| Browser console errors | none on any page visited (Home, alert slide-over, Ports, Hosts, host detail, Networks list/detail/all tabs, network create, scan detail, all Settings pages, Scan dialog, user menu) |

## 1. Feature parity (inventory §2)

### Monitor

| v3 feature | v4 location | Status |
|---|---|---|
| Overview `/overview` | Home `/`: network status strip, important findings | ✅ merged (ADR 0009); `/overview` redirects to `/` |
| Dashboard `/` ("Triage") | Home `/`: review count, important findings, scanner-offline banner. Severity tiles and the 30d chart moved to network detail | ✅ (ADR 0009) |
| Alerts inbox: list, Open/Muted/Allowed, search, source + network filter | Home queue (new-port alerts grouped by IP:port, "in N networks") + Home options "Show snoozed & handled" | ⚠️ **later**: the queue has no search, source or network filter. v3 links `/alerts?source=…&search=…` land on Home without the filter. Recommendation: add a network filter when queues grow; the Ports page already covers search. |
| Alerts: Allow / Mute / Assign / Reopen / Comment | Home row: Expected ▾ (scope + reason), Snooze, ⋯ → Assign / Open details; slide-over: Reopen, comments | ✅ (ADR 0012 renames) |
| Alerts: per-alert Severity Override | — (finding alerts get Accept risk; Settings → Rules → Finding rules) | ✂️ ADR 0012 |
| Alerts: bulk Delete | Home queue selection bar → "Delete…" with confirm modal, operator+ | ✅ |
| Alerts: keyboard j/k/a/m/s | Home queue j/k move · x select · e Expected · s Snooze · Enter details | ✅ (keys renamed with the verbs) |
| Alerts: SSH context, matching rules, scan presence, activity | Alert slide-over (`/?alert=<id>`): scan presence, details, SSH summary, matching rules, activity, comments | ✅ |
| Alerts: CSV/PDF export | Home options → Export CSV / Export PDF (authenticated download) | ✅ (see bug #7) |
| Hosts list (inline hostname/comment, bulk delete) | Ports → Hosts tab `/ports?tab=hosts`: search, network filter, sort, inline edit, bulk delete with ConfirmDialog | ✅ |
| Hosts: Global Ports view | Ports tab `/ports` (default): status filter, search, network, service chips, Why column, inline Expected/Snooze | ✅. The v3 stale filter is now a "Stale" badge on the row and has no filter (**later**) |
| Host detail: header, stats, ports, alerts tabs | `/hosts/$id`: header with "N to review · N important findings", Scan again, port table with status + Why | ✅ (ADR 0008) |
| Host detail: Vulnerabilities tab (nuclei / GVM / NSE) | Per-port findings in the expanded port row, "Host findings" for unbound findings, info findings collapsed | ✅ (ADR 0008/0013) |
| Host detail: Known Hostnames, vhost refresh | Host → Show advanced settings → Known hostnames (Refresh is operator+) | ✅ |
| Host detail: SSH tab | SSH check block inside the SSH port's expanded row (password login, weak KEX/ciphers, version, banner) | ⚠️ **later**: the SSH report export (`/api/ssh/export/pdf`, `/csv`) has no UI caller any more. Recommendation: add "Export SSH report" to the Ports page options or Settings → System. |
| Host detail: Timeline | Host → Activity (collapsible, Load more) | ✅ |
| Host detail: Rescan / Custom Scan | Header "Scan again"; Advanced → Custom scan… | ✅ |
| Host detail: Export CSV/PDF (exported all hosts) | — | ✂️ bug #3 ("fix or Cut"). The global hosts CSV export lives on Ports → Hosts. The hosts **PDF** export (`/api/hosts/export/pdf`) has no UI caller (**later**). |
| Scans list `/scans` | Network detail → Scans tab (`/networks/$id?tab=scans`), incl. "Show hidden scans"; `/scans` redirects | ✂️ global list leaves nav (ADR 0009); per-network list ✅ |
| Scan detail: status, progress, ports found, diff | `/scans/$id`: summary cards, "Changes since the previous scan", open ports table | ✅ |
| Scan detail: vulnerabilities table, nuclei summary | Scan detail → Findings (shared per-port findings component, grouped by host/port) | ✅ (ADR 0008) |
| Scan detail: Engine Logs, Hide/Show | Scan detail → advanced "Engine logs"; header "Hide from list" / "Show in list" | ✅ |
| Quick Scan dialog | Sidebar "Scan Now" → "Scan a network": Scan now / Find live hosts; advanced: vulnerability script profile | ✅ (bug #1 fixed) |

### Configuration

| v3 feature | v4 location | Status |
|---|---|---|
| Networks list: cards, sort, Clone, Scan Now | `/networks`: rows with name, address range, scan type, open ports/last run, next run, Scan now, ⋯ Edit/Clone; sort Name/Next run/Last run/Scanner | ✅ |
| Networks list: phase pill toggles | — (phase settings live in the network form, advanced) | ✂️ ADR 0011 (removes bug #6) |
| Network wizard: basics, scanner, schedule preset, email recipients | `/networks/new` one-page form: name, address range, scanner, ports preset, schedule preset, "Check for vulnerabilities"; recipients under advanced | ✅ (ADR 0011) |
| Network wizard: scanner type, protocol | Advanced → Scan engine: Engine (masscan / nmap / Greenbone), Protocol | ✅ |
| Network form: rate + presets, scan/port timeout, port spec | Ports preset (Common / All TCP / Custom); advanced rate presets + timeouts | ✅ |
| Network form: phase cards | Advanced → Phases (host discovery / port scan / vulnerability scripts) without the Tool select | ✅; dead Tool select ✂️ ADR 0011 (bug #4); Port Range Override ✂️ ADR 0011 (folded into the ports field) |
| Network form: Exclude ports | Advanced → Scan engine → Exclude ports (top level) | ✅ (ADR 0011) |
| Network form: NSE profile | Advanced → "NSE profile — Vulnerability scripts" with help text on the Vulners auto-pick | ✅ |
| Network form: Nuclei block | Essential "Check for vulnerabilities" toggle; tags/threshold/timeout under advanced | ✅ |
| Network form: Greenbone block | Advanced (Greenbone engine): scan config, port list, keep reports, threshold "Default (high)" | ✅ |
| Network form: Schedule builder | Schedule preset Manual only / Daily / Weekly / Custom (advanced builder incl. cron) | ✅ (bug #5 fixed) |
| Network form: SSH probe + overrides | Advanced → SSH check toggle + SSH alert overrides | ✅ |
| Network detail: health cards, trend, tabs | `/networks/$id`: status line, Hosts / Open ports / To review / Important findings cards, 30-day alert trend (shown only when there is data), tabs Ports · Scans · Rules · Settings (read-only summary + Edit) | ✅ |
| Network detail: Port Rules editor | Network → Rules tab, delete with ConfirmDialog | ✅ |
| Network detail: Host discovery runs | Network → Scans tab → Host discovery (+ "Discover hosts") | ✅ |
| Scanners list + detail | Settings → Scanners (`/settings/scanners`, `/settings/scanners/$id`); delete and key regenerate behind confirm | ✅ (bug #8 fixed) |
| Scanner detail: GVM mirror tabs | Scanner detail → "Deep scan profiles" / "Deep scan port lists" tabs | ✅ |
| Scan Templates hub (NSE profiles, scripts, editor, GVM library) | Settings → Scan profiles: tabs "Vulnerability script profiles" · "Scripts" · "Deep scan library"; editor at `/settings/scan-profiles/scripts/$name` | ✅ |
| Alerting hub → Alert Rules | Settings → Rules → Port rules (All / Expected / Always critical) | ✅ |
| Alerting hub → Severity Rules | Settings → Rules → Finding rules (JSON import/export under advanced) | ✅ |
| Alerting hub → SSH Defaults | Settings → Rules → SSH defaults (instant save, stated in the intro) | ✅ |

### Administration

| v3 feature | v4 location | Status |
|---|---|---|
| Users & Roles, user detail | Settings → Users (tabs Users / Roles), `/settings/users/$id` with 2FA reset; deletes and resets confirmed | ✅ (bug #9) |
| Organization | Settings → Organization: name, description, contact email | ✅. Logo URL and policy URL fields ✂️ (plan open question "cut if not used": confirm before release) |
| System → Hostname Lookup Cache | Settings → System (cache, budgets, import/export) | ✅ |
| Account Security | Header user menu → Account security (`/settings/security`); also in the Settings sub-nav as "Account" | ✅ (ADR 0009) |

**Counts (48 rows):** ✅ 42 · ✂️ 4 (Severity Override, host Export, global Scans list,
phase pills) · ⚠️ 2 (alert-queue filters, SSH report export; both later). Partial cuts
inside ✅ rows: Organization logo/policy URL fields and the orphaned hosts PDF export.

## 2. Bug list (inventory §4)

| # | Bug | Status |
|---|---|---|
| 1 | Quick Scan NSE mode never sent profile | ✅ fixed: `QuickScanModal.tsx` sends the profile to `POST /api/nse/scan` (advanced) |
| 2 | Hosts IPv4/IPv6 buttons dead | ✅ fixed: buttons removed; Hosts tab has search + network filter |
| 3 | Host Export / SSH export exported everything | ✅ fixed by removal from the host page. Side effect: SSH report and hosts PDF exports have no UI (⚠️ later) |
| 4 | PhaseCards Tool select dead | ✅ fixed: `PhaseCards.tsx` follows the engine, no per-phase tool select |
| 5 | No "manual / no schedule" | ✅ fixed: "Manual only" preset (`schedulePresets.ts`) |
| 6 | PhasePills inside card link | ✅ fixed: pills removed from the list (ADR 0011) |
| 7 | Alerts export: Muted vs Allowed identical | ⚠️ **later**, still open: `exportAlerts.ts` maps the Home view to `dismissed=true/false`, so Expected and Snoozed alerts export together. Home has no separate Expected/Snoozed view, so the export matches the view. Fix needs a backend `queue_state` param on `/api/alerts/export/*`. |
| 8 | Scanner delete / key regenerate without confirm | ✅ fixed: `ScannerActionConfirm.tsx` |
| 9 | Deletes without confirm (users, severity rules, NSE profiles, port rules) | ✅ fixed: shared `ConfirmDialog` in all four |
| 10 | Hidden scans unreachable | ✅ fixed: Network → Scans "Show hidden scans (N)"; scan detail Hide/Show |
| 11 | NSE editor custom detection; no Clone | ✅ fixed: `nse/lib/scriptKind.ts` uses `type === "custom"`; editor has "Clone to edit" |
| 12 | Links to `/nse/library`, `/nse/profiles` stubs | ✅ fixed: no `Link`/`navigate` targets a legacy route (grep); stubs remain as redirects |
| 13 | Nuclei timeout default 30m vs 120 | ✅ fixed: form help and `DEFAULT_NUCLEI_TIMEOUT_MIN` both say 120 |
| 14 | German SSH validation message | ✅ fixed: string no longer in `src/` |
| 15 | Hosts export `<a href>` without Bearer | ✅ fixed: `hosts/lib/exportHosts.ts` uses `downloadAuthenticated` |
| 16 | Hostname-lookup refresh open to any user | ✅ fixed in backend commit `fa46490` (operator+); UI hides Refresh below operator |

## 3. Legacy URL redirects (ADR 0009 / 0014)

All tested in the browser. Each lands on a sensible v4 page.

| Old URL | Lands on |
|---|---|
| `/overview` | `/` |
| `/trends` | `/` |
| `/alerts` | `/` |
| `/alerts/542` | `/?alert=542` (slide-over opens on that alert) |
| `/alerts/abc` | `/` |
| `/hosts?search=web&network_id=4` | `/ports?tab=hosts&search=web&network_id=4` (filters applied) |
| `/scans` | `/networks` |
| `/scans?network_id=4` | `/networks/4?tab=scans` |
| `/scanners` | `/settings/scanners` |
| `/scanners/1` | `/settings/scanners/1` |
| `/alerting` | `/settings/rules` |
| `/alerting?tab=severity` | `/settings/rules?tab=findings` |
| `/alerting?tab=ssh` | `/settings/rules?tab=ssh` |
| `/alert-rules` | `/settings/rules` |
| `/scan-templates` | `/settings/scan-profiles` |
| `/scan-templates?tab=scripts` | `/settings/scan-profiles?tab=scripts` |
| `/scan-templates?tab=gvm` | `/settings/scan-profiles?tab=gvm` |
| `/nse/profiles` | `/settings/scan-profiles` |
| `/nse/library` | `/settings/scan-profiles?tab=scripts` |
| `/nse/results` | `/networks` |
| `/nse/editor/http-title` | `/settings/scan-profiles/scripts/http-title` |
| `/admin/users` | `/settings/users` |
| `/admin/users?tab=roles` | `/settings/users?tab=roles` |
| `/admin/users/1` | `/settings/users/1` |
| `/admin/roles` | `/settings/users?tab=roles` |
| `/admin/organization` | `/settings/organization` |
| `/admin/system` | `/settings/system` |
| `/admin/hostname-lookup` | `/settings/system` |
| `/admin/severity-rules` | `/settings/rules?tab=findings` |
| `/admin/ssh-alert-defaults` | `/settings/rules?tab=ssh` |
| `/admin/gvm-library` | `/settings/scan-profiles?tab=gvm` |
| `/settings` | `/settings/scanners` |
| `/settings/security` | unchanged (still the account security page) |

v3 network detail tabs (Overview / Configuration / Scans) were local state and never in
the URL, so no tab mapping is needed.

## 4. Wording and polish findings

| Finding | Severity | Recommendation |
|---|---|---|
| The Ports status filter's first option reads **"To decide"** (New + To review). The glossary and plan list the filter as New / To review / Expected / all. | should-fix (doc) | Add "To decide" to the glossary as the filter label for New + To review, or rename the chip. Product call; not changed in this audit. |
| Breadcrumbs show numeric ids for networks, scans, scanners and users ("Networks / 4"). Host pages already show the hostname. | later | Extend the `HostBreadcrumbs` pattern in `components/layout/Header.tsx` to networks and scans. |
| Finding rules "Created" column and the System lookup table use the browser locale (`15.4.2026`), while the rest of the app uses `formatDate` (`Apr 15, 2026`). | later | Switch `SeverityRulesPage.tsx`, `SeverityRuleDialog.tsx`, `HostnameLookupPage.tsx` and `HostKnownHostnames.tsx` to `formatDate`. |
| Icon-only "Add why…" and inline-edit buttons on the Ports/Hosts rows have no accessible name. | later | Add `aria-label`s. |
| Scanner detail → Networks tab showed the raw schedule JSON (`{"type":"monthly_nth",…}`). | fixed | See fixes below. |
| Network detail header read "Deep vulnerability scan (Greenbone (GVM))". | fixed | See fixes below. |

## 5. Fixes made during this audit

| Fix | Files | Test |
|---|---|---|
| Scanner detail Networks tab shows a readable schedule ("Monthly on the 1st Sunday at 02:00", "Manual") instead of raw JSON | `frontend/src/features/networks/lib/scheduleState.ts` (new `scheduleCellText`), `frontend/src/routes/_authenticated/settings/scanners/$scannerId.tsx` | `scheduleState.test.ts` (3 cases), browser-verified |
| Engine name for Greenbone is "Greenbone / GVM" (glossary wording), which removes the nested parentheses in the network header and settings summary | `frontend/src/features/networks/lib/networkLabels.ts` | `networkLabels.test.ts`, `advancedSummary.test.ts` updated, browser-verified |

## 6. Release-gate verdict

No blockers. Before the 3.0.0 release, decide the Organization logo/policy URL cut and the
"To decide" wording. The later items can go in 3.0.x: alert-queue filters, the SSH
report and hosts PDF export entry points, the bug #7 export split, breadcrumbs, date
formatting and aria labels.
