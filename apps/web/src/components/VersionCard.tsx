'use client'

/**
 * Which build is actually running.
 *
 * Worth its own card because this app deploys on every push and lives on a
 * phone as an installed PWA: "did my change land, or am I looking at a cached
 * shell?" is otherwise unanswerable from the device. The values are stamped at
 * build time in next.config.ts.
 */
const formatter = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

export function VersionCard() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? ''
  const sha = process.env.NEXT_PUBLIC_BUILD_SHA ?? ''
  const isoDate = process.env.NEXT_PUBLIC_BUILD_DATE ?? ''

  const built = isoDate !== '' ? new Date(isoDate) : null
  const updated =
    built !== null && !Number.isNaN(built.getTime()) ? formatter.format(built) : 'desconocida'

  return (
    <div className="flex items-center justify-between gap-3 rounded-panel border border-line bg-surface px-[18px] py-3.5">
      <div className="flex flex-col gap-0.5">
        <span className="section-label">Versión</span>
        <span className="tnum text-[13.5px] font-bold">
          {version !== '' ? `v${version}` : 'desconocida'}
          {sha !== '' && <span className="ml-1.5 font-semibold text-ink-3">{sha}</span>}
        </span>
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <span className="section-label">Actualizada</span>
        <span className="tnum text-[13.5px] font-semibold text-ink-2">{updated}</span>
      </div>
    </div>
  )
}
