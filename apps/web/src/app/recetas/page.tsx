'use client'

import { useMemo, useState } from 'react'
import { useAuth } from '@/lib/firebase/auth'
import { useHousehold } from '@/lib/firebase/household'
import { addToList, createRecipe, deleteRecipe, updateRecipe } from '@/lib/firebase/mutations'
import { formatDayMonth, missingText, plural } from '@/lib/domain/format'
import { formatQuantity } from '@/lib/domain/quantities'
import { availabilityOf, ingredientStatus, shortfallFor } from '@/lib/domain/recipes'
import type { Ingredient, Item, Recipe } from '@/lib/domain/types'
import { PageHeader, FooterNote } from '@/components/PageHeader'
import { Card, Chip, HueBadge, Icon, PillButton } from '@/components/ui/primitives'
import { deleteField } from 'firebase/firestore'
import { RecipeEditor } from '@/components/recipes/RecipeEditor'

export default function RecipesPage() {
  const { user } = useAuth()
  const { household, householdId, recipes, items, itemsById, reportWrite} = useHousehold()
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState<Recipe | null>(null)
  const [editing, setEditing] = useState<Recipe | 'new' | null>(null)

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return recipes
      .filter((recipe) => (needle ? recipe.title.toLowerCase().includes(needle) : true))
      .sort((a, b) => a.title.localeCompare(b.title, 'es'))
  }, [recipes, search])

  const cookableToday = useMemo(
    () => recipes.filter((recipe) => availabilityOf(recipe, itemsById).missing === 0).length,
    [recipes, itemsById],
  )

  if (!household || !householdId || !user) return null

  return (
    <>
      <PageHeader
        title="Recetas"
        summary={
          recipes.length === 0
            ? 'Todavía no hay ninguna'
            : `${plural(recipes.length, 'receta', 'recetas')} · ${cookableToday} ${
                cookableToday === 1 ? 'se puede' : 'se pueden'
              } cocinar hoy con lo que hay`
        }
        actions={
          <PillButton icon="add" variant="primary" onClick={() => setEditing('new')}>
            Nueva receta
          </PillButton>
        }
      />

      <label className="mb-4 flex w-[250px] items-center gap-2 rounded-full border border-line bg-surface px-4 py-2.5">
        <Icon name="search" size={18} className="text-ink-3" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar"
          className="w-full bg-transparent text-[13px] outline-none"
        />
      </label>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((recipe) => {
          const availability = availabilityOf(recipe, itemsById)
          return (
            <button
              key={recipe.id}
              onClick={() => setOpen(recipe)}
              className="flex flex-col gap-2.5 rounded-card border border-line bg-surface p-[18px] text-left"
            >
              <div className="flex items-start gap-3">
                <HueBadge icon={recipe.icon ?? 'restaurant'} hue="green" size={38} />
                <span className="flex-1" />
                {availability.unknown ? (
                  <Chip icon="link_off">Sin linkear</Chip>
                ) : availability.missing > 0 ? (
                  <Chip tone="danger-quiet">
                    {availability.missing === 1 ? 'Falta 1' : `Faltan ${availability.missing}`}
                  </Chip>
                ) : (
                  <Chip icon="check_circle" tone="primary">
                    Todo
                  </Chip>
                )}
              </div>
              <span className="text-[17px] leading-tight font-bold">{recipe.title}</span>
              <span className="line-clamp-2 text-xs text-ink-2">
                {recipe.ingredients.map((i) => i.label).join(', ') || 'Sin ingredientes todavía'}
              </span>
              <span className="mt-1 flex flex-wrap items-center gap-3 text-xs text-ink-3">
                <span className="flex items-center gap-1">
                  <Icon name="group" size={15} />
                  {plural(recipe.servings, 'porción', 'porciones')}
                </span>
                <span className="flex items-center gap-1">
                  <Icon name="restart_alt" size={15} />
                  {recipe.timesCooked} {recipe.timesCooked === 1 ? 'vez' : 'veces'}
                </span>
                {recipe.lastCookedAt && (
                  <span className="flex items-center gap-1">
                    <Icon name="event_available" size={15} />
                    {formatDayMonth(recipe.lastCookedAt)}
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>

      {visible.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-6 py-14 text-center">
          <Chip icon="menu_book">Sin recetas</Chip>
          <p className="max-w-[380px] text-sm text-ink-2">
            Cargá las que cocinás siempre. Linkeando sus ingredientes al catálogo, el plan del
            viernes te dice solo qué falta comprar.
          </p>
          <PillButton icon="add" variant="primary" onClick={() => setEditing('new')}>
            Crear la primera
          </PillButton>
        </div>
      )}

      <FooterNote left="Los ingredientes de texto libre no generan faltantes: inventar «250 g de sal» sería peor que no decir nada." />

      {open && (
        <RecipeDetail
          recipe={open}
          itemsById={itemsById}
          onClose={() => setOpen(null)}
          onEdit={() => {
            setEditing(open)
            setOpen(null)
          }}
          onSendToList={(ingredients) => {
            for (const ingredient of ingredients) {
              const item = ingredient.itemId ? itemsById.get(ingredient.itemId) : undefined
              reportWrite(addToList(householdId, user.uid, {
                label: item?.name ?? ingredient.label,
                ...(item ? { itemId: item.id } : {}),
                ...(item?.tracking === 'quantity'
                  ? { quantity: shortfallFor(ingredient, itemsById), unit: item.unit }
                  : {}),
                source: 'plan',
                reason: `para ${open.title}`,
              }))
            }
            setOpen(null)
          }}
        />
      )}

      {editing && (
        <RecipeEditor
          recipe={editing === 'new' ? undefined : editing}
          items={items}
          recipes={recipes}
          onClose={() => setEditing(null)}
          onSave={({ $unset = [], ...fields }) => {
            if (editing === 'new') createRecipe(householdId, fields)
            else
              reportWrite(updateRecipe(householdId, editing.id, {
                ...fields,
                // Stated, not implied: see docs/reglas.md on partial writes.
                ...Object.fromEntries($unset.map((key) => [key, deleteField()])),
              }))
            setEditing(null)
          }}
          onDelete={
            editing === 'new'
              ? undefined
              : () => {
                  reportWrite(deleteRecipe(householdId, editing.id))
                  setEditing(null)
                }
          }
        />
      )}
    </>
  )
}

function RecipeDetail({
  recipe,
  itemsById,
  onClose,
  onEdit,
  onSendToList,
}: {
  recipe: Recipe
  itemsById: Map<string, Item>
  onClose: () => void
  onEdit: () => void
  onSendToList: (missing: Ingredient[]) => void
}) {
  const availability = availabilityOf(recipe, itemsById)
  const missing = recipe.ingredients.filter(
    (ingredient) => !ingredient.optional && ingredientStatus(ingredient, itemsById) === 'missing',
  )

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-ink/25"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-[560px] flex-col gap-5 overflow-auto bg-surface p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 className="text-2xl font-bold tracking-[-0.02em]">{recipe.title}</h2>
            <span className="flex flex-wrap items-center gap-3 text-xs text-ink-2">
              <span className="flex items-center gap-1">
                <Icon name="group" size={15} />
                {plural(recipe.servings, 'porción', 'porciones')}
              </span>
              <span className="flex items-center gap-1">
                <Icon name="restart_alt" size={15} />
                {recipe.timesCooked} {recipe.timesCooked === 1 ? 'vez' : 'veces'}
                {recipe.lastCookedAt && ` · última ${formatDayMonth(recipe.lastCookedAt)}`}
              </span>
            </span>
          </div>
          <button onClick={onEdit} className="text-ink-2" aria-label="Editar">
            <Icon name="edit" size={20} />
          </button>
          <button onClick={onClose} className="text-ink-4" aria-label="Cerrar">
            <Icon name="close" size={22} />
          </button>
        </header>

        {recipe.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {recipe.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-neutral-soft px-3 py-1 text-xs font-semibold text-ink-2"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <section className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-[11px] font-bold tracking-[0.07em] text-ink-3 uppercase">
              Ingredientes
            </h3>
            {availability.missing > 0 && (
              <Chip tone="danger-quiet">
                {availability.missing === 1 ? 'Falta 1' : `Faltan ${availability.missing}`}
              </Chip>
            )}
          </div>
          <Card>
            {recipe.ingredients.map((ingredient, index) => {
              const status = ingredientStatus(ingredient, itemsById)
              const item = ingredient.itemId ? itemsById.get(ingredient.itemId) : undefined
              const short = shortfallFor(ingredient, itemsById)
              return (
                <div
                  key={index}
                  className={`flex items-center gap-3 py-2.5 ${
                    index === recipe.ingredients.length - 1 ? '' : 'border-b border-line-soft'
                  }`}
                >
                  <Icon
                    name={
                      status === 'missing'
                        ? 'error'
                        : status === 'low'
                          ? 'arrow_downward'
                          : status === 'unlinked'
                            ? 'text_fields'
                            : 'check_circle'
                    }
                    size={18}
                    className={
                      status === 'missing'
                        ? 'text-danger-deep'
                        : status === 'low'
                          ? 'text-primary-deep'
                          : status === 'unlinked'
                            ? 'text-ink-4'
                            : 'text-primary'
                    }
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {ingredient.label}
                    {ingredient.optional && (
                      <span className="ml-2 text-xs font-normal text-ink-3">opcional</span>
                    )}
                  </span>
                  {ingredient.quantity !== undefined && ingredient.unit && (
                    <span className="tnum text-[13px] text-ink-2">
                      {formatQuantity(ingredient.quantity, ingredient.unit)}
                    </span>
                  )}
                  <span className="w-[110px] text-right text-xs text-ink-3">
                    {status === 'unlinked'
                      ? 'texto libre'
                      : status === 'missing'
                        ? short > 0
                          ? `faltan ${formatQuantity(short, item?.unit ?? 'unit')}`
                          : 'no queda'
                        : item?.tracking === 'level'
                          ? `nivel ${item.level}`
                          : `hay ${formatQuantity(item?.quantity ?? 0, item?.unit ?? 'unit')}`}
                  </span>
                </div>
              )
            })}
            {recipe.ingredients.length === 0 && (
              <p className="py-6 text-center text-sm text-ink-2">Sin ingredientes todavía.</p>
            )}
          </Card>
        </section>

        {recipe.steps && (
          <section className="flex flex-col gap-2">
            <h3 className="text-[11px] font-bold tracking-[0.07em] text-ink-3 uppercase">
              Preparación
            </h3>
            <p className="rounded-card border border-line bg-ground p-4 text-sm leading-relaxed whitespace-pre-wrap">
              {recipe.steps}
            </p>
          </section>
        )}

        {missing.length > 0 && (
          <div className="sticky bottom-0 mt-auto flex items-center gap-3 rounded-panel border border-line bg-surface p-3">
            <span className="flex-1 text-[13px] text-ink-2">
              {missingText(missing.length)} para cocinarla hoy.
            </span>
            <PillButton icon="shopping_cart" variant="primary" onClick={() => onSendToList(missing)}>
              Mandar a la lista
            </PillButton>
          </div>
        )}
      </div>
    </div>
  )
}
