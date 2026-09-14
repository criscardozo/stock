/**
 * Every Material Symbols glyph this app renders, and the subsetted URL built
 * from them.
 *
 * The font is not in next/font's catalogue, so it comes over the wire from
 * Google. Unsubsetted it is 2,616 KB — measured, not quoted — for an app that
 * uses 65 glyphs and has to cold-start offline on a phone. Asking for exactly
 * these brings it to 48 KB — the same font, the same glyphs, 98% less.
 *
 * The list has to be complete or the failure is silent and visual: Material
 * Symbols renders by ligature, so a glyph that was not subsetted in shows up as
 * the literal word `remove_shopping_cart` in the middle of the screen. Nothing
 * throws. `icons.test.ts` sweeps the components and the shared taxonomies and
 * refuses to let the two drift.
 */
export const ICON_NAMES = [
  'ac_unit',
  'add',
  'add_circle',
  'arrow_downward',
  'arrow_forward',
  'bakery_dining',
  'bolt',
  'calendar_month',
  'check',
  'check_circle',
  'chevron_left',
  'chevron_right',
  'cleaning_services',
  'close',
  'cloud_done',
  'cloud_off',
  'coffee',
  'content_copy',
  'cookie',
  'dangerous',
  'delete',
  'delete_sweep',
  'dry',
  'edit',
  'egg',
  'error',
  'event_available',
  'filter_alt_off',
  'grocery',
  'group',
  'help',
  'inventory_2',
  'kebab_dining',
  'keyboard_arrow_down',
  'keyboard_arrow_up',
  'kitchen',
  'link',
  'link_off',
  'local_bar',
  'local_dining',
  'local_laundry_service',
  'login',
  'logout',
  'menu_book',
  'notifications_off',
  'nutrition',
  'person_add',
  'receipt_long',
  'remove',
  'remove_shopping_cart',
  'restart_alt',
  'restaurant',
  'schedule',
  'search',
  'set_meal',
  'settings',
  'shelves',
  'shopping_basket',
  'shopping_cart',
  'shower',
  'soap',
  'text_fields',
  'tune',
  'upload_file',
  'wifi_off',
] as const

/** Google's CSS endpoint, asking for these glyphs and no others. */
export function materialSymbolsHref(): string {
  const axes = 'opsz,wght,FILL,GRAD@20..48,400..600,1,0'
  // `display=block` on purpose: a ligature font that swaps renders the literal
  // word until it lands, which is worse than a beat of blank.
  return (
    'https://fonts.googleapis.com/css2' +
    `?family=Material+Symbols+Rounded:${axes}` +
    `&icon_names=${ICON_NAMES.join(',')}` +
    '&display=block'
  )
}
