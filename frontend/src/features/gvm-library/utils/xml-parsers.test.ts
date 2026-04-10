import { describe, expect, it } from 'vitest'

import {
  countPorts,
  normalizeRanges,
  parsePortListXml,
  parseScanConfigXml,
  rangesToString,
  serializePortListXml,
  stringToRanges,
} from './xml-parsers'

describe('normalizeRanges', () => {
  it('sorts and merges overlapping/adjacent ranges', () => {
    const merged = normalizeRanges([
      { start: 10, end: 20 },
      { start: 15, end: 25 },
      { start: 26, end: 30 }, // adjacent to 25 → merges
      { start: 100, end: 200 },
    ])
    expect(merged).toEqual([
      { start: 10, end: 30 },
      { start: 100, end: 200 },
    ])
  })

  it('flips inverted ranges', () => {
    expect(normalizeRanges([{ start: 90, end: 80 }])).toEqual([
      { start: 80, end: 90 },
    ])
  })

  it('drops out-of-bounds ranges', () => {
    expect(
      normalizeRanges([
        { start: 0, end: 10 },
        { start: 65530, end: 70000 },
      ]),
    ).toEqual([])
  })
})

describe('stringToRanges', () => {
  it('parses comma-separated ports and ranges', () => {
    expect(stringToRanges('22,80, 443, 1000-1005')).toEqual([
      { start: 22, end: 22 },
      { start: 80, end: 80 },
      { start: 443, end: 443 },
      { start: 1000, end: 1005 },
    ])
  })

  it('merges overlapping input on normalize', () => {
    expect(stringToRanges('1-100,50-200')).toEqual([{ start: 1, end: 200 }])
  })

  it('rejects bad tokens', () => {
    expect(() => stringToRanges('abc')).toThrow(/Invalid/)
    expect(() => stringToRanges('100-50')).toThrow(/end < start/)
    expect(() => stringToRanges('70000')).toThrow(/out of range/)
  })

  it('handles whitespace and semicolons', () => {
    expect(stringToRanges('22 80;443')).toEqual([
      { start: 22, end: 22 },
      { start: 80, end: 80 },
      { start: 443, end: 443 },
    ])
  })
})

describe('rangesToString + countPorts', () => {
  it('round-trips', () => {
    const ranges = stringToRanges('22,80,1000-1005')
    expect(rangesToString(ranges)).toBe('22,80,1000-1005')
    expect(countPorts(ranges)).toBe(1 + 1 + 6)
  })
})

describe('parsePortListXml', () => {
  it('extracts TCP/UDP ranges', () => {
    const xml = `
      <get_port_lists_response status="200" status_text="OK">
        <port_list id="abc">
          <name>Test</name>
          <comment>desc</comment>
          <port_ranges>
            <port_range id="r1"><start>80</start><end>80</end><type>tcp</type></port_range>
            <port_range id="r2"><start>1000</start><end>2000</end><type>tcp</type></port_range>
            <port_range id="r3"><start>53</start><end>53</end><type>udp</type></port_range>
          </port_ranges>
        </port_list>
      </get_port_lists_response>
    `
    const parsed = parsePortListXml(xml)
    expect(parsed.name).toBe('Test')
    expect(parsed.comment).toBe('desc')
    expect(parsed.tcp).toEqual([
      { start: 80, end: 80 },
      { start: 1000, end: 2000 },
    ])
    expect(parsed.udp).toEqual([{ start: 53, end: 53 }])
  })

  it('rejects wrong root', () => {
    expect(() => parsePortListXml('<wrong/>')).toThrow(/Expected root/)
  })
})

describe('serializePortListXml → parsePortListXml round-trip', () => {
  it('preserves ranges and name', () => {
    const xml = serializePortListXml({
      name: 'My Ports',
      comment: 'hello & world',
      tcp: stringToRanges('22,80,443,1000-2000'),
      udp: stringToRanges('53,67-68'),
    })
    const parsed = parsePortListXml(xml)
    expect(parsed.name).toBe('My Ports')
    expect(parsed.comment).toBe('hello & world')
    expect(rangesToString(parsed.tcp)).toBe('22,80,443,1000-2000')
    expect(rangesToString(parsed.udp)).toBe('53,67-68')
  })

  it('rejects empty name', () => {
    expect(() =>
      serializePortListXml({ name: ' ', tcp: [], udp: [] }),
    ).toThrow(/name is required/)
  })
})

describe('parseScanConfigXml', () => {
  it('extracts config metadata and families', () => {
    const xml = `
      <get_configs_response status="200" status_text="OK">
        <config id="cfg-1">
          <name>Deep Scan</name>
          <comment>all the things</comment>
          <type>0</type>
          <usage_type>scan</usage_type>
          <family_count>3<growing>1</growing></family_count>
          <nvt_count>42<growing>0</growing></nvt_count>
          <families>
            <family>
              <name>Web Servers</name>
              <nvt_count>10</nvt_count>
              <max_nvt_count>15</max_nvt_count>
              <growing>1</growing>
            </family>
          </families>
          <preferences>
            <preference>
              <nvt oid="1.3.6.1"><name>Plugin X</name></nvt>
              <hr_name>Timeout</hr_name>
              <name>timeout</name>
              <type>entry</type>
              <value>30</value>
              <default>5</default>
            </preference>
          </preferences>
          <nvt_selectors>
            <nvt_selector>
              <name>sel-1</name>
              <include>1</include>
              <type>1</type>
              <family_or_nvt>Web Servers</family_or_nvt>
            </nvt_selector>
          </nvt_selectors>
        </config>
      </get_configs_response>
    `
    const parsed = parseScanConfigXml(xml)
    expect(parsed.name).toBe('Deep Scan')
    expect(parsed.comment).toBe('all the things')
    expect(parsed.family_count).toBe(3)
    expect(parsed.family_count_growing).toBe(true)
    expect(parsed.nvt_count).toBe(42)
    expect(parsed.nvt_count_growing).toBe(false)
    expect(parsed.families).toHaveLength(1)
    expect(parsed.families[0]).toMatchObject({
      name: 'Web Servers',
      nvt_count: 10,
      max_nvt_count: 15,
      growing: true,
    })
    expect(parsed.preferences).toHaveLength(1)
    expect(parsed.preferences[0]).toMatchObject({
      nvt_name: 'Plugin X',
      nvt_oid: '1.3.6.1',
      hr_name: 'Timeout',
      value: '30',
    })
    expect(parsed.nvt_selectors).toHaveLength(1)
    expect(parsed.nvt_selectors[0]).toMatchObject({
      include: true,
      type: 1,
      family_or_nvt: 'Web Servers',
    })
  })
})
