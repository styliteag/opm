# NSE Scripts for Open Port Monitor

Nmap Scripting Engine (NSE) scripts for vulnerability detection, automatically synchronized from upstream [nmap/nmap](https://github.com/nmap/nmap).

## Structure

```
nse-templates/
├── scripts/              # 612 NSE script files (.nse)
│   ├── vulners.nse
│   ├── smb-vuln-ms17-010.nse
│   ├── ssl-heartbleed.nse
│   └── ...
├── manifest.json         # Script registry (name, path, protocol per script)
└── tools/
    ├── sync-from-nmap.sh   # Sync scripts from upstream nmap
    └── build-manifest.py   # Regenerate manifest.json
```

## Auto-Sync from Nmap

Scripts are automatically synchronized from [nmap/nmap](https://github.com/nmap/nmap) every 6 hours via GitHub Actions. To sync manually:

```bash
cd nse-templates
bash tools/sync-from-nmap.sh
python3 tools/build-manifest.py
```

## manifest.json Format

```json
{
  "name": "opm-nse",
  "version": "0.1.0",
  "description": "NSE scripts for Open Port Monitor",
  "scripts": {
    "vulners.nse": {
      "name": "vulners",
      "path": "scripts/vulners.nse",
      "protocol": "*"
    }
  }
}
```

## Usage in Open Port Monitor

In the NSE Scanner UI, go to **Repositories** and add this repo.
