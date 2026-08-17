import type { Metadata, Viewport } from 'next'
import { Outfit } from 'next/font/google'
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
  // A fixed-height shell: zooming only breaks the layout, and an accidental
  // double-tap zoom while ticking things off in a supermarket is pure friction.
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" className={outfit.variable}>
      <head>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/*
          Material Symbols is not in next/font's catalogue, so it comes over the
          wire. Both lint rules below are knowingly overridden:
          - `display=block` on purpose — a ligature font that swaps renders the
            literal word "inventory_2" until it lands, which is worse than a
            beat of blank.
          - the no-page-custom-font rule is about the Pages Router; this is the
            App Router's ROOT layout, so it is global by definition.
        */}
        {/* eslint-disable-next-line @next/next/google-font-display, @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,400..600,1,0&display=block"
          rel="stylesheet"
        />
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
