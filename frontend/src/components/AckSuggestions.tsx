import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { fetchJson } from '../lib/api'
import type { AckSuggestionsResponse } from '../types'

type Props = {
  port: number | null
  value: string
  onChange: (value: string) => void
  onEnter?: () => void
  onEscape?: () => void
  placeholder?: string
  autoFocus?: boolean
  className?: string
}

export default function AckSuggestions({
  port,
  value,
  onChange,
  onEnter,
  onEscape,
  placeholder,
  autoFocus,
  className,
}: Props) {
  const { token } = useAuth()
  const [open, setOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const portParam = port != null ? `&port=${port}` : ''
  const { data } = useQuery({
    queryKey: ['ack-suggestions', port],
    queryFn: () =>
      fetchJson<AckSuggestionsResponse>(
        `/api/alerts/ack-suggestions?limit=20${portParam}`,
        token ?? ''
      ),
    staleTime: 30_000,
    enabled: !!token,
  })

  const suggestions = data?.suggestions ?? []

  // Client-side substring filter
  const filtered = value.trim()
    ? suggestions.filter((s) =>
        s.reason.toLowerCase().includes(value.toLowerCase())
      )
    : suggestions

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Reset highlight when filtered list changes
  useEffect(() => {
    setHighlightIndex(-1)
  }, [value])

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightIndex >= 0 && listRef.current) {
      const items = listRef.current.children
      if (items[highlightIndex]) {
        (items[highlightIndex] as HTMLElement).scrollIntoView({ block: 'nearest' })
      }
    }
  }, [highlightIndex])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || filtered.length === 0) {
      if (e.key === 'ArrowDown' && filtered.length > 0) {
        e.preventDefault()
        setOpen(true)
        setHighlightIndex(0)
        return
      }
      if (e.key === 'Enter') {
        onEnter?.()
        return
      }
      if (e.key === 'Escape') {
        onEscape?.()
        return
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightIndex((i) => (i < filtered.length - 1 ? i + 1 : 0))
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightIndex((i) => (i > 0 ? i - 1 : filtered.length - 1))
        break
      case 'Enter':
        e.preventDefault()
        if (highlightIndex >= 0 && highlightIndex < filtered.length) {
          onChange(filtered[highlightIndex].reason)
          setOpen(false)
        } else {
          onEnter?.()
        }
        break
      case 'Escape':
        e.preventDefault()
        setOpen(false)
        setHighlightIndex(-1)
        break
    }
  }

  const handleSelect = (reason: string) => {
    onChange(reason)
    setOpen(false)
    inputRef.current?.focus()
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          if (!open && e.target.value.length === 0 && suggestions.length > 0) {
            setOpen(true)
          } else if (!open && suggestions.length > 0) {
            setOpen(true)
          }
        }}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true)
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={className}
      />

      {open && filtered.length > 0 && (
        <ul
          ref={listRef}
          className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          {filtered.map((s, i) => (
            <li
              key={s.reason}
              onMouseDown={(e) => {
                e.preventDefault()
                handleSelect(s.reason)
              }}
              onMouseEnter={() => setHighlightIndex(i)}
              className={`flex items-center justify-between px-3 py-2 text-sm cursor-pointer transition-colors ${
                i === highlightIndex
                  ? 'bg-indigo-50 dark:bg-indigo-500/10'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <span className="truncate text-slate-800 dark:text-slate-200">
                {s.reason}
              </span>
              <span className="ml-2 flex shrink-0 items-center gap-1.5">
                {s.same_port && (
                  <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
                    port match
                  </span>
                )}
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  {s.frequency}x
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
