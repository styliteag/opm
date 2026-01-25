import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTheme, type ThemePreference } from '../context/ThemeContext'

type ThemeOption = {
  value: ThemePreference
  label: string
  description: string
  icon: ReactNode
}

const SunIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </svg>
)

const MoonIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
  </svg>
)

const SystemIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 20h8M12 16v4" />
  </svg>
)

const themeOptions: ThemeOption[] = [
  {
    value: 'light',
    label: 'Light',
    description: 'Bright background',
    icon: <SunIcon className="h-4 w-4" />,
  },
  {
    value: 'dark',
    label: 'Dark',
    description: 'Low-light interface',
    icon: <MoonIcon className="h-4 w-4" />,
  },
  {
    value: 'system',
    label: 'System',
    description: 'Match device',
    icon: <SystemIcon className="h-4 w-4" />,
  },
]

const ThemeSwitcher = () => {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const { updateThemePreference } = useAuth()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const activeTheme = themeOptions.find((option) => option.value === theme)
  const activeIcon =
    theme === 'system'
      ? resolvedTheme === 'dark'
        ? themeOptions[1].icon
        : themeOptions[0].icon
      : activeTheme?.icon

  useEffect(() => {
    if (!open) {
      return
    }

    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const handleSelect = (nextTheme: ThemePreference) => {
    setTheme(nextTheme)
    setOpen(false)
    void updateThemePreference(nextTheme).catch(() => {})
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold tracking-wide text-slate-600 transition hover:border-slate-300 hover:text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:text-slate-100"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="text-slate-500 dark:text-slate-400">{activeIcon}</span>
        <span>{activeTheme?.label ?? 'Theme'}</span>
      </button>
      {open ? (
        <div
          className="absolute right-0 z-50 mt-3 w-48 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-xl backdrop-blur dark:border-slate-800 dark:bg-slate-950/95"
          role="listbox"
        >
          <p className="px-3 py-2 text-xs font-semibold text-slate-400 dark:text-slate-500">
            Theme
          </p>
          <div className="space-y-1">
            {themeOptions.map((option) => {
              const isActive = option.value === theme
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleSelect(option.value)}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
                    isActive
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900'
                  }`}
                  role="option"
                  aria-selected={isActive}
                >
                  <span className="flex items-center gap-2">
                    {option.icon}
                    <span className="font-semibold">{option.label}</span>
                  </span>
                  <span
                    className={`text-xs ${
                      isActive ? 'text-white/80 dark:text-slate-700' : 'text-slate-400'
                    }`}
                  >
                    {option.description}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default ThemeSwitcher
