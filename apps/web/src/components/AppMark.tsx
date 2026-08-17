/**
 * The app mark: a container with its fill level — the whole product in one
 * glyph. Taken from the design's SVG, not redrawn.
 */
export function AppMark({ size = 34, radius = 11 }: { size?: number; radius?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center bg-primary"
      style={{ width: size, height: size, borderRadius: radius }}
    >
      <svg
        width={size * 0.65}
        height={size * 0.65}
        viewBox="0 0 64 64"
        aria-hidden="true"
        role="presentation"
      >
        <rect x="23" y="9" width="18" height="7" rx="3.5" fill="#FCFCF8" />
        <rect
          x="16.5"
          y="18.5"
          width="31"
          height="36"
          rx="7"
          fill="none"
          stroke="#FCFCF8"
          strokeWidth="4"
        />
        <path
          d="M18.5 34h27v18a4.5 4.5 0 0 1-4.5 4.5H23a4.5 4.5 0 0 1-4.5-4.5z"
          fill="#FCFCF8"
        />
      </svg>
    </span>
  )
}
