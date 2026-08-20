#!/usr/bin/env node
/**
 * Reads a folder of Coles PDFs and prints one table of everything bought.
 *
 * Run:  node tools/receipts-report.mjs ~/Downloads/Coles [salida.md]
 *
 * This does NOT write to any database. It exists so that reviewing twenty
 * receipts is reading one table instead of opening twenty screens; the actual
 * import still goes through the app, which validates every write against the
 * Firestore rules.
 *
 * It uses the app's own parser, so anything it reports is exactly what the
 * import screen will see. A second implementation here would be a second thing
 * to keep true.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pdfjsPath = resolve('apps/web/node_modules/pdfjs-dist/legacy/build/pdf.mjs')
const pdfjs = await import(pdfjsPath)
const { parseReceipt } = await import(resolve('apps/web/src/lib/receipts/parse.ts'))
const { similarity } = await import(resolve('apps/web/src/lib/receipts/match.ts'))

/** Same layout reconstruction as apps/web/src/lib/receipts/pdf.ts. */
function layoutPage(items) {
  const frags = items
    .filter((i) => i.str.trim().length > 0)
    .map((i) => ({ x: i.transform[4], y: i.transform[5], text: i.str, width: i.width }))
  const rows = []
  for (const f of frags.sort((a, b) => b.y - a.y || a.x - b.x)) {
    const row = rows[rows.length - 1]
    if (row && Math.abs(row[0].y - f.y) < 3) row.push(f)
    else rows.push([f])
  }
  return rows
    .map((row) => {
      row.sort((a, b) => a.x - b.x)
      let line = ''
      let cursor = row[0].x
      for (const f of row) {
        const gap = f.x - cursor
        if (gap > 4.7 && line.length > 0) line += ' '.repeat(Math.max(1, Math.round(gap / 4.7)))
        line += f.text
        cursor = f.x + f.width
      }
      return line.trimEnd()
    })
    .join('\n')
}

async function pdfText(path) {
  const task = pdfjs.getDocument({ data: new Uint8Array(readFileSync(path)) })
  const doc = await task.promise
  const pages = []
  for (let n = 1; n <= doc.numPages; n++) {
    pages.push(layoutPage((await (await doc.getPage(n)).getTextContent()).items))
  }
  await task.destroy()
  return pages.join('\n')
}

const folder = process.argv[2]
if (!folder) {
  console.error('Uso: node tools/receipts-report.mjs <carpeta con PDFs> [salida.md]')
  process.exit(2)
}

const pdfs = readdirSync(folder).filter((f) => f.toLowerCase().endsWith('.pdf')).sort()
if (pdfs.length === 0) {
  console.error(`No hay PDFs en ${folder}`)
  process.exit(1)
}

const products = new Map() // raw name -> { name, buys: [{date, unit, total, qty, kilos}] }
const failed = []
const receipts = []

for (const file of pdfs) {
  const path = join(folder, file)
  try {
    const receipt = parseReceipt(await pdfText(path))
    receipts.push({ file, receipt })
    for (const line of receipt.lines) {
      const key = line.raw.trim().toLowerCase()
      if (!products.has(key)) products.set(key, { name: line.name, raw: line.raw, buys: [] })
      products.get(key).buys.push({
        date: receipt.date,
        unit: line.unitPriceCents,
        total: line.totalCents,
        qty: line.quantity,
        kilos: line.kilos,
      })
    }
  } catch (cause) {
    failed.push({ file, why: cause instanceof Error ? cause.message : String(cause) })
  }
}

const money = (c) => (c === null || c === undefined ? '—' : `$${(c / 100).toFixed(2)}`)

/** Names that look like the same product printed by the other format. */
function aliasGroups(entries) {
  const groups = []
  const used = new Set()
  for (const a of entries) {
    if (used.has(a.raw)) continue
    const near = entries.filter(
      (b) => b.raw !== a.raw && !used.has(b.raw) && similarity(a.raw, b.raw) >= 0.6,
    )
    if (near.length > 0) {
      groups.push([a, ...near])
      used.add(a.raw)
      near.forEach((b) => used.add(b.raw))
    }
  }
  return groups
}

const entries = [...products.values()].sort(
  (a, b) => b.buys.length - a.buys.length || a.name.localeCompare(b.name),
)

const out = []
out.push('# Compras en los PDFs\n')
out.push(
  `${pdfs.length} PDF${pdfs.length === 1 ? '' : 's'} · ` +
    `${receipts.length} leído${receipts.length === 1 ? '' : 's'} · ` +
    `${entries.length} productos distintos\n`,
)

if (failed.length > 0) {
  out.push('## No pude leer\n')
  for (const f of failed) out.push(`- \`${f.file}\` — ${f.why}`)
  out.push('')
}

out.push('## Recibos\n')
out.push('| Archivo | Tipo | Fecha | Productos | No-productos |')
out.push('|---|---|---|---|---|')
for (const { file, receipt } of receipts) {
  out.push(
    `| \`${file}\` | ${receipt.kind === 'online' ? 'online' : 'local'} | ${receipt.date ?? '—'} | ${receipt.lines.length} | ${receipt.skipped.length} |`,
  )
}
out.push('')

out.push('## Productos, por veces comprado\n')
out.push('| Veces | Producto | Último precio | Precios vistos |')
out.push('|---|---|---|---|')
for (const e of entries) {
  const prices = [...new Set(e.buys.map((b) => b.unit).filter((p) => p !== null))]
  const last = e.buys[e.buys.length - 1]
  out.push(
    `| ${e.buys.length} | ${e.name} | ${money(last.unit ?? last.total)} | ${prices.map(money).join(' · ') || '—'} |`,
  )
}
out.push('')

const groups = aliasGroups(entries)
if (groups.length > 0) {
  out.push('## Probablemente el mismo producto\n')
  out.push('Los dos formatos lo escriben distinto. Vinculando uno, el otro matchea solo.\n')
  for (const group of groups) {
    out.push(`- ${group.map((g) => `\`${g.raw}\``).join(' ↔ ')}`)
  }
  out.push('')
}

const text = out.join('\n')
const target = process.argv[3]
if (target) {
  writeFileSync(target, text)
  console.log(`Escrito en ${target}`)
} else {
  console.log(text)
}
