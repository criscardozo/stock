'use client'

import { useMemo, useState } from 'react'
import type { Category, Item, Location } from '@/lib/domain/types'
import type { ReceiptAction } from '@/lib/firebase/mutations'
import { buildActions, summarise, type Decision } from '@/lib/receipts/actions'
import { consolidate, priceToStore } from '@/lib/receipts/consolidate'
import { matchLines } from '@/lib/receipts/match'
import { parseReceipt, type Receipt } from '@/lib/receipts/parse'
import { pdfToText } from '@/lib/receipts/pdf'
import { Icon, PrimaryAction, Sheet } from '../ui/primitives'

/**
 * Importing past shops: read the PDFs, decide once per product, write once.
 *
 * Takes a whole folder's worth at a time because deciding is the expensive part
 * and a product bought six times is one decision, not six. Frequency is also
 * the only signal available about what belongs in a pantry, which is why the
 * unknown list is filtered by it rather than showing everything.
 *
 * A line the household has already confirmed is applied without asking.
 * Everything else waits for a person: a receipt carries bags, delivery fees and
 * free samples, and none of those are food in the house.
 */


function money(cents: number | null): string {
  return cents === null ? '—' : `$${(cents / 100).toFixed(2)}`
}

export function ImportSheet({
  items,
  categories,
  locations,
  onClose,
  onApply,
}: {
  items: Item[]
  categories: [string, Category][]
  locations: [string, Location][]
  onClose: () => void
  onApply: (actions: ReceiptAction[], deleteItemIds: string[]) => void
}) {
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [failed, setFailed] = useState<string[]>([])
  const [progress, setProgress] = useState<string | null>(null)
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})
  const [categoryId, setCategoryId] = useState(categories[0]?.[0] ?? '')
  const [locationId, setLocationId] = useState(locations[0]?.[0] ?? '')
  /**
   * Bought fewer times than this and it is probably not stock. Across twenty
   * real receipts, 99 of 139 products appeared exactly once — cravings and
   * one-off specials. Three is where a pantry starts; the control lets anyone
   * disagree.
   */
  const [minBuys, setMinBuys] = useState(3)
  /** "Start the catalogue from these receipts" — off unless asked for. */
  const [wipeFirst, setWipeFirst] = useState(false)

  const lines = useMemo(() => consolidate(receipts), [receipts])

  /** Consolidated lines resolved against the catalogue, in one pass. */
  const resolved = useMemo(() => {
    const matched = matchLines(
      lines.map((l) => ({
        raw: l.raw,
        name: l.name,
        quantity: 1,
        kilos: null,
        unitPriceCents: priceToStore(l),
        totalCents: priceToStore(l) ?? 0,
        section: null,
        onSpecial: false,
      })),
      items,
    )
    return lines.map((line, i) => ({ line, match: matched[i] }))
  }, [lines, items])

  const known = resolved.filter((r) => r.match.status === 'known')
  const unknownAll = resolved.filter((r) => r.match.status === 'unknown')
  const unknown = unknownAll.filter((r) => r.line.buys >= minBuys)
  const hidden = unknownAll.length - unknown.length

  const decisionFor = (raw: string): Decision => decisions[raw] ?? { kind: 'skip' }

  async function readFiles(files: File[]) {
    setProgress(`Leyendo 1 de ${files.length}…`)
    const read: Receipt[] = []
    const bad: string[] = []
    for (const [i, file] of files.entries()) {
      setProgress(`Leyendo ${i + 1} de ${files.length}…`)
      try {
        read.push(parseReceipt(await pdfToText(file)))
      } catch {
        bad.push(file.name)
      }
    }
    // Replace rather than append: re-picking a folder should not double it.
    setReceipts(read)
    setFailed(bad)
    setDecisions({})
    setProgress(null)
  }

  function apply() {
    const actions = buildActions(resolved, decisions, { categoryId, locationId })
    // Linking to an item that is about to be deleted would write to nothing, so
    // a wipe turns every link into a create.
    const safe = wipeFirst
      ? actions.map((a) =>
          a.kind === 'link'
            ? ({
                kind: 'create',
                item: {
                  name: resolved.find((r) => r.line.raw === a.receiptName)?.line.name ?? a.receiptName,
                  categoryId,
                  locationId,
                  tracking: 'quantity' as const,
                  unit: 'unit' as const,
                  quantity: 0,
                  minQuantity: 0,
                  barcodes: [],
                },
                priceCents: a.priceCents,
                receiptName: a.receiptName,
              } satisfies ReceiptAction)
            : a,
        )
      : actions
    onApply(safe, wipeFirst ? items.map((i) => i.id) : [])
  }

  const counts = summarise(buildActions(resolved, decisions, { categoryId, locationId }))
  const toCreate = counts.created
  const toLink = unknownAll.filter((r) => decisionFor(r.line.raw).kind === 'link').length
  const dates = receipts.map((r) => r.date).filter((d): d is string => d !== null).sort()

  return (
    <Sheet
      title="Importar compras"
      subtitle="Actualiza precios y da de alta lo que falte. No toca el stock."
      icon="receipt_long"
      hue="green"
      onClose={onClose}
      footer={
        receipts.length > 0 && (
          <PrimaryAction icon={wipeFirst ? 'delete_sweep' : 'check'} onClick={apply}>
            {wipeFirst
              ? `Borrar ${items.length} y crear ${toCreate}`
              : `Aplicar · ${known.length} precio${known.length === 1 ? '' : 's'}` +
              (toCreate > 0 ? `, ${toCreate} nuevo${toCreate === 1 ? '' : 's'}` : '') +
              (toLink > 0 ? `, ${toLink} vinculado${toLink === 1 ? '' : 's'}` : '')}
          </PrimaryAction>
        )
      }
    >
      {receipts.length === 0 && (
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-card border border-dashed border-line-strong bg-ground px-4 py-8 text-center">
          <Icon name="upload_file" size={26} className="text-ink-3" />
          <span className="text-sm font-bold">
            {progress ?? 'Elegí los PDFs de Coles'}
          </span>
          <span className="text-[11.5px] text-ink-3">
            Podés seleccionar varios de una. Sirven las facturas online y los tickets del local.
          </span>
          <input
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            disabled={progress !== null}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              if (files.length > 0) void readFiles(files)
            }}
          />
        </label>
      )}

      {failed.length > 0 && (
        <p className="rounded-field bg-danger-soft px-4 py-3 text-[13px] font-semibold text-danger-deep">
          No pude leer {failed.length}: {failed.join(', ')}
        </p>
      )}

      {receipts.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex-1 text-[13px] text-ink-2">
              {receipts.length} recibo{receipts.length === 1 ? '' : 's'}
              {dates.length > 1 ? ` · ${dates[0]} a ${dates[dates.length - 1]}` : ''} ·{' '}
              {lines.length} productos
            </p>
            <label className="cursor-pointer rounded-full border border-line bg-surface px-3.5 py-1.5 text-[12px] font-bold text-ink">
              Otros PDFs
              <input
                type="file"
                accept="application/pdf"
                multiple
                className="hidden"
                disabled={progress !== null}
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? [])
                  if (files.length > 0) void readFiles(files)
                }}
              />
            </label>
          </div>

          {known.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="section-label">Ya en el catálogo · se actualiza el precio</span>
              <div className="rounded-card bg-ground px-4">
                {known.map(({ line, match }, i) => (
                  <div
                    key={line.raw}
                    className={`flex items-center gap-3 py-2.5 ${
                      i === known.length - 1 ? '' : 'border-b border-line-soft'
                    }`}
                  >
                    <Icon name="check_circle" size={17} className="text-primary-deep" />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                      {match.item?.name}
                    </span>
                    <span className="text-[11.5px] text-ink-3">{line.buys}×</span>
                    <span className="tnum text-[13px] font-bold">{money(priceToStore(line))}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {unknownAll.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="section-label">Sin reconocer · decidí qué hacer</span>

              <div className="flex flex-wrap items-center gap-2 rounded-field bg-ground px-3 py-2.5">
                <span className="text-[11.5px] text-ink-2">Mostrar los comprados</span>
                {[3, 2, 1].map((n) => (
                  <button
                    key={n}
                    onClick={() => setMinBuys(n)}
                    className={`rounded-full px-3 py-1.5 text-[12px] ${
                      minBuys === n
                        ? 'bg-ink font-bold text-ground'
                        : 'border border-line bg-surface font-semibold text-ink-2'
                    }`}
                  >
                    {n === 1 ? 'todos' : `${n}+ veces`}
                  </button>
                ))}
              </div>

              {items.length > 0 && (
                <label className="flex cursor-pointer items-start gap-2.5 rounded-field bg-danger-soft px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={wipeFirst}
                    onChange={(e) => setWipeFirst(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span className="flex-1 text-[12px] leading-relaxed text-danger-deep">
                    <strong>Empezar de cero</strong>: borrar los {items.length} producto
                    {items.length === 1 ? '' : 's'} que ya tengo y quedarme solo con lo de estos
                    recibos. Las recetas y la lista que apunten a algo borrado se quedan sin
                    referencia.
                  </span>
                </label>
              )}

              <div className="flex flex-wrap items-center gap-2 rounded-field bg-ground px-3 py-2.5">
                <span className="text-[11.5px] text-ink-2">Por defecto, los nuevos van a</span>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="rounded-field bg-surface px-2.5 py-1.5 text-[13px] font-semibold"
                >
                  {categories.map(([id, c]) => (
                    <option key={id} value={id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  className="rounded-field bg-surface px-2.5 py-1.5 text-[13px] font-semibold"
                >
                  {locations.map(([id, l]) => (
                    <option key={id} value={id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-card bg-ground px-4">
                {unknown.map(({ line, match }, i) => {
                  const decision = decisionFor(line.raw)
                  return (
                    <div
                      key={line.raw}
                      className={`flex flex-col gap-2 py-3 ${
                        i === unknown.length - 1 ? '' : 'border-b border-line-soft'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                          {line.name}
                        </span>
                        <span className="text-[11.5px] text-ink-3">{line.buys}×</span>
                        <span className="tnum text-[13px] text-ink-2">
                          {money(priceToStore(line))}
                        </span>
                      </div>

                      {line.onlyEverOnSpecial && (
                        <p className="text-[11px] text-ink-3">
                          Siempre estuvo en oferta — no sabemos cuánto sale normalmente.
                        </p>
                      )}

                      <div className="flex flex-wrap gap-1.5">
                        <button
                          onClick={() =>
                            setDecisions((d) => ({ ...d, [line.raw]: { kind: 'skip' } }))
                          }
                          className={`rounded-full px-3 py-1.5 text-[12px] ${
                            decision.kind === 'skip'
                              ? 'bg-ink font-bold text-ground'
                              : 'border border-line bg-surface font-semibold text-ink-2'
                          }`}
                        >
                          Ignorar
                        </button>
                        <button
                          onClick={() =>
                            setDecisions((d) => ({
                              ...d,
                              [line.raw]: {
                                kind: 'create',
                                categoryId:
                                  d[line.raw]?.kind === 'create'
                                    ? (d[line.raw] as { categoryId?: string }).categoryId
                                    : undefined,
                                locationId:
                                  d[line.raw]?.kind === 'create'
                                    ? (d[line.raw] as { locationId?: string }).locationId
                                    : undefined,
                              },
                            }))
                          }
                          className={`rounded-full px-3 py-1.5 text-[12px] ${
                            decision.kind === 'create'
                              ? 'bg-primary font-bold text-on-primary'
                              : 'border border-line bg-surface font-semibold text-ink-2'
                          }`}
                        >
                          Crear
                        </button>
                        <select
                          value={decision.kind === 'link' ? decision.itemId : ''}
                          onChange={(e) =>
                            setDecisions((d) => ({
                              ...d,
                              [line.raw]: e.target.value
                                ? { kind: 'link', itemId: e.target.value }
                                : { kind: 'skip' },
                            }))
                          }
                          className={`rounded-full px-3 py-1.5 text-[12px] font-semibold ${
                            decision.kind === 'link'
                              ? 'bg-primary-soft text-primary-deep'
                              : 'border border-line bg-surface text-ink-2'
                          }`}
                        >
                          <option value="">Es uno que ya tengo…</option>
                          {[
                            ...match.suggestions,
                            ...items.filter((i) => !match.suggestions.includes(i)),
                          ].map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.nameEs ? `${item.name} — ${item.nameEs}` : item.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {decision.kind === 'create' && (
                        <input
                          value={decision.nameEs ?? ''}
                          onChange={(e) =>
                            setDecisions((d) => ({
                              ...d,
                              [line.raw]: { ...decision, nameEs: e.target.value },
                            }))
                          }
                          placeholder="Cómo le decimos en casa (opcional)"
                          className="rounded-field bg-surface px-3 py-2 text-[13px] font-semibold"
                        />
                      )}

                      {decision.kind === 'create' && (
                        <div className="flex flex-wrap gap-1.5">
                          <select
                            value={decision.categoryId ?? categoryId}
                            onChange={(e) =>
                              setDecisions((d) => ({
                                ...d,
                                [line.raw]: { ...decision, categoryId: e.target.value },
                              }))
                            }
                            className="rounded-full border border-line bg-surface px-3 py-1.5 text-[12px] font-semibold text-ink-2"
                          >
                            {categories.map(([id, c]) => (
                              <option key={id} value={id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                          <select
                            value={decision.locationId ?? locationId}
                            onChange={(e) =>
                              setDecisions((d) => ({
                                ...d,
                                [line.raw]: { ...decision, locationId: e.target.value },
                              }))
                            }
                            className="rounded-full border border-line bg-surface px-3 py-1.5 text-[12px] font-semibold text-ink-2"
                          >
                            {locations.map(([id, l]) => (
                              <option key={id} value={id}>
                                {l.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {hidden > 0 && (
                <p className="text-[11.5px] leading-relaxed text-ink-3">
                  {hidden} producto{hidden === 1 ? '' : 's'} más aparec
                  {hidden === 1 ? 'e' : 'en'} menos de {minBuys} {minBuys === 2 ? 'veces' : 'veces'}
                  {' '}y no {hidden === 1 ? 'se muestra' : 'se muestran'}. Van a entrar solos la
                  próxima vez que los compres, si los das de alta entonces.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </Sheet>
  )
}
