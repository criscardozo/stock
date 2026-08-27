'use client'

import { useMemo, useState } from 'react'
import type { Ingredient, Item, Recipe } from '@/lib/domain/types'
import { formatQuantity } from '@/lib/domain/quantities'
import { FieldInput, Icon, PrimaryAction, Sheet, SheetField } from '../ui/primitives'
import { fold } from '@/lib/calendar/match'

type RecipeDraft = Omit<Recipe, 'id' | 'timesCooked'> & {
  /**
   * Fields to REMOVE from an existing document, the same shape ItemSheet uses.
   * `updateDoc` merges, so a short name cleared in the form is invisible unless
   * the removal is stated — see docs/reglas.md on partial writes.
   */
  $unset?: string[]
}

/** The set the design drew from — enough to tell six recipes apart at a glance. */
const ICONS = [
  'restaurant',
  'ramen_dining',
  'rice_bowl',
  'kebab_dining',
  'oven_gen',
  'lunch_dining',
  'set_meal',
  'local_pizza',
  'soup_kitchen',
  'egg_alt',
  'bakery_dining',
  'outdoor_grill',
]

/**
 * Linking an ingredient to a catalogue item is the entire reason this editor
 * exists: it is what lets the plan compute a shortfall. Free text stays
 * possible, and stays invisible to the maths.
 */
export function RecipeEditor({
  recipe,
  items,
  recipes = [],
  onClose,
  onSave,
  onDelete,
}: {
  recipe?: Recipe
  items: Item[]
  /** Every recipe in the household, so a short name already taken can be
   * refused here — rules cannot compare siblings, so this is where uniqueness
   * lives. */
  recipes?: Recipe[]
  onClose: () => void
  onSave: (draft: RecipeDraft) => void
  onDelete?: () => void
}) {
  const [title, setTitle] = useState(recipe?.title ?? '')
  const [shortName, setShortName] = useState(recipe?.shortName ?? '')
  const [servings, setServings] = useState(recipe?.servings ?? 2)
  const [steps, setSteps] = useState(recipe?.steps ?? '')
  const [tags, setTags] = useState<string[]>(recipe?.tags ?? [])
  const [tagDraft, setTagDraft] = useState('')
  const [ingredients, setIngredients] = useState<Ingredient[]>(recipe?.ingredients ?? [])
  const [icon, setIcon] = useState(recipe?.icon ?? 'restaurant')
  const [search, setSearch] = useState('')

  /**
   * The title of another recipe already using this short name, or null.
   *
   * Checked here because the rules cannot: a security rule sees one document,
   * never its siblings. And the matcher refuses an ambiguous name rather than
   * picking one, so without this the calendar would simply stop matching that
   * word — a feature quietly doing nothing, which is the failure this project
   * keeps running into.
   */
  const shortNameTaken = useMemo(() => {
    const wanted = fold(shortName)
    if (wanted === '') return null
    const clash = recipes.find((r) => r.id !== recipe?.id && r.shortName && fold(r.shortName) === wanted)
    return clash?.title ?? null
  }, [shortName, recipes, recipe?.id])

  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return []
    return items
      .filter((item) => item.name.toLowerCase().includes(needle))
      .filter((item) => !ingredients.some((i) => i.itemId === item.id))
      .slice(0, 6)
  }, [items, search, ingredients])

  const add = (ingredient: Ingredient) => {
    setIngredients((prev) => [...prev, ingredient])
    setSearch('')
  }

  const patch = (index: number, next: Partial<Ingredient>) =>
    setIngredients((prev) => prev.map((row, i) => (i === index ? { ...row, ...next } : row)))

  return (
    <Sheet
      title={recipe ? 'Editar receta' : 'Nueva receta'}
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-3">
          {shortNameTaken && (
            <p className="text-[12.5px] font-semibold text-danger-deep">
              Ese nombre corto ya lo usa «{shortNameTaken}». Tienen que ser distintos, si no el
              calendario no sabe a cuál te referís.
            </p>
          )}
          <PrimaryAction
            disabled={!title.trim() || shortNameTaken !== null}
            onClick={() =>
              onSave({
                title: title.trim(),
                servings: Math.max(1, servings),
                tags,
                icon,
                ingredients,
                ...(shortName.trim() ? { shortName: shortName.trim() } : {}),
                ...(steps.trim() ? { steps: steps.trim() } : {}),
                ...(recipe?.lastCookedAt ? { lastCookedAt: recipe.lastCookedAt } : {}),
                // Cleared out loud: `updateDoc` merges, so a short name emptied
                // in the form would otherwise stay on the document.
                ...(shortName.trim() ? {} : { $unset: ['shortName'] }),
              })
            }
          >
            {recipe ? 'Guardar' : 'Crear receta'}
          </PrimaryAction>
          {onDelete && (
            <button
              onClick={onDelete}
              className="text-center text-[13.5px] font-semibold text-danger-deep"
            >
              Eliminar receta
            </button>
          )}
        </div>
      }
    >
      <div className="grid grid-cols-[1fr_1fr_100px] gap-2.5">
        <SheetField label="Título">
          <FieldInput value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </SheetField>
        <SheetField label="Nombre corto (opcional)">
          <FieldInput
            value={shortName}
            onChange={(e) => setShortName(e.target.value)}
            maxLength={40}
            placeholder="milanesas"
          />
        </SheetField>
        <SheetField label="Porciones">
          <FieldInput
            type="number"
            min={1}
            className="tnum"
            value={servings}
            onChange={(e) => setServings(Math.max(1, Math.round(Number(e.target.value))))}
          />
        </SheetField>
      </div>

      <SheetField label="Ícono">
        <div className="flex flex-wrap gap-1.5 rounded-field bg-ground p-2">
          {ICONS.map((name) => (
            <button
              key={name}
              type="button"
              aria-label={name}
              onClick={() => setIcon(name)}
              className={`grid h-9 w-9 place-items-center rounded-full ${
                icon === name ? 'bg-primary text-on-primary' : 'text-ink-2'
              }`}
            >
              <Icon name={name} size={19} />
            </button>
          ))}
        </div>
      </SheetField>

      <SheetField label="Etiquetas">
        <div className="flex flex-wrap items-center gap-1.5 rounded-field bg-ground px-2.5 py-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-ink-2"
            >
              {tag}
              <button
                onClick={() => setTags(tags.filter((t) => t !== tag))}
                aria-label={`Sacar ${tag}`}
              >
                <Icon name="close" size={13} />
              </button>
            </span>
          ))}
          <input
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || !tagDraft.trim()) return
              event.preventDefault()
              setTags([...new Set([...tags, tagDraft.trim()])])
              setTagDraft('')
            }}
            placeholder="+ etiqueta"
            className="min-w-20 flex-1 bg-transparent px-1 text-[13px] outline-none"
          />
        </div>
      </SheetField>

      <div className="flex flex-col gap-2">
        <span className="flex items-baseline gap-2 text-xs font-semibold text-ink-2">
          Ingredientes
          <span className="text-ink-3">
            {ingredients.filter((i) => i.itemId).length} linkeados ·{' '}
            {ingredients.filter((i) => !i.itemId).length} libres
          </span>
        </span>

        <div className="flex flex-col rounded-panel bg-ground px-3">
          {ingredients.map((ingredient, index) => {
            const item = ingredient.itemId ? items.find((i) => i.id === ingredient.itemId) : undefined
            return (
              <div
                key={index}
                className={`flex items-center gap-2.5 py-2.5 ${
                  index === ingredients.length - 1 ? '' : 'border-b border-line-soft'
                }`}
              >
                <Icon
                  name={ingredient.itemId ? 'link' : 'text_fields'}
                  size={16}
                  className={ingredient.itemId ? 'text-primary-deep' : 'text-ink-3'}
                />
                <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">
                  {ingredient.label}
                </span>
                {item?.tracking === 'quantity' && (
                  <>
                    <input
                      type="number"
                      min={0}
                      value={ingredient.quantity ?? 0}
                      onChange={(e) =>
                        patch(index, {
                          quantity: Math.max(0, Math.round(Number(e.target.value))),
                          unit: item.unit,
                        })
                      }
                      className="tnum w-20 rounded-[10px] border border-line bg-surface px-2.5 py-1.5 text-sm font-semibold"
                    />
                    <span className="w-6 text-xs text-ink-3">{item.unit}</span>
                  </>
                )}
                {item?.tracking === 'level' && (
                  <span className="text-xs text-ink-3">por nivel</span>
                )}
                <button
                  onClick={() =>
                    patch(index, { optional: !ingredient.optional })
                  }
                  title={ingredient.optional ? 'Volverlo obligatorio' : 'Marcarlo opcional'}
                  className={`text-xs font-semibold ${
                    ingredient.optional ? 'text-primary-deep' : 'text-ink-4'
                  }`}
                >
                  opc
                </button>
                <button
                  onClick={() => setIngredients(ingredients.filter((_, i) => i !== index))}
                  aria-label={`Sacar ${ingredient.label}`}
                  className="text-ink-4"
                >
                  <Icon name="close" size={17} />
                </button>
              </div>
            )
          })}

          <div className="flex items-center gap-2 py-2.5">
            <Icon name="add" size={17} className="text-ink-3" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar un ítem del catálogo, o escribir uno libre"
              className="flex-1 bg-transparent text-sm outline-none"
            />
          </div>

          {search.trim() && (
            <div className="flex flex-col border-t border-line-soft py-1">
              {matches.map((item) => (
                <button
                  key={item.id}
                  onClick={() =>
                    add({
                      label: item.name,
                      itemId: item.id,
                      optional: false,
                      ...(item.tracking === 'quantity' ? { quantity: 0, unit: item.unit } : {}),
                    })
                  }
                  className="flex items-center gap-2.5 py-2 text-left"
                >
                  <Icon name="link" size={16} className="text-primary-deep" />
                  <span className="flex-1 text-sm font-semibold">{item.name}</span>
                  <span className="text-xs text-ink-3">
                    {item.tracking === 'quantity'
                      ? formatQuantity(item.quantity ?? 0, item.unit ?? 'unit')
                      : 'por nivel'}
                  </span>
                </button>
              ))}
              <button
                onClick={() => add({ label: search.trim(), optional: false })}
                className="flex items-center gap-2.5 py-2 text-left"
              >
                <Icon name="text_fields" size={16} className="text-ink-3" />
                <span className="flex-1 text-sm">
                  Usar «{search.trim()}» como texto libre
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      <SheetField label="Preparación">
        <textarea
          value={steps}
          onChange={(e) => setSteps(e.target.value)}
          rows={5}
          placeholder="Un paso por línea."
          className="rounded-field bg-ground px-3.5 py-3 text-sm leading-relaxed outline-none"
        />
      </SheetField>
    </Sheet>
  )
}
