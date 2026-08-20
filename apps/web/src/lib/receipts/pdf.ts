/**
 * PDF -> text, in the browser, with the column layout preserved.
 *
 * This is separate from parse.ts on purpose: this half needs a PDF library and
 * a browser, the other half is pure string work that can be tested against
 * fixtures. Only this file knows pdfjs exists.
 *
 * The subtlety is that pdfjs hands back positioned fragments, not lines. A
 * receipt's meaning lives in its columns — "name … qty … $unit … $total" — so
 * fragments are grouped into rows by their y coordinate and padded back out
 * with spaces by their x. Joining them with a single space instead would
 * collapse the columns and make the name run into the numbers.
 */

/** Rebuilds one page's text from positioned fragments. */
function layoutPage(items: { str: string; transform: number[]; width: number }[]): string {
  type Frag = { x: number; y: number; text: string; width: number }
  const frags: Frag[] = items
    // Whitespace-only fragments have to go, not just empty ones: pdfjs emits
    // them between columns, and letting one through advances the cursor past
    // the gap that the column layout is made of.
    .filter((i) => i.str.trim().length > 0)
    .map((i) => ({ x: i.transform[4], y: i.transform[5], text: i.str, width: i.width }))

  // Group by line. Fragments on one visual row share a y within a couple of
  // points — they are not identical because of subscripts and font changes.
  const rows: Frag[][] = []
  for (const frag of frags.sort((a, b) => b.y - a.y || a.x - b.x)) {
    const row = rows[rows.length - 1]
    if (row && Math.abs(row[0].y - frag.y) < 3) row.push(frag)
    else rows.push([frag])
  }

  // One space per ~4.7pt of gap approximates a monospace rendering of the
  // columns, which is all parse.ts needs: it separates fields on 2+ spaces.
  const PT_PER_SPACE = 4.7
  return rows
    .map((row) => {
      row.sort((a, b) => a.x - b.x)
      let line = ''
      let cursor = row[0].x
      for (const frag of row) {
        const gap = frag.x - cursor
        if (gap > PT_PER_SPACE && line.length > 0) {
          line += ' '.repeat(Math.max(1, Math.round(gap / PT_PER_SPACE)))
        }
        line += frag.text
        cursor = frag.x + frag.width
      }
      return line.trimEnd()
    })
    .join('\n')
}

/**
 * Reads every page of a PDF into one string.
 *
 * pdfjs is imported dynamically so its ~1 MB worker is only fetched when
 * somebody actually opens the import screen, not on every page load.
 */
export async function pdfToText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  // The worker ships with the package; point at it rather than a CDN, so the
  // import screen works with no network the way the rest of the app does.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()

  // Keep the loading task: destroy() lives on it, not on the document, and
  // without it the worker stays alive after the import screen closes.
  const task = pdfjs.getDocument({ data: await file.arrayBuffer() })
  const doc = await task.promise
  const pages: string[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const content = await page.getTextContent()
    pages.push(layoutPage(content.items as { str: string; transform: number[]; width: number }[]))
  }
  await task.destroy()
  return pages.join('\n')
}
