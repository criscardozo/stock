/**
 * The app mark: a paper bag with its zigzag top.
 *
 * This is the reduced version on purpose. The full mark has the shopping
 * sticking out — a baguette, an apple, a broccoli — but the design's own rule is
 * that at 32 px and under the produce falls away and the bag with its zigzag is
 * all that has to read. Every place this component is used is at or near that
 * size, so it draws the bag; `public/icons/` carries the full art for the sizes
 * that can hold it.
 *
 * The field carries the same top-to-bottom gradient as the installed icon, so
 * the mark in the header and the icon on the home screen are the same object.
 */
export function AppMark({ size = 34, radius = 11 }: { size?: number; radius?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center bg-linear-to-b from-mark-from to-mark-to"
      style={{ width: size, height: size, borderRadius: radius }}
    >
      <svg
        width={size * 0.68}
        height={size * 0.68}
        viewBox="12 24 40 36"
        aria-hidden="true"
        role="presentation"
      >
        <path
          d="M15 31.5 19.25 27.5 23.5 31.5 27.75 27.5 32 31.5 36.25 27.5 40.5 31.5 44.75 27.5 49 31.5V53q0 4-4 4H19q-4 0-4-4Z"
          fill="#FCFCF8"
        />
      </svg>
    </span>
  )
}
