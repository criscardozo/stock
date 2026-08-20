/**
 * The app mark: a paper bag with the shopping sticking out of it — a baguette,
 * an apple, a broccoli.
 *
 * The design's rule is a threshold, not a preference: "a 32 px y menos se caen
 * los productos — ahí queda la bolsa con su zigzag, que alcanza". So this draws
 * the full mark above 32 and the reduced bag at 32 and under, which is why the
 * favicon looks different from the installed icon on purpose and the header does
 * not.
 *
 * Above the threshold the drawing comes from the same source art the app icons
 * are built from, as a MASK rather than finished art: the field is a gradient
 * that inverts with the appearance, so a finished PNG would freeze one
 * appearance into a binary. The mask carries geometry, CSS carries colour. The
 * source is laid out on the icon's own canvas, so at `mask-size: contain` the
 * bag lands exactly where it does on the home screen.
 *
 * Below it, the bag is inline SVG — at 16 px a network request for eleven
 * points would be silly.
 */
export function AppMark({ size = 34, radius = 11 }: { size?: number; radius?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center bg-linear-to-b from-mark-from to-mark-to"
      style={{ width: size, height: size, borderRadius: radius }}
    >
      {size > 32 ? (
        <span
          aria-hidden="true"
          className="bg-mark-glyph"
          style={{
            width: size,
            height: size,
            maskImage: 'url(/icons/mark-glyph-256.png)',
            WebkitMaskImage: 'url(/icons/mark-glyph-256.png)',
            maskSize: 'contain',
            WebkitMaskSize: 'contain',
            maskRepeat: 'no-repeat',
            WebkitMaskRepeat: 'no-repeat',
          }}
        />
      ) : (
        <svg
          width={size * 0.68}
          height={size * 0.68}
          viewBox="12 24 40 36"
          aria-hidden="true"
          role="presentation"
        >
          <path
            d="M15 31.5 19.25 27.5 23.5 31.5 27.75 27.5 32 31.5 36.25 27.5 40.5 31.5 44.75 27.5 49 31.5V53q0 4-4 4H19q-4 0-4-4Z"
            fill="var(--color-mark-glyph)"
          />
        </svg>
      )}
    </span>
  )
}
