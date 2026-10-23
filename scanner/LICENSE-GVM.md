# GVM agent licensing (GPL exception)

STYLiTE Orbit Port Monitor as a whole is licensed under the Business Source License
1.1 (see the repository root [`LICENSE`](../LICENSE)). The **GVM scanner agent**
is the one exception, for licence-compatibility reasons described below.

## Why

The GVM agent talks to a Greenbone `gvmd` instance through
**[`python-gvm`](https://github.com/greenbone/python-gvm)**, which is licensed
**GPL-3.0-or-later**. The agent uses it by `import` (in-process linkage), not as
a subprocess, so the combined work is subject to the GPL when distributed. The
Business Source License is **not** GPL-compatible, so shipping BSL-only code
linked against python-gvm in the `opm-scanner-gvm` image would be a conflict.

## The grant

As the sole copyright holder of the OPM source, STYLiTE AG resolves this by
**dual-licensing** the GVM-specific code:

- `scanner/src/scanners/greenbone.py`
- `scanner/src/scanners/greenbone_metadata.py`
- the GVM code paths in `scanner/src/main.py` (the `kind in ("gvm","unified")`
  branch that imports `gvm.*`)

are offered under **`BUSL-1.1 OR GPL-3.0-or-later`** (SPDX). Recipients may use
these files under either license.

Furthermore, when OPM is built and distributed as the **`opm-scanner-gvm`**
image (the `gvm` extra, which bundles python-gvm), STYLiTE additionally offers
the **entire scanner agent in that image** under **GPL-3.0-or-later**. Choosing
the GPL option for OPM's code makes the combined image GPL-3.0-compliant.

## Scope — what is *not* affected

- The standard scanner image (`styliteag/opm-scanner`) does **not** bundle
  python-gvm and remains BSL-1.1 only.
- The backend, frontend, and the combined `styliteag/opm` app remain BSL-1.1.
- The Greenbone server stack (`gvmd`, `openvas`, `gsad` — AGPL-3.0) is **not**
  redistributed by OPM; operators pull it from
  `registry.community.greenbone.net`. OPM only communicates with it over a Unix
  socket and carries no redistribution obligation for it.

The full GPL-3.0 text is included alongside this file as
[`COPYING.GPL-3.0`](COPYING.GPL-3.0).

*Informational summary, not legal advice. See [`../LICENSING.md`](../LICENSING.md).*
