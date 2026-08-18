'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/firebase/auth'
import { AppMark } from './AppMark'
import { Icon, PrimaryAction } from './ui/primitives'

export function LoginScreen() {
  const { signIn, devSignIn } = useAuth()
  const [error, setError] = useState<string | null>(null)

  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="flex w-full max-w-[420px] flex-col gap-7">
        <header className="flex flex-col gap-3">
          <AppMark size={52} radius={17} />
          <h1 className="text-[30px] leading-tight font-bold tracking-[-0.02em]">Stock</h1>
          <p className="text-[15px] font-semibold text-ink-2">
            Qué hay en casa, qué falta, qué se cocina.
          </p>
          <p className="text-sm leading-relaxed text-ink-3">
            El inventario de la casa y el plan de comidas de la quincena, compartidos entre los dos,
            en tiempo real.
          </p>
        </header>

        <PrimaryAction
          icon="login"
          onClick={async () => {
            setError(null)
            try {
              await signIn()
            } catch (e) {
              setError(e instanceof Error ? e.message : 'No se pudo entrar')
            }
          }}
        >
          Continuar con Google
        </PrimaryAction>

        {error && (
          <p className="flex items-center gap-2 text-sm text-danger-deep">
            <Icon name="error" size={18} />
            {error}
          </p>
        )}

        {devSignIn && (
          <div className="flex flex-wrap gap-2 rounded-panel border border-dashed border-line-strong p-3">
            <span className="w-full text-[11px] font-bold tracking-[0.07em] text-ink-3 uppercase">
              Emulador
            </span>
            {['cristian@example.com', 'meli@example.com'].map((email) => (
              <button
                key={email}
                onClick={() => void devSignIn(email).catch((e) => setError(String(e)))}
                className="rounded-full border border-line bg-surface px-3.5 py-2 text-[13px] font-bold text-ink"
              >
                Entrar como {email.split('@')[0]}
              </button>
            ))}
          </div>
        )}

        {/*
          The design shows a "Hoy en casa" summary card here. It is not rendered:
          before sign-in there is no household to summarise, and inventing
          numbers on the login screen is a lie the first real load contradicts.
        */}
        <p className="text-xs leading-relaxed text-ink-3">
          Google es el único proveedor, en las dos plataformas: mezclar Apple y Google crea dos
          cuentas distintas para la misma persona.
        </p>
      </div>
    </main>
  )
}
