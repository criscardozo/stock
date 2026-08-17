/**
 * Seed data names a hue ("olive"), never a colour. This is the one place a hue
 * turns into classes — and the class strings are literal so Tailwind's scanner
 * can actually see them (`bg-hue-${hue}-soft` would compile to nothing).
 */
export type Hue =
  | 'olive'
  | 'wine'
  | 'blue'
  | 'amber'
  | 'violet'
  | 'teal'
  | 'magenta'
  | 'brown'
  | 'green'

interface HueClasses {
  fg: string
  bg: string
}

export const HUES: Record<Hue, HueClasses> = {
  olive: { fg: 'text-hue-olive', bg: 'bg-hue-olive-soft' },
  wine: { fg: 'text-hue-wine', bg: 'bg-hue-wine-soft' },
  blue: { fg: 'text-hue-blue', bg: 'bg-hue-blue-soft' },
  amber: { fg: 'text-hue-amber', bg: 'bg-hue-amber-soft' },
  violet: { fg: 'text-hue-violet', bg: 'bg-hue-violet-soft' },
  teal: { fg: 'text-hue-teal', bg: 'bg-hue-teal-soft' },
  magenta: { fg: 'text-hue-magenta', bg: 'bg-hue-magenta-soft' },
  brown: { fg: 'text-hue-brown', bg: 'bg-hue-brown-soft' },
  green: { fg: 'text-hue-green', bg: 'bg-hue-green-soft' },
}

export function hueClasses(hue: string | undefined): HueClasses {
  return HUES[(hue ?? 'violet') as Hue] ?? HUES.violet
}

/** Members are told apart by colour everywhere: avatar, "lo agregó", history. */
export function memberColour(uid: string, memberIds: string[]): string {
  return memberIds.indexOf(uid) === 1 ? 'bg-member-b' : 'bg-member-a'
}

export function initialOf(name: string | undefined): string {
  return (name ?? '?').trim().charAt(0).toUpperCase() || '?'
}
