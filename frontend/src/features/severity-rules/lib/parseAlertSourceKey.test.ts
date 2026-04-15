import { describe, expect, it } from "vitest";

import { parseAlertSourceKey } from "./parseAlertSourceKey";

describe("parseAlertSourceKey", () => {
  it("parses a GVM alert source key", () => {
    expect(
      parseAlertSourceKey(
        "gvm",
        "gvm:7:10.0.0.5:443:tcp:1.3.6.1.4.1.25623.1.0.147232",
      ),
    ).toEqual({
      source: "gvm",
      networkId: 7,
      ip: "10.0.0.5",
      port: 443,
      protocol: "tcp",
      oid: "1.3.6.1.4.1.25623.1.0.147232",
    });
  });

  it("preserves the colon-containing OID for nuclei findings", () => {
    expect(
      parseAlertSourceKey(
        "nuclei",
        "nuclei:12:10.0.0.5:443:tcp:cves/2023/CVE-2023-12345:body",
      ),
    ).toEqual({
      source: "nuclei",
      networkId: 12,
      ip: "10.0.0.5",
      port: 443,
      protocol: "tcp",
      oid: "cves/2023/CVE-2023-12345:body",
    });
  });

  it("preserves the `nse:` prefix in NSE OIDs", () => {
    expect(
      parseAlertSourceKey("nse", "nse:3:194.59.156.71:53:udp:nse:dns-recursion"),
    ).toEqual({
      source: "nse",
      networkId: 3,
      ip: "194.59.156.71",
      port: 53,
      protocol: "udp",
      oid: "nse:dns-recursion",
    });
  });

  it("treats `host` as a null port", () => {
    const parsed = parseAlertSourceKey("gvm", "gvm:1:10.0.0.5:host:tcp:1.2.3");
    expect(parsed?.port).toBeNull();
  });

  it("returns null for port and ssh alerts", () => {
    expect(parseAlertSourceKey("port", "port:1:10.0.0.5:22:tcp:x")).toBeNull();
    expect(parseAlertSourceKey("ssh", "ssh:1:10.0.0.5:22:tcp:x")).toBeNull();
  });

  it("returns null for missing inputs or malformed keys", () => {
    expect(parseAlertSourceKey(null, "gvm:1:x:1:tcp:1.2.3")).toBeNull();
    expect(parseAlertSourceKey("gvm", null)).toBeNull();
    expect(parseAlertSourceKey("gvm", "")).toBeNull();
    expect(parseAlertSourceKey("gvm", "gvm:1:ip:22:tcp")).toBeNull();
    expect(parseAlertSourceKey("gvm", "gvm:abc:ip:22:tcp:oid")).toBeNull();
    expect(parseAlertSourceKey("gvm", "gvm:1:ip:22:tcp:")).toBeNull();
  });

  it("rejects a key whose leading token doesn't match the claimed source", () => {
    expect(parseAlertSourceKey("gvm", "nuclei:1:x:1:tcp:a")).toBeNull();
  });
});
