'use client'

import { useMemo, useState } from 'react'
import type { Category, Item, Location } from '@/lib/domain/types'
import type { NewItem, ReceiptAction } from '@/lib/firebase/mutations'
import { matchLines, priceForItem, type MatchedLine } from '@/lib/receipts/match'
import { parseReceipt, type Receipt } from '@/lib/receipts/parse'
import { pdfToText } from '@/lib/receipts/pdf'
import { Icon, PrimaryAction, Sheet } from '../ui/primitives'

/**
 * Importing a past shop: read the PDF, decide line by line, write once.
 *
 * The screen is mostly a review table because the decisions are not the
 * computer's to make. A line the household has already confirmed is applied
 * silently; everything else waits for a person to say what it is.
 */

type Decision =
  | { kind: 'skip' }
  | { kind: 'link'; itemId: string }
  | { kind: 'create' }

function money(cents: number | null): string {
  if (cents === null) return '—'
  return `$${(cents / 100).toFixed(2)}`
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
  onApply: (actions: ReceiptAction[]) => void
}) {
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [decisions, setDecisions] = useState<Record<number, Decision>>({})
  const [categoryId, setCategoryId] = useState(categories[0]?.[0] ?? '')
  const [locationId, setLocationId] = useState(locations[0]?.[0] ?? '')

  const matched: MatchedLine[] = useMemo(
    () => (receipt ? matchLines(receipt.lines, items) : []),
    [receipt, items],
  )

  const known = matched.filter((m) => m.status === 'known')
  const unknown = matched
    .map((m, index) => ({ m, index }))
    .filter(({ m }) => m.status === 'unknown')

  /** Default for an unseen line: do nothing. Creating is opt-in, per line. */
  const decisionFor = (index: number): Decision => decisions[index] ?? { kind: 'skip' }

  async function readFile(file: File) {
    setBusy(true)
    setError(null)
    try {
      setReceipt(parseReceipt(await pdfToText(file)))
      setDecisions({})
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pude leer el PDF.')
      setReceipt(null)
    } finally {
      setBusy(false)
    }
  }

  function apply() {
    if (!receipt) return
    const actions: ReceiptAction[] = matched.map((m, index) => {
      const price = priceForItem(m.line)
      if (m.status === 'known' && m.item) {
        return { kind: 'link', itemId: m.item.id, priceCents: price, receiptName: m.line.raw }
      }
      const decision = decisionFor(index)
      if (decision.kind === 'link') {
        return { kind: 'link', itemId: decision.itemId, priceCents: price, receiptName: m.line.raw }
      }
      if (decision.kind === 'create') {
        const item: NewItem = {
          name: m.line.name,
          categoryId,
          locationId,
          tracking: 'quantity',
          unit: 'unit',
          // A past shop says nothing about what is in the house right now.
          quantity: 0,
          minQuantity: 0,
          barcodes: [],
        }
        return { kind: 'create', item, priceCents: price, receiptName: m.line.raw }
      }
      return { kind: 'skip' }
    })
    onApply(actions)
  }

  const toCreate = unknown.filter(({ index }) => decisionFor(index).kind === 'create').length
  const toLink = unknown.filter(({ index }) => decisionFor(index).kind === 'link').length

  return (
    <Sheet
      title="Importar una compra"
      subtitle="Actualiza precios y da de alta lo que falte. No toca el stock."
      icon="receipt_long"
      hue="green"
      onClose={onClose}
      footer={
        receipt && (
          <PrimaryAction icon="check" onClick={apply}>
            {`Aplicar · ${known.length} precio${known.length === 1 ? '' : 's'}` +
              (toCreate > 0 ? `, ${toCreate} nuevo${toCreate === 1 ? '' : 's'}` : '') +
              (toLink > 0 ? `, ${toLink} vinculado${toLink === 1 ? '' : 's'}` : '')}
          </PrimaryAction>
        )
      }
    >
      {!receipt && (
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-card border border-dashed border-line-strong bg-ground px-4 py-8 text-center">
          <Icon name="upload_file" size={26} className="text-ink-3" />
          <span className="text-sm font-bold">{busy ? 'Leyendo…' : 'Elegí el PDF de Coles'}</span>
          <span className="text-[11.5px] text-ink-3">
            Sirve tanto la factura de una compra online como el ticket del local.
          </span>
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void readFile(file)
            }}
          />
        </label>
      )}

      {error && (
        <p className="rounded-field bg-danger-soft px-4 py-3 text-[13px] font-semibold text-danger-deep">
          {error}
        </p>
      )}

      {receipt && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex-1 text-[13px] text-ink-2">
              {receipt.kind === 'online' ? 'Compra online' : 'Compra en el local'}
              {receipt.date ? ` · ${receipt.date}` : ''} · {receipt.lines.length} productos
            </p>
            {/* Without this the only way to load a second receipt is to close
                the sheet, because the drop zone is gone once one is read. */}
            <label className="cursor-pointer rounded-full border border-line bg-surface px-3.5 py-1.5 text-[12px] font-bold text-ink">
              Otro PDF
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void readFile(file)
                }}
              />
            </label>
          </div>

          {known.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="section-label">Ya en el catálogo · se actualiza el precio</span>
              <div className="rounded-card bg-ground px-4">
                {known.map((m, i) => (
                  <div
                    key={`${m.line.raw}-${i}`}
                    className={`flex items-center gap-3 py-2.5 ${
                      i === known.length - 1 ? '' : 'border-b border-line-soft'
                    }`}
                  >
                    <Icon name="check_circle" size={17} className="text-primary-deep" />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                      {m.item?.name}
                    </span>
                    <span className="tnum text-[13px] font-bold">{money(priceForItem(m.line))}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {unknown.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="section-label">Sin reconocer · decidí qué hacer</span>
              <div className="flex flex-wrap items-center gap-2 rounded-field bg-ground px-3 py-2.5">
                <span className="text-[11.5px] text-ink-2">Los nuevos entran en</span>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="rounded-field bg-surface px-2.5 py-1.5 text-[12.5px] font-semibold"
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
                  className="rounded-field bg-surface px-2.5 py-1.5 text-[12.5px] font-semibold"
                >
                  {locations.map(([id, l]) => (
                    <option key={id} value={id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-card bg-ground px-4">
                {unknown.map(({ m, index }, i) => {
                  const decision = decisionFor(index)
                  return (
                    <div
                      key={`${m.line.raw}-${index}`}
                      className={`flex flex-col gap-2 py-3 ${
                        i === unknown.length - 1 ? '' : 'border-b border-line-soft'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                          {m.line.name}
                        </span>
                        <span className="tnum text-[12.5px] text-ink-2">
                          {money(priceForItem(m.line))}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          onClick={() => setDecisions((d) => ({ ...d, [index]: { kind: 'skip' } }))}
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
                            setDecisions((d) => ({ ...d, [index]: { kind: 'create' } }))
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
                              [index]: e.target.value
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
                          {[...m.suggestions, ...items.filter((i) => !m.suggestions.includes(i))].map(
                            (item) => (
                              <option key={item.id} value={item.id}>
                                {item.nameEs ? `${item.name} — ${item.nameEs}` : item.name}
                              </option>
                            ),
                          )}
                        </select>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {receipt.skipped.length > 0 && (
            <p className="text-[11.5px] leading-relaxed text-ink-3">
              {receipt.skipped.length} línea{receipt.skipped.length === 1 ? '' : 's'} del PDF no
              {receipt.skipped.length === 1 ? ' era' : ' eran'} productos (envíos, bolsas,
              descuentos) y no se {receipt.skipped.length === 1 ? 'cuenta' : 'cuentan'}.
            </p>
          )}
        </>
      )}
    </Sheet>
  )
}
