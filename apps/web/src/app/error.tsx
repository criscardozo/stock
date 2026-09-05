'use client'

import { useEffect } from 'react'
import { AppMark } from '@/components/AppMark'

/**
 * A render that threw.
 *
 * Next ships a default for this, and it is a stack trace in English on a white
 * page — for a household app whose entire UI is in Spanish, that reads as
 * somebody else's error, not as this app having a bad moment.
 *
 * It does NOT swallow the error. Nothing else in the app would report it, and
 * an error boundary that only prints a friendly sentence is how a crash becomes
 * invisible to the one person who could fix it.
 */
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error('Render error', error)
  }, [error])

  return (
    <div className="grid min-h-dvh place-items-center bg-ground px-8">
      <div className="flex max-w-sm flex-col items-center gap-5 text-center">
        <AppMark size={56} radius={18} />
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-bold tracking-[-0.02em]">Se rompió algo</h1>
          <p className="text-sm leading-relaxed text-ink-2">
            La pantalla no se pudo dibujar. Los datos están a salvo — esto pasó acá, en el
            teléfono, no en el servidor.
          </p>
        </div>
        <button
          onClick={reset}
          className="rounded-full bg-primary px-6 py-3 text-sm font-bold text-on-primary shadow-(--shadow-primary)"
        >
          Reintentar
        </button>
      </div>
    </div>
  )
}
