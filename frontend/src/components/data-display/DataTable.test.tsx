import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ColumnDef } from '@tanstack/react-table'

import { DataTable } from './DataTable'

interface TestRow {
  id: number
  name: string
  value: number
}

const columns: ColumnDef<TestRow, unknown>[] = [
  { accessorKey: 'id', header: 'ID' },
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'value', header: 'Value' },
]

const data: TestRow[] = [
  { id: 1, name: 'Alpha', value: 100 },
  { id: 2, name: 'Beta', value: 200 },
  { id: 3, name: 'Gamma', value: 300 },
]

describe('DataTable', () => {
  it('renders column headers', () => {
    render(<DataTable data={data} columns={columns} />)
    expect(screen.getByText('ID')).toBeInTheDocument()
    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByText('Value')).toBeInTheDocument()
  })

  it('renders all rows', () => {
    render(<DataTable data={data} columns={columns} />)
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.getByText('Gamma')).toBeInTheDocument()
  })

  it('shows "No results." for empty data', () => {
    render(<DataTable data={[]} columns={columns} />)
    expect(screen.getByText('No results.')).toBeInTheDocument()
  })

  it('does not show pagination for small datasets', () => {
    render(<DataTable data={data} columns={columns} pageSize={50} />)
    expect(screen.queryByText('Previous')).not.toBeInTheDocument()
  })

  it('shows pagination when data exceeds page size', () => {
    const manyRows = Array.from({ length: 5 }, (_, i) => ({
      id: i,
      name: `Row ${i}`,
      value: i * 10,
    }))
    render(<DataTable data={manyRows} columns={columns} pageSize={2} />)
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument()
    expect(screen.getByText('Previous')).toBeInTheDocument()
    expect(screen.getByText('Next')).toBeInTheDocument()
  })

  it('navigates between pages', () => {
    const manyRows = Array.from({ length: 5 }, (_, i) => ({
      id: i,
      name: `Row ${i}`,
      value: i * 10,
    }))
    render(<DataTable data={manyRows} columns={columns} pageSize={2} />)

    expect(screen.getByText('Row 0')).toBeInTheDocument()
    expect(screen.getByText('Row 1')).toBeInTheDocument()
    expect(screen.queryByText('Row 2')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Next'))
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument()
    expect(screen.getByText('Row 2')).toBeInTheDocument()
  })
})
