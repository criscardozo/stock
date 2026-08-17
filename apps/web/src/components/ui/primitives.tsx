'use client'

/**
 * The pieces the design repeats. Each one exists because it appears on three or
 * more screens with the same meaning — not because it could be abstracted.
 * Measurements come from docs/design/reference/, via docs/design/tokens.md.
 */
import type { ReactNode } from 'react'
import { hueClasses, initialOf } from '@/lib/design/palette'
import type { Level } from '@/lib/domain/types'
import { LEVEL_NAMES } from '@/lib/domain/quantities'

export function Icon({
  name,
  className = '',
  size = 19,
}: {
  name: string
  className?: string
  size?: number
}) {
  return (
    <span className={`ms ${className}`} style={{ fontSize: size }} aria-hidden="true">
      {name}
    </span>
  )
}

/** The 36 px tinted circle that carries a category (or a location). */
export function HueBadge({
  icon,
  hue,
  size = 36,
}: {
  icon: string
  hue: string | undefined
  size?: number
}) {
  const { fg, bg } = hueClasses(hue)
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full ${bg}`}
      style={{ width: size, height: size }}
    >
      <Icon name={icon} className={fg} size={Math.round(size * 0.53)} />
    </span>
  )
}

type ChipTone = 'danger' | 'danger-deep' | 'danger-quiet' | 'primary' | 'neutral'

const CHIP_TONES: Record<ChipTone, string> = {
  // Solid red is reserved for "out of stock": the loudest state gets the
  // loudest treatment, and nothing else does.
  danger: 'bg-danger text-white font-bold',
  'danger-deep': 'bg-danger-deep text-white font-bold',
  // Tinted, not solid: a recipe missing an ingredient is information, not an
  // alarm. Solid red stays reserved for out-of-stock and expired.
  'danger-quiet': 'bg-danger-soft text-danger-deep font-bold',
  primary: 'bg-primary-soft text-primary-deep font-bold',
  neutral: 'bg-neutral-soft text-ink-2 font-semibold',
}

export function Chip({
  icon,
  children,
  tone = 'neutral',
}: {
  icon?: string
  children: ReactNode
  tone?: ChipTone
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-[11px] py-1 text-xs ${CHIP_TONES[tone]}`}
    >
      {icon && <Icon name={icon} size={14} />}
      {children}
    </span>
  )
}

export function PillButton({
  icon,
  children,
  onClick,
  variant = 'ghost',
  type = 'button',
  disabled,
}: {
  icon?: string
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'ghost'
  type?: 'button' | 'submit'
  disabled?: boolean
}) {
  const styles =
    variant === 'primary'
      ? 'bg-primary text-white font-bold shadow-(--shadow-primary) px-[18px] py-2.5'
      : 'bg-surface text-ink-2 font-semibold border border-line px-[15px] py-2.5'
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-[7px] rounded-full text-sm disabled:opacity-40 ${styles}`}
    >
      {icon && <Icon name={icon} size={18} />}
      {children}
    </button>
  )
}

/**
 * The sunken stepper. `remove` greys out at zero — the cheapest possible way to
 * say "this doesn't go lower".
 */
export function Stepper({
  value,
  label,
  onChange,
  step = 1,
  size = 'sm',
}: {
  value: number
  label: string
  onChange: (next: number) => void
  step?: number
  size?: 'sm' | 'lg'
}) {
  const big = size === 'lg'
  const glyph = big ? 22 : 18
  const box = big ? 'h-[42px] w-[42px]' : 'h-[26px] w-[26px]'
  return (
    <div className={`flex shrink-0 items-center rounded-full bg-ground ${big ? 'p-1' : 'p-[3px]'}`}>
      <button
        type="button"
        aria-label="Restar"
        onClick={() => onChange(Math.max(0, value - step))}
        className={`grid place-items-center rounded-full ${box} ${
          value === 0 ? 'text-ink-4' : 'text-ink-2'
        }`}
      >
        <Icon name="remove" size={glyph} />
      </button>
      <span
        className={`tnum text-center font-bold ${big ? 'min-w-24 text-[22px]' : 'min-w-[52px] text-sm'}`}
      >
        {label}
      </span>
      <button
        type="button"
        aria-label="Sumar"
        onClick={() => onChange(value + step)}
        className={`grid place-items-center rounded-full text-ink-2 ${box}`}
      >
        <Icon name="add" size={glyph} />
      </button>
    </div>
  )
}

/** Four segments and a word. Never a number — that is the whole point of levels. */
export function LevelDial({
  level,
  onChange,
  showName = true,
}: {
  level: Level
  onChange?: (next: Level) => void
  showName?: boolean
}) {
  const segments = ([1, 2, 3, 4] as const).map((step) => step <= level)
  return (
    <div className="flex shrink-0 items-center gap-[9px]">
      <div className="flex gap-[3px]">
        {segments.map((filled, index) => {
          const target = (index + 1) as Level
          const className = `h-2 w-3.5 rounded-[3px] ${filled ? 'bg-primary' : 'bg-track'}`
          return onChange ? (
            <button
              key={index}
              type="button"
              aria-label={`Poner en ${LEVEL_NAMES[target]}`}
              // Clicking the segment you're already at means "one less" — the
              // only way to reach 'vacío' without a separate control.
              onClick={() => onChange(level === target ? ((target - 1) as Level) : target)}
              className={className}
            />
          ) : (
            <span key={index} className={className} />
          )
        })}
      </div>
      {showName && (
        <span className="w-[38px] text-xs font-semibold text-ink-2">{LEVEL_NAMES[level]}</span>
      )}
    </div>
  )
}

export function Avatar({
  name,
  colour,
  size = 22,
}: {
  name: string | undefined
  colour: string
  size?: number
}) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full font-bold text-white ${colour}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.47) }}
      title={name}
    >
      {initialOf(name)}
    </span>
  )
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span className="pl-1 text-[11px] font-bold tracking-[0.07em] text-ink-3 uppercase">
      {children}
    </span>
  )
}

/** The white card a grouped list sits in. */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-card border border-line bg-surface px-[18px] ${className}`}>
      {children}
    </div>
  )
}

export function Sheet({
  title,
  subtitle,
  icon,
  hue,
  onClose,
  children,
  footer,
}: {
  title: string
  subtitle?: ReactNode
  icon?: string
  hue?: string
  onClose: () => void
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/25 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="flex max-h-[86dvh] w-full max-w-[440px] flex-col gap-[15px] overflow-auto rounded-sheet bg-surface p-6 shadow-(--shadow-sheet)"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center gap-3">
          {icon && <HueBadge icon={icon} hue={hue ?? 'green'} size={42} />}
          <div className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="text-[19px] font-bold">{title}</span>
            {subtitle && <span className="text-xs text-ink-2">{subtitle}</span>}
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-ink-4">
            <Icon name="close" size={22} />
          </button>
        </header>
        {children}
        {footer}
      </div>
    </div>
  )
}

export function SheetField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-1 flex-col gap-[5px]">
      <span className="text-xs font-semibold text-ink-2">{label}</span>
      {children}
    </label>
  )
}

export function FieldInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`rounded-field bg-ground px-3.5 py-[11px] text-[14.5px] font-semibold ${props.className ?? ''}`}
    />
  )
}

export function PrimaryAction({
  icon,
  children,
  onClick,
  type = 'button',
  disabled,
}: {
  icon?: string
  children: ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
  disabled?: boolean
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-primary text-base font-bold text-white shadow-(--shadow-primary) disabled:opacity-40"
    >
      {icon && <Icon name={icon} size={20} />}
      {children}
    </button>
  )
}
