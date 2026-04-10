/**
 * XML parsers and serializers for GVM scan configs and port lists.
 *
 * All parsing is done client-side with DOMParser. The raw XML is fetched
 * via `/api/gvm/library/{id}/xml`. Serialization is only needed for port
 * lists (scan configs are read-only in the UI).
 */

// ---- Scan config ------------------------------------------------------

export interface ScanConfigFamily {
  name: string
  nvt_count: number
  max_nvt_count: number
  growing: boolean
}

export interface ScanConfigPreference {
  nvt_name: string | null
  nvt_oid: string | null
  hr_name: string
  name: string
  type: string
  value: string
  default: string | null
}

export interface ScanConfigNvtSelector {
  name: string | null
  include: boolean
  type: number
  family_or_nvt: string | null
}

export interface ParsedScanConfig {
  id: string | null
  name: string
  comment: string
  type: string | null
  usage_type: string | null
  family_count: number | null
  family_count_growing: boolean
  nvt_count: number | null
  nvt_count_growing: boolean
  families: ScanConfigFamily[]
  preferences: ScanConfigPreference[]
  nvt_selectors: ScanConfigNvtSelector[]
}

function text(el: Element | null): string {
  return (el?.textContent ?? '').trim()
}

function num(el: Element | null): number | null {
  const raw = text(el).replace(/[^0-9-]/g, '')
  if (!raw) return null
  const n = Number.parseInt(raw, 10)
  return Number.isNaN(n) ? null : n
}

function bool(el: Element | null): boolean {
  return text(el) === '1'
}

export function parseScanConfigXml(xml: string): ParsedScanConfig {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const parseError = doc.querySelector('parsererror')
  if (parseError) {
    throw new Error(`Invalid XML: ${parseError.textContent ?? 'parse error'}`)
  }

  const root = doc.documentElement
  if (root.tagName !== 'get_configs_response') {
    throw new Error(
      `Expected root <get_configs_response>, got <${root.tagName}>`,
    )
  }

  const config = root.querySelector(':scope > config')
  if (!config) throw new Error('Missing <config> element')

  // family_count / nvt_count have a nested <growing> child. Direct text
  // is the number, growing flag is the child.
  const familyCountEl = config.querySelector(':scope > family_count')
  const nvtCountEl = config.querySelector(':scope > nvt_count')

  const families: ScanConfigFamily[] = Array.from(
    config.querySelectorAll(':scope > families > family'),
  ).map((f) => ({
    name: text(f.querySelector(':scope > name')),
    nvt_count: num(f.querySelector(':scope > nvt_count')) ?? 0,
    max_nvt_count: num(f.querySelector(':scope > max_nvt_count')) ?? 0,
    growing: bool(f.querySelector(':scope > growing')),
  }))

  const preferences: ScanConfigPreference[] = Array.from(
    config.querySelectorAll(':scope > preferences > preference'),
  ).map((p) => {
    const nvt = p.querySelector(':scope > nvt')
    return {
      nvt_name: text(nvt?.querySelector(':scope > name') ?? null) || null,
      nvt_oid: nvt?.getAttribute('oid') || null,
      hr_name: text(p.querySelector(':scope > hr_name')),
      name: text(p.querySelector(':scope > name')),
      type: text(p.querySelector(':scope > type')),
      value: text(p.querySelector(':scope > value')),
      default: text(p.querySelector(':scope > default')) || null,
    }
  })

  const nvt_selectors: ScanConfigNvtSelector[] = Array.from(
    config.querySelectorAll(':scope > nvt_selectors > nvt_selector'),
  ).map((s) => ({
    name: text(s.querySelector(':scope > name')) || null,
    include: bool(s.querySelector(':scope > include')),
    type: num(s.querySelector(':scope > type')) ?? 0,
    family_or_nvt: text(s.querySelector(':scope > family_or_nvt')) || null,
  }))

  return {
    id: config.getAttribute('id'),
    name: text(config.querySelector(':scope > name')),
    comment: text(config.querySelector(':scope > comment')),
    type: text(config.querySelector(':scope > type')) || null,
    usage_type: text(config.querySelector(':scope > usage_type')) || null,
    family_count: familyCountEl
      ? Number.parseInt(
          (familyCountEl.firstChild?.nodeValue ?? '').trim() || '0',
          10,
        ) || null
      : null,
    family_count_growing: bool(
      familyCountEl?.querySelector(':scope > growing') ?? null,
    ),
    nvt_count: nvtCountEl
      ? Number.parseInt(
          (nvtCountEl.firstChild?.nodeValue ?? '').trim() || '0',
          10,
        ) || null
      : null,
    nvt_count_growing: bool(nvtCountEl?.querySelector(':scope > growing') ?? null),
    families,
    preferences,
    nvt_selectors,
  }
}

// ---- Port list --------------------------------------------------------

export interface PortRange {
  start: number
  end: number
}

export interface ParsedPortList {
  id: string | null
  name: string
  comment: string
  tcp: PortRange[]
  udp: PortRange[]
}

export function parsePortListXml(xml: string): ParsedPortList {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const parseError = doc.querySelector('parsererror')
  if (parseError) {
    throw new Error(`Invalid XML: ${parseError.textContent ?? 'parse error'}`)
  }

  const root = doc.documentElement
  if (root.tagName !== 'get_port_lists_response') {
    throw new Error(
      `Expected root <get_port_lists_response>, got <${root.tagName}>`,
    )
  }

  const list = root.querySelector(':scope > port_list')
  if (!list) throw new Error('Missing <port_list> element')

  const tcp: PortRange[] = []
  const udp: PortRange[] = []

  for (const r of Array.from(
    list.querySelectorAll(':scope > port_ranges > port_range'),
  )) {
    const start = num(r.querySelector(':scope > start'))
    const end = num(r.querySelector(':scope > end')) ?? start
    const type = text(r.querySelector(':scope > type')).toLowerCase()
    if (start === null || end === null) continue
    const range: PortRange = { start, end }
    if (type === 'tcp') tcp.push(range)
    else if (type === 'udp') udp.push(range)
  }

  return {
    id: list.getAttribute('id'),
    name: text(list.querySelector(':scope > name')),
    comment: text(list.querySelector(':scope > comment')),
    tcp: normalizeRanges(tcp),
    udp: normalizeRanges(udp),
  }
}

// ---- Port range helpers ----------------------------------------------

/**
 * Sort ranges and merge overlapping/adjacent ones. Returns a new array.
 */
export function normalizeRanges(ranges: PortRange[]): PortRange[] {
  if (ranges.length === 0) return []

  const cleaned = ranges
    .map((r) => ({
      start: Math.min(r.start, r.end),
      end: Math.max(r.start, r.end),
    }))
    .filter((r) => r.start >= 1 && r.end <= 65535)
    .sort((a, b) => a.start - b.start)

  const out: PortRange[] = []
  for (const r of cleaned) {
    const last = out[out.length - 1]
    if (last && r.start <= last.end + 1) {
      last.end = Math.max(last.end, r.end)
    } else {
      out.push({ ...r })
    }
  }
  return out
}

/**
 * Serialize a list of port ranges into the human form used by the editor:
 * `22,80,443,1000-2000`. Single-port ranges are rendered as just the port.
 */
export function rangesToString(ranges: PortRange[]): string {
  return normalizeRanges(ranges)
    .map((r) => (r.start === r.end ? String(r.start) : `${r.start}-${r.end}`))
    .join(',')
}

/**
 * Parse a human-typed range string into structured ranges. Accepts
 * comma/whitespace/semicolon separators. Invalid tokens throw with a
 * message identifying the offending chunk.
 */
export function stringToRanges(input: string): PortRange[] {
  const tokens = input
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean)

  const out: PortRange[] = []
  for (const token of tokens) {
    const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(token)
    if (!m) {
      throw new Error(`Invalid port token: "${token}"`)
    }
    const start = Number.parseInt(m[1], 10)
    const end = m[2] ? Number.parseInt(m[2], 10) : start
    if (start < 1 || start > 65535 || end < 1 || end > 65535) {
      throw new Error(`Port out of range 1-65535: "${token}"`)
    }
    if (end < start) {
      throw new Error(`Range end < start: "${token}"`)
    }
    out.push({ start, end })
  }
  return normalizeRanges(out)
}

export function countPorts(ranges: PortRange[]): number {
  return ranges.reduce((acc, r) => acc + (r.end - r.start + 1), 0)
}

// ---- Serializer -------------------------------------------------------

const XML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
}

function xmlEscape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => XML_ENTITIES[c] ?? c)
}

export interface SerializePortListInput {
  name: string
  comment?: string
  tcp: PortRange[]
  udp: PortRange[]
}

/**
 * Serialize a port list back into the GVM `<get_port_lists_response>`
 * envelope the upload endpoint expects. UUIDs are synthesized — the
 * backend only cares about root tag, inner <name>, and the validity of
 * the XML (it stores the blob as-is and re-serves it).
 */
export function serializePortListXml(input: SerializePortListInput): string {
  const name = input.name.trim()
  if (!name) throw new Error('Port list name is required')
  const comment = input.comment ?? ''
  const tcp = normalizeRanges(input.tcp)
  const udp = normalizeRanges(input.udp)
  const total = tcp.length + udp.length
  const tcpPorts = countPorts(tcp)
  const udpPorts = countPorts(udp)

  const listUuid = pseudoUuid()

  const rangeXml = (range: PortRange, type: 'tcp' | 'udp') =>
    `    <port_range id="${pseudoUuid()}">` +
    `<start>${range.start}</start>` +
    `<end>${range.end}</end>` +
    `<type>${type}</type>` +
    `<comment/>` +
    `</port_range>`

  const rangeLines = [
    ...tcp.map((r) => rangeXml(r, 'tcp')),
    ...udp.map((r) => rangeXml(r, 'udp')),
  ].join('\n')

  return `<get_port_lists_response status="200" status_text="OK">
  <port_list id="${listUuid}">
    <name>${xmlEscape(name)}</name>
    <comment>${xmlEscape(comment)}</comment>
    <in_use>0</in_use>
    <writable>1</writable>
    <port_count>
      <all>${total}</all>
      <tcp>${tcpPorts}</tcp>
      <udp>${udpPorts}</udp>
    </port_count>
    <port_ranges>
${rangeLines}
    </port_ranges>
  </port_list>
</get_port_lists_response>
`
}

function pseudoUuid(): string {
  // Non-cryptographic UUID-ish string; GVM imports accept any well-formed
  // id string (it re-assigns its own on import). Using Math.random keeps
  // this dependency-free.
  const hex = (n: number) =>
    Math.floor(Math.random() * 0x10 ** n)
      .toString(16)
      .padStart(n, '0')
  return `${hex(8)}-${hex(4)}-${hex(4)}-${hex(4)}-${hex(8)}${hex(4)}`
}
