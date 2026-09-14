import type { Metadata, Viewport } from 'next'
import { Outfit } from 'next/font/google'
import { materialSymbolsHref } from '@/lib/design/icons'
import './globals.css'
import { AppShell } from '@/components/AppShell'
import { ServiceWorker } from '@/components/ServiceWorker'

// Self-hosted through next/font so the type doesn't depend on Google being up.
const outfit = Outfit({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-outfit',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Stock',
  description: 'Qué hay en casa, qué falta comprar y qué se cocina esta quincena.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Stock', statusBarStyle: 'default' },
  icons: {
    icon: [
      { url: '/icons/favicon.svg', type: 'image/svg+xml' },
      { url: '/icons/favicon-32.png', sizes: '32x32' },
    ],
    apple: '/icons/apple-touch-icon-180.png',
  },
}

export const viewport: Viewport = {
  // One per scheme, so the browser chrome matches the theme in use. theme.ts
  // overwrites both when a theme is forced.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#2E9E5B' },
    { media: '(prefers-color-scheme: dark)', color: '#141813' },
  ],
  // Extend under the notch and the home indicator; every edge the content must
  // avoid is then handled explicitly with env(safe-area-inset-*).
  viewportFit: 'cover',
  // No `maximumScale`. It used to be 1, to stop an accidental double-tap zoom
  // while ticking things off in a supermarket — a real annoyance, but the price
  // was pinch-zoom, for everyone, including the people who most need it in a
  // badly lit aisle. It is the one accessibility failure Lighthouse reports on
  // /stock: 93 with it.
  //
  // The double tap is handled where it belongs instead: `touch-action:
  // manipulation` in globals.css turns off double-tap-to-zoom on the controls
  // without touching pinch.
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" className={outfit.variable}>
      <head>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/*
          Material Symbols is not in next/font's catalogue, so it comes over the
          wire — subsetted to the glyphs this app renders. The list, the two
          measured sizes and what happens when the list is incomplete are all in
          lib/design/icons.ts; repeating the figure here would be a second copy
          of a number that moves every time the list does.
        
          This used to carry an eslint-disable for `google-font-display` and
          `no-page-custom-font`, and it is gone because neither rule fires any
          more. Not because they stopped applying — because they only read a
          LITERAL href. Extracting the URL into `materialSymbolsHref()` blinded
          both: put the string back inline and both warn again, which is how this
          was checked rather than assumed.

          Worth knowing which direction that cuts. `display=block` is still
          required and lint cannot see whether it is there; `icons.test.ts` is
          what holds it. And a suppression that suppresses nothing is worse than
          none — it reads as "these rules are known to be wrong here", which is
          not what was measured.
        */}
        <link href={materialSymbolsHref()} rel="stylesheet" />
      </head>
      <body className="min-h-dvh bg-ground font-sans text-ink antialiased">
        {/*
          Apply the stored theme BEFORE first paint — a blocking script as the
          first body node — so a forced light/dark never flashes the system one.
          The key must match THEME_STORAGE_KEY.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              '(function(){try{var t=localStorage.getItem("stock:theme");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t);}catch(e){}})();',
          }}
        />
        <AppShell>{children}</AppShell>
        <ServiceWorker />
      </body>
    </html>
  )
}
