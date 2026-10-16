import { describe, expect, it } from "vitest";

import type { Alert } from "@/lib/types";

import { alertDisplayTitle, alertToolLabel } from "./alertDisplayTitle";

function alert(source: string, message: string, type = "new_port"): Alert {
  return { source, message, type } as Alert;
}

describe("alertDisplayTitle", () => {
  it.each([
    ["New open port detected globally: 10.0.0.1:53", "New open port 10.0.0.1:53"],
    ["New open port detected: 10.0.0.1:80", "New open port 10.0.0.1:80"],
    ["Open port not in allowlist: 10.0.0.1:22", "Unexpected open port 10.0.0.1:22"],
    ["Blocked port detected: 10.0.0.1:23", "Always-critical port open 10.0.0.1:23"],
  ])("plain port title for %s", (message, expected) => {
    expect(alertDisplayTitle(alert("port", message))).toBe(expected);
  });

  it("uses the GVM finding name and drops OID, target and description", () => {
    const msg =
      "GVM OID 1.3.6.1.4.1.25623.1.0.147232 found 'DNS Server Recursion' on 10.0.0.1:53/udp. Description: blah CVEs: CVE-1";
    expect(alertDisplayTitle(alert("gvm", msg))).toBe("DNS Server Recursion");
  });

  it("falls back to a plain label when the GVM name is missing", () => {
    expect(alertDisplayTitle(alert("gvm", "GVM OID 1.2.3 found '' on 10.0.0.1."))).toBe(
      "Deep vulnerability scan finding",
    );
    expect(alertDisplayTitle(alert("gvm", "garbled"))).toBe(
      "Deep vulnerability scan finding",
    );
  });

  it("uses the nuclei finding name", () => {
    const msg =
      "Nuclei template tech-detect:nginx matched 'Exposed panel' on 10.0.0.1:443/tcp. CVEs: x";
    expect(alertDisplayTitle(alert("nuclei", msg))).toBe("Exposed panel");
    expect(alertDisplayTitle(alert("nuclei", "odd"))).toBe(
      "Web vulnerability check finding",
    );
  });

  it("uses the NSE script name", () => {
    const msg =
      "NSE script 'ssl-heartbleed' found a finding on 10.0.0.1:443/tcp. Output: VULNERABLE";
    expect(alertDisplayTitle(alert("nse", msg))).toBe("ssl-heartbleed");
    expect(alertDisplayTitle(alert("nse", "odd"))).toBe(
      "Vulnerability scripts finding",
    );
  });

  it("summarises NSE CVE matches instead of the script name", () => {
    const msg =
      "NSE script 'vulners' found vulnerability on 10.0.0.1:22/tcp. CVEs: CVE-2023-38408, CVE-2023-28531, CVE-2024-6387, CVE-2026-35385, CVE-2025-26465 (+10 more) Output: x";
    expect(alertDisplayTitle(alert("nse", msg))).toBe(
      "Known vulnerabilities (CVE-2023-38408, CVE-2023-28531, +13 more)",
    );
    expect(
      alertDisplayTitle(
        alert("nse", "NSE script 'vulners' found vulnerability on 1.1.1.1:443/tcp. CVEs: CVE-2024-1234 Output: y"),
      ),
    ).toBe("Known vulnerabilities (CVE-2024-1234)");
  });

  it("strips the target suffix from SSH messages", () => {
    const msg = "SSH server supports weak ciphers: aes128-cbc (OpenSSH_8.2) on 10.0.0.1:22";
    expect(alertDisplayTitle(alert("ssh", msg))).toBe(
      "SSH server supports weak ciphers: aes128-cbc (OpenSSH_8.2)",
    );
  });

  it("drops a trailing severity-promotion note", () => {
    const msg = "SSH server running outdated version: 7.0 on 10.0.0.1:22 (severity promoted from medium to high via rule)";
    expect(alertDisplayTitle(alert("ssh", msg))).toBe(
      "SSH server running outdated version: 7.0",
    );
  });
});

describe("alertToolLabel", () => {
  it("maps sources to plain label + tool name", () => {
    expect(alertToolLabel(alert("gvm", ""))).toEqual({
      label: "Deep vulnerability scan",
      tool: "GVM",
    });
    expect(alertToolLabel(alert("nuclei", ""))).toEqual({
      label: "Web vulnerability check",
      tool: "nuclei",
    });
    expect(alertToolLabel(alert("nse", ""))).toEqual({
      label: "Vulnerability scripts",
      tool: "NSE",
    });
    expect(alertToolLabel(alert("ssh", ""))).toEqual({
      label: "SSH check",
      tool: "ssh-audit",
    });
    expect(alertToolLabel(alert("port", ""))).toEqual({
      label: "Port scan",
      tool: null,
    });
  });
});
