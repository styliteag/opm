# Third-Party Notices

STYLiTE Orbit Port Monitor is distributed under the Business Source License 1.1
(see [`LICENSE`](LICENSE)). It bundles and depends on third-party software under
their own licenses. This file summarizes those components and the obligations
they carry. It is informational and maintained best-effort; the authoritative
per-component license texts ship inside the Docker images (see *Reproducing the
full SBOM* below).

> **License-compatibility note.** The application, backend, and frontend depend
> only on permissive / weak-copyleft components (MIT, BSD, Apache-2.0, ISC,
> MPL-2.0, OFL). The **scanner images** additionally bundle copyleft tools and
> libraries — see *Bundled scanner tools* and *GVM agent* below.

---

## Application / Backend (Python)

All 62 backend runtime dependencies are permissive or weak-copyleft. Key ones:

| Component | License |
|---|---|
| fastapi, starlette, sqlalchemy, alembic, pydantic, pydantic-settings, apscheduler, aiosmtplib, pyotp, aiomysql, pymysql | MIT |
| uvicorn, httpx, passlib, reportlab | BSD |
| python-multipart | Apache-2.0 |
| PyJWT | MIT |
| certifi, pathspec | MPL-2.0 (weak copyleft, file-level — no impact on aggregating code) |

No GPL / AGPL / LGPL components in the backend.

## Frontend (npm)

~950 dependencies (build + runtime), all permissive:

```
MIT 586 · ISC 46 · Apache-2.0 21 · BSD-3-Clause 13 · BSD-2-Clause 12
BlueOak-1.0.0 3 · MIT-0 2 · OFL-1.1 2 (fonts) · MPL-2.0 2 · others (CC0, 0BSD, Python-2.0) 4
```

No GPL / AGPL / LGPL components. The frontend is compiled to static assets; build
tooling (vite, esbuild, etc.) is **not** shipped in the production bundle.

## Scanner (Python)

36 dependencies. Permissive except:

| Component | License | Notes |
|---|---|---|
| **python-gvm** | **GPL-3.0-or-later** | Only in the `opm-scanner-gvm` image (`gvm` extra). Imported by the GVM agent — see *GVM agent* below. |
| **paramiko** | LGPL-2.1 | Transitive via python-gvm; dynamic use only. GVM image only. |
| certifi, pathspec | MPL-2.0 | weak copyleft, file-level. |

The standard scanner image does **not** include python-gvm or paramiko.

---

## Bundled scanner tools (standard scanner image)

These are invoked as **separate executables (subprocesses)**, not linked into
OPM code — i.e. *mere aggregation*. OPM redistributes the unmodified binaries
inside the scanner Docker image and complies with each tool's terms; OPM's own
code is not a derivative work of them.

| Tool | License (as shipped by Debian) | Obligation |
|---|---|---|
| **masscan** | **AGPL-3.0** (a few files MIT/BSD) | Redistribute source/written offer + keep license. AGPL §13 (network use) is **not** triggered: masscan runs locally as a subprocess, no user interacts with it over a network. |
| **nmap** | **nmap-GPL-2** (GPLv2 + Nmap "clarifications"; the DFSG-free Debian build, *not* the NPSL/OEM variant) | Redistribute source/offer + keep license. Nmap's clause about *embedding into proprietary software* targets linking/embedding (OPM does neither). The BSL "source-available + commercial" model vs. "proprietary" is a grey area — confirm with counsel before commercial distribution. |
| **nuclei** | MIT (ProjectDiscovery) | Attribution only. |
| **nuclei-templates** | MIT | Attribution only. |

### Debian base image

The scanner images are built `FROM python:3.x-slim` / Debian and include the
usual system libraries and tools (iproute2, net-tools, procps, tcpdump,
dnsutils, libpcap, glibc, etc.) under a standard mix of GPL-2/GPL-3, LGPL,
BSD, MIT and public-domain licenses. This is normal for any Debian-based image
and constitutes aggregation; the authoritative per-package copyright statements
are retained in the image at `/usr/share/doc/*/copyright`.

---

## GVM agent (`opm-scanner-gvm` image)

The GVM scanner agent imports **python-gvm (GPL-3.0-or-later)**. Because that is
linkage (an `import`, not a subprocess), the GVM-specific OPM modules are
**dual-licensed** `BUSL-1.1 OR GPL-3.0-or-later` so the combined `opm-scanner-gvm`
image is GPL-compliant. See [`scanner/LICENSE-GVM.md`](scanner/LICENSE-GVM.md).

The Greenbone server stack (gvmd / openvas / gsad, AGPL-3.0) is **not** bundled
or redistributed by OPM — those images are pulled by the operator from
`registry.community.greenbone.net` and OPM communicates with them over a Unix
socket. OPM carries no redistribution obligation for the Greenbone server.

---

## Machine-readable SBOM

CycloneDX JSON inventories are committed under [`sbom/`](sbom/) (backend,
scanner, frontend, and the scanner image OS layer). See
[`sbom/README.md`](sbom/README.md) for regeneration commands.

Per-component license **texts** as actually shipped:

```bash
# Python (backend / scanner) — license per installed package
find backend/.venv scanner/.venv -name METADATA -path '*.dist-info/*' \
  -exec grep -H -m1 -E '^(Name|License|License-Expression):' {} +

# Frontend — full per-package license list
cd frontend && npx license-checker --production --json

# Bundled tools + Debian base — authoritative copyright files inside the image
docker run --rm styliteag/opm-scanner:latest \
  sh -c 'for f in /usr/share/doc/*/copyright; do echo "== $f =="; cat "$f"; done'
```

*This document is informational and not legal advice.*
