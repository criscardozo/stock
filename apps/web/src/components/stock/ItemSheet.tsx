'use client'

import { useState } from 'react'
import type { Category, Item, Level, Location, Tracking, Unit } from '@/lib/domain/types'
import { UNIT_NAMES } from '@/lib/domain/quantities'
import { FieldInput, Icon, LevelDial, PrimaryAction, Sheet, SheetField } from '../ui/primitives'
import { MoveHistory } from './MoveHistory'
import { useHousehold } from '@/lib/firebase/household'

export type ItemDraft = Omit<Item, 'id'> & {
  /**
   * Fields to REMOVE from an existing document. `updateDoc` merges, so a switch
   * turned back off is invisible unless the removal is stated: leaving `minSpare`
   * behind kept a reserve that the form was no longer showing.
   * Ignored on create — there is nothing to remove yet.
   */
  $unset?: string[]
}

/**
 * New item / edit item. The measurement toggle is the important control on this
 * sheet: it decides which pair of fields the document is allowed to carry, and
 * the rules reject anything half-and-half.
 */
export function ItemSheet({
  item,
  categories,
  locations,
  onClose,
  onSave,
  onDelete,
}: {
  item?: Item
  categories: [string, Category][]
  locations: [string, Location][]
  onClose: () => void
  onSave: (draft: ItemDraft) => void
  onDelete?: () => void
}) {
  const [name, setName] = useState(item?.name ?? '')
  const [nameEs, setNameEs] = useState(item?.nameEs ?? '')
  const [brand, setBrand] = useState(item?.brand ?? '')
  const [packSize, setPackSize] = useState(item?.packSize ?? '')
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? categories[0]?.[0] ?? '')
  const [locationId, setLocationId] = useState(item?.locationId ?? locations[0]?.[0] ?? '')
  const [tracking, setTracking] = useState<Tracking>(item?.tracking ?? 'quantity')
  const [unit, setUnit] = useState<Unit>(item?.unit ?? 'unit')
  const [quantity, setQuantity] = useState(item?.quantity ?? 0)
  const [minQuantity, setMinQuantity] = useState(item?.minQuantity ?? 0)
  const [level, setLevel] = useState<Level>((item?.level ?? 3) as Level)
  const [minLevel, setMinLevel] = useState<Level>((item?.minLevel ?? 1) as Level)
  const [spare, setSpare] = useState(item?.spare ?? 0)
  const [minSpare, setMinSpare] = useState(item?.minSpare ?? 0)
  const [expiresAt, setExpiresAt] = useState(item?.expiresAt ?? '')
  const [autoSuggest, setAutoSuggest] = useState(item?.autoSuggest !== false)
  const { householdId, household } = useHousehold()

  const save = () => {
    if (!name.trim()) return
    onSave({
      name: name.trim(),
      categoryId,
      locationId,
      barcodes: item?.barcodes ?? [],
      ...(nameEs.trim() ? { nameEs: nameEs.trim() } : {}),
      ...(brand.trim() ? { brand: brand.trim() } : {}),
      ...(packSize.trim() ? { packSize: packSize.trim() } : {}),
      ...(expiresAt ? { expiresAt } : {}),
      ...(tracking === 'quantity'
        ? { tracking, unit, quantity, minQuantity }
        : {
            tracking,
            level,
            minLevel,
            // `minSpare` is the switch: without it the item behaves exactly as
            // it did before reserves existed, so an untouched field writes
            // nothing rather than a zero that means the same thing. Turning it
            // OFF has to say so out loud — see `$unset`.
            ...(minSpare > 0 ? { spare, minSpare } : {}),
          }),
      // Always written, both ways. Storing `true` costs one boolean per item
      // and buys not having to delete a field to turn the switch back on —
      // which is the bug the reserve shipped with. Absent still reads as on, so
      // documents that predate the field are untouched.
      autoSuggest,
      // Only the reserve. Switching tracking mode also leaves the other mode's
      // fields behind, which predates this and is left alone on purpose: the
      // rules accept them and the domain reads the active pair, so cleaning
      // that up is a separate change with its own way of going wrong.
      $unset: minSpare > 0 ? [] : ['spare', 'minSpare'],
    })
  }

  return (
    <Sheet
      title={item ? 'Editar ítem' : 'Nuevo ítem'}
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-3">
          <PrimaryAction onClick={save} disabled={!name.trim()}>
            {item ? 'Guardar' : 'Crear ítem'}
          </PrimaryAction>
          {onDelete && (
            <button
              onClick={onDelete}
              className="text-center text-[13.5px] font-semibold text-danger-deep"
            >
              Eliminar del catálogo
            </button>
          )}
        </div>
      }
    >
      <div className="grid grid-cols-[1fr_130px] gap-2.5">
        <SheetField label="Nombre">
          <FieldInput value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </SheetField>
        <SheetField label="Marca">
          <FieldInput
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="opcional"
          />
        </SheetField>
      </div>

      <SheetField label="Cómo le decimos en casa">
        <FieldInput
          value={nameEs}
          onChange={(e) => setNameEs(e.target.value)}
          placeholder="opcional — «Leche de soja»"
        />
      </SheetField>

      <div className="grid grid-cols-2 gap-2.5">
        <SheetField label="Categoría">
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="rounded-field bg-ground px-3.5 py-[11px] text-sm font-semibold"
          >
            {categories.map(([id, category]) => (
              <option key={id} value={id}>
                {category.name}
              </option>
            ))}
          </select>
        </SheetField>
        <SheetField label="Ubicación">
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="rounded-field bg-ground px-3.5 py-[11px] text-sm font-semibold"
          >
            {locations.map(([id, location]) => (
              <option key={id} value={id}>
                {location.name}
              </option>
            ))}
          </select>
        </SheetField>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-ink-2">Cómo se mide</span>
        <div className="flex rounded-full bg-ground p-[3px]">
          {(['quantity', 'level'] as Tracking[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setTracking(mode)}
              className={`flex-1 rounded-full py-2.5 text-[13.5px] ${
                tracking === mode
                  ? 'bg-primary font-bold text-on-primary'
                  : 'font-semibold text-ink-2'
              }`}
            >
              {mode === 'quantity' ? 'Se cuenta' : 'Por nivel'}
            </button>
          ))}
        </div>
      </div>

      {tracking === 'quantity' ? (
        <div className="grid grid-cols-[1fr_1fr_90px] gap-2.5">
          <SheetField label="Cantidad">
            <FieldInput
              type="number"
              min={0}
              className="tnum"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(0, Math.round(Number(e.target.value))))}
            />
          </SheetField>
          <SheetField label="Mínimo">
            <FieldInput
              type="number"
              min={0}
              className="tnum"
              value={minQuantity}
              onChange={(e) => setMinQuantity(Math.max(0, Math.round(Number(e.target.value))))}
            />
          </SheetField>
          <SheetField label="Unidad">
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value as Unit)}
              className="rounded-field bg-ground px-3 py-[11px] text-sm font-semibold"
            >
              {(Object.keys(UNIT_NAMES) as Unit[]).map((id) => (
                <option key={id} value={id}>
                  {id === 'unit' ? 'u' : id}
                </option>
              ))}
            </select>
          </SheetField>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          <SheetField label="Ahora">
            <div className="rounded-field bg-ground px-3.5 py-3">
              <LevelDial level={level} onChange={setLevel} name="lo que hay" />
            </div>
          </SheetField>
          <SheetField label="Avisar en">
            <div className="rounded-field bg-ground px-3.5 py-3">
              <LevelDial level={minLevel} onChange={setMinLevel} name="el aviso" />
            </div>
          </SheetField>
          <SheetField label="Sin abrir">
            <FieldInput
              type="number"
              min={0}
              className="tnum"
              value={spare}
              onChange={(e) => setSpare(Math.max(0, Math.round(Number(e.target.value))))}
            />
          </SheetField>
          <SheetField label="Tener siempre">
            <FieldInput
              type="number"
              min={0}
              className="tnum"
              value={minSpare}
              onChange={(e) => setMinSpare(Math.max(0, Math.round(Number(e.target.value))))}
            />
          </SheetField>
          <p className="col-span-2 text-xs text-ink-3">
            El nivel mide la que está abierta; acá van las cerradas. Con dos de
            reserva, abrir una ya pone la compra en la lista.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        <SheetField label="Vence (opcional)">
          <FieldInput
            type="date"
            className="tnum"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </SheetField>
        <SheetField label="Tamaño del envase">
          <FieldInput
            value={packSize}
            onChange={(e) => setPackSize(e.target.value)}
            placeholder="500 g"
          />
        </SheetField>
      </div>

      <button
        type="button"
        onClick={() => setAutoSuggest(!autoSuggest)}
        aria-pressed={!autoSuggest}
        className="flex w-full items-start gap-3 rounded-panel bg-ground px-3.5 py-3 text-left"
      >
        <span
          className={`mt-px grid size-5 shrink-0 place-items-center rounded-[6px] ${
            autoSuggest ? 'border border-line-strong' : 'bg-primary text-on-primary'
          }`}
        >
          {!autoSuggest && <Icon name="check" size={15} />}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold">Solo catálogo</span>
          <span className="block text-xs leading-relaxed text-ink-3">
            Guarda los datos pero no lo pide cuando se termina. Para lo que compramos de vez en
            cuando. El plan lo sigue pidiendo si una comida lo necesita.
          </span>
        </span>
      </button>

      <p className="text-[11.5px] leading-relaxed text-ink-3">
        Enteros siempre. Lo que no se cuenta en enteros va por nivel — vacío, poco, medio, lleno —
        no con un decimal.
      </p>

      {/* Only for an item that exists: a draft has no history. The read is
          made here, when the sheet opens, rather than alongside the item list,
          so opening one item does not pay for the history of all of them. */}
      {item && householdId && (
        <SheetField label="Últimos movimientos">
          <MoveHistory householdId={householdId} item={item} members={household?.members ?? {}} />
        </SheetField>
      )}
    </Sheet>
  )
}
