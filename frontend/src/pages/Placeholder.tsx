import { Link } from 'react-router-dom'

type PlaceholderProps = {
  title: string
  description: string
  cta?: {
    label: string
    to: string
  }
}

const Placeholder = ({ title, description, cta }: PlaceholderProps) => {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-slate-200/70 bg-white/80 p-8 shadow-sm dark:border-slate-800/70 dark:bg-slate-950/70">
      <div className="pointer-events-none absolute -right-24 top-0 h-48 w-48 rounded-full bg-cyan-500/15 blur-[100px]" />
      <div className="pointer-events-none absolute -bottom-20 left-0 h-48 w-48 rounded-full bg-emerald-500/15 blur-[120px]" />
      <div className="relative z-10 space-y-3">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Coming soon</p>
        <h2 className="font-display text-3xl text-slate-900 dark:text-white">{title}</h2>
        <p className="max-w-xl text-sm text-slate-600 dark:text-slate-300">{description}</p>
        {cta ? (
          <Link
            to={cta.to}
            className="mt-4 inline-flex items-center rounded-full border border-slate-200/70 bg-white/70 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-white dark:border-slate-800/70 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:border-slate-700"
          >
            {cta.label}
          </Link>
        ) : null}
      </div>
    </section>
  )
}

export default Placeholder
