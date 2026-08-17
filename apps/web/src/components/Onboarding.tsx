'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/firebase/auth'
import { createHousehold, joinHousehold } from '@/lib/firebase/mutations'
import { AppMark } from './AppMark'
import { Card, FieldInput, Icon, PrimaryAction, SheetField } from './ui/primitives'

const TIMEZONES = ['Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane', 'America/Argentina/Buenos_Aires']

export function Onboarding() {
  const { user, signOut } = useAuth()
  const [name, setName] = useState('Casa')
  const [timezone, setTimezone] = useState(TIMEZONES[0])
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!user) return null
  const displayName = user.displayName ?? 'Sin nombre'

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Algo salió mal')
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-[520px] flex-col gap-6 p-6 py-10">
      <header className="flex flex-col gap-2">
        <AppMark size={44} radius={14} />
        <h1 className="text-2xl font-bold tracking-[-0.02em]">Hola, {displayName}</h1>
        <p className="text-sm text-ink-2">
          Todavía no estás en ningún hogar. Creá uno o entrá con el código de tu casa.
        </p>
      </header>

      <Card className="flex flex-col gap-4 py-5">
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] font-bold tracking-[0.07em] text-ink-3 uppercase">
            Empezar de cero
          </span>
          <span className="text-lg font-bold">Crear un hogar</span>
        </div>
        <div className="flex gap-2.5">
          <SheetField label="Nombre">
            <FieldInput value={name} onChange={(e) => setName(e.target.value)} />
          </SheetField>
          <SheetField label="Zona horaria">
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="rounded-field bg-ground px-3.5 py-[11px] text-[14.5px] font-semibold"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz}>{tz}</option>
              ))}
            </select>
          </SheetField>
        </div>
        <p className="text-[11.5px] leading-relaxed text-ink-3">
          Las fechas del plan se calculan en esta zona, no en la del dispositivo.
        </p>
        <PrimaryAction
          disabled={busy || !name.trim()}
          onClick={() =>
            run(() => createHousehold(user.uid, displayName, user.photoURL, name.trim(), timezone))
          }
        >
          Crear hogar
        </PrimaryAction>
      </Card>

      <Card className="flex flex-col gap-4 py-5">
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] font-bold tracking-[0.07em] text-ink-3 uppercase">
            Ya tienen uno
          </span>
          <span className="text-lg font-bold">Unirme con un código</span>
        </div>
        <SheetField label="Código de invitación">
          <FieldInput
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="pegá el código acá"
            autoCapitalize="off"
            spellCheck={false}
          />
        </SheetField>
        <p className="text-[11.5px] leading-relaxed text-ink-3">
          Te lo pasa la otra persona desde Ajustes. Conocer el código <em>es</em> el permiso: se
          puede leer, pero no listar.
        </p>
        <PrimaryAction
          disabled={busy || !code.trim()}
          onClick={() =>
            run(() => joinHousehold(user.uid, displayName, user.photoURL, code.trim()))
          }
        >
          Unirme
        </PrimaryAction>
      </Card>

      {error && (
        <p className="flex items-center gap-2 text-sm text-danger-deep">
          <Icon name="error" size={18} />
          {error}
        </p>
      )}

      <button onClick={() => void signOut()} className="self-start text-xs text-ink-3 underline">
        Salir
      </button>
    </main>
  )
}
