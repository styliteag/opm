/** Extract protocol prefix from a script name (e.g. "smb" from "smb-vuln-ms17-010"). */
export function getProtocol(name: string): string {
  const idx = name.indexOf("-");
  return idx > 0 ? name.slice(0, idx) : "*";
}
