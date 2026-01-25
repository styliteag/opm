import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import ThemeSwitcher from './components/ThemeSwitcher'

function App() {
  const { user, logout } = useAuth()
  const navItems = [
    { label: 'Dashboard', to: '/', end: true },
    { label: 'Scanners', to: '/scanners' },
    { label: 'Networks', to: '/networks' },
    { label: 'Scans', to: '/scans' },
    { label: 'Risk Overview', to: '/risk-overview' },
    { label: 'Policy', to: '/policy' },
    ...(user?.role === 'admin' ? [{ label: 'Users', to: '/users' }] : []),
  ]

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="relative z-20 border-b border-slate-200 bg-white/70 backdrop-blur dark:border-slate-800 dark:bg-slate-950/70">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-6 py-5 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-3">
            <div>
              <h1 className="font-display text-xl text-slate-900 dark:text-white">
                Open Port Monitor
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Security scanning and alerting dashboard
              </p>
            </div>
            <nav className="flex flex-wrap gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `rounded-full border px-3 py-1 transition ${isActive
                      ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                      : 'border-slate-200/70 bg-white/60 text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:border-slate-800/70 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:border-slate-700'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          {user ? (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <ThemeSwitcher />
              <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold tracking-wide text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                {user.role}
              </div>
              <div className="flex flex-col text-right">
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {user.email}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">Signed in</span>
              </div>
              <button
                type="button"
                onClick={() => void logout()}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold tracking-wide text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-200 dark:hover:border-slate-700 dark:hover:bg-slate-900"
              >
                Logout
              </button>
            </div>
          ) : null}
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] px-6 py-10">
        <Outlet />
      </main>
    </div>
  )
}

export default App
