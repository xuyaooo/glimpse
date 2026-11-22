// Finding blocks of writing (e.g. separate exercises) on a flattened page.
// Pure functions on grayscale arrays, so they run in Node tests too.
//
//   1. Ink = pixels clearly darker than their surroundings (adaptive threshold),
//      so uneven light and shadows don't matter.
//   2. Lines = ink joined horizontally across small gaps (between letters/words).
//   3. Blocks = lines joined vertically when the gap is smaller than 1.5 line
//      heights. A blank line or more of space starts a new block (a new exercise).

export function toGray(rgba, w, h) {
  const g = new Uint8ClampedArray(w * h)
  for (let i = 0, p = 0; i < g.length; i++, p += 4) g[i] = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2]
  return g
}

export function inkMask(gray, w, h, { win = Math.max(15, Math.round(w / 30)), offset = 18, border = 0.015 } = {}) {
  const W = w + 1
  const integ = new Float64Array(W * (h + 1))
  for (let y = 0; y < h; y++) {
    let row = 0
    for (let x = 0; x < w; x++) {
      row += gray[y * w + x]
      integ[(y + 1) * W + x + 1] = integ[y * W + x + 1] + row
    }
  }
  const r = win >> 1
  const bx = Math.round(w * border)
  const by = Math.round(h * border)
  const mask = new Uint8Array(w * h)
  for (let y = by; y < h - by; y++) {
    const y0 = Math.max(0, y - r)
    const y1 = Math.min(h, y + r + 1)
    for (let x = bx; x < w - bx; x++) {
      const x0 = Math.max(0, x - r)
      const x1 = Math.min(w, x + r + 1)
      const sum = integ[y1 * W + x1] - integ[y0 * W + x1] - integ[y1 * W + x0] + integ[y0 * W + x0]
      const mean = sum / ((x1 - x0) * (y1 - y0))
      if (gray[y * w + x] < mean - offset) mask[y * w + x] = 1
    }
  }
  removeRuledLines(mask, w, h)
  return mask
}

// Lined / grid / squared paper: printed lines are darker than the paper, so they show
// up as "ink" and would glue all exercises together. Remove long thin straight lines:
// ink that fills a 3-pixel-tall band over a long stretch (> 12% of the page width or
// height) with almost no gaps. Handwriting and fraction bars are much shorter.
export function removeRuledLines(mask, w, h) {
  const kx = Math.max(10, Math.round(w * 0.06)) // half window: total ~12% of width
  const ky = Math.max(10, Math.round(h * 0.06))
  const line = new Uint8Array(w * h)
  // horizontal lines (a 3-row band tolerates slight tilt)
  const band = new Uint8Array(w)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 0; x < w; x++) band[x] = mask[(y - 1) * w + x] | mask[y * w + x] | mask[(y + 1) * w + x]
    let sum = 0
    for (let x = 0; x < Math.min(w, 2 * kx + 1); x++) sum += band[x]
    for (let c = kx; c < w - kx; c++) {
      if (c > kx) sum += band[c + kx] - band[c - kx - 1]
      if (sum >= 0.92 * (2 * kx + 1)) for (let x = c - kx; x <= c + kx; x++) line[y * w + x] = 1
    }
  }
  // vertical lines (margins, grid)
  const col = new Uint8Array(h)
  for (let x = 1; x < w - 1; x++) {
    for (let y = 0; y < h; y++) col[y] = mask[y * w + x - 1] | mask[y * w + x] | mask[y * w + x + 1]
    let sum = 0
    for (let y = 0; y < Math.min(h, 2 * ky + 1); y++) sum += col[y]
    for (let c = ky; c < h - ky; c++) {
      if (c > ky) sum += col[c + ky] - col[c - ky - 1]
      if (sum >= 0.92 * (2 * ky + 1)) for (let y = c - ky; y <= c + ky; y++) line[y * w + x] = 1
    }
  }
  // Band centers were marked, so the marks already cover the line's full thickness.
  for (let i = 0; i < mask.length; i++) if (line[i]) mask[i] = 0
  return mask
}

// Join ink across horizontal gaps up to `gap` px, then return connected boxes.
export function findLines(mask, w, h, { gap = Math.round(w * 0.035), minPixels = 12 } = {}) {
  const smooth = mask.slice()
  for (let y = 0; y < h; y++) {
    let last = -1
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue
      if (last >= 0 && x - last - 1 <= gap) for (let k = last + 1; k < x; k++) smooth[y * w + k] = 1
      last = x
    }
  }
  const seen = new Uint8Array(w * h)
  const stack = new Int32Array(w * h)
  const boxes = []
  for (let s = 0; s < smooth.length; s++) {
    if (!smooth[s] || seen[s]) continue
    let top = 0
    let count = 0
    let ink = 0
    let x0 = w
    let y0 = h
    let x1 = 0
    let y1 = 0
    stack[top++] = s
    seen[s] = 1
    while (top) {
      const i = stack[--top]
      const x = i % w
      const y = (i - x) / w
      count++
      if (mask[i]) ink++
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
      if (x > 0 && smooth[i - 1] && !seen[i - 1]) (seen[i - 1] = 1), (stack[top++] = i - 1)
      if (x < w - 1 && smooth[i + 1] && !seen[i + 1]) (seen[i + 1] = 1), (stack[top++] = i + 1)
      if (y > 0 && smooth[i - w] && !seen[i - w]) (seen[i - w] = 1), (stack[top++] = i - w)
      if (y < h - 1 && smooth[i + w] && !seen[i + w]) (seen[i + w] = 1), (stack[top++] = i + w)
    }
    if (ink >= minPixels && y1 - y0 >= 2) boxes.push({ x0, y0, x1, y1 })
  }
  return boxes
}

function median(values) {
  if (!values.length) return 0
  const s = values.slice().sort((a, b) => a - b)
  return s[s.length >> 1]
}

const gapBetween = (a0, a1, b0, b1) => Math.max(0, Math.max(a0, b0) - Math.min(a1, b1))

// Blocks of writing, top to bottom. Each block: { x0, y0, x1, y1, lines }.
export function findBlocks(gray, w, h, opts = {}) {
  const mask = inkMask(gray, w, h, opts)
  const lines = findLines(mask, w, h, opts)
  if (!lines.length) return { blocks: [], lineHeight: 0 }
  const lineHeight = median(lines.filter((b) => b.x1 - b.x0 > w * 0.03).map((b) => b.y1 - b.y0 + 1)) || 12
  // Lines of one exercise are ~1 line-height apart; a blank line between exercises is 2-3x.
  const vGap = (opts.gapFactor ?? 1.5) * lineHeight
  const hGap = w * 0.06

  let blocks = lines.map((b) => ({ ...b, lines: 1 }))
  let merged = true
  while (merged) {
    merged = false
    outer: for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        const a = blocks[i]
        const b = blocks[j]
        const vg = gapBetween(a.y0, a.y1, b.y0, b.y1)
        const hg = gapBetween(a.x0, a.x1, b.x0, b.x1)
        if (vg <= vGap && hg <= hGap) {
          blocks[i] = {
            x0: Math.min(a.x0, b.x0),
            y0: Math.min(a.y0, b.y0),
            x1: Math.max(a.x1, b.x1),
            y1: Math.max(a.y1, b.y1),
            lines: a.lines + b.lines,
          }
          blocks.splice(j, 1)
          merged = true
          break outer
        }
      }
    }
  }
  // Drop specks (tiny isolated marks).
  blocks = blocks.filter((b) => b.x1 - b.x0 + 1 >= lineHeight * 0.8 || b.y1 - b.y0 + 1 >= lineHeight * 0.8)
  blocks.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)
  return { blocks, lineHeight }
}

// The block the finger points at. People usually point at the exercise or just below
// or beside it (so they don't cover it), so blocks above the fingertip are preferred.
export function pickBlock(blocks, px, py, { maxDist = Infinity } = {}) {
  let best = null
  let bestScore = Infinity
  for (const b of blocks) {
    const dx = Math.max(b.x0 - px, 0, px - b.x1)
    const below = b.y0 - py // > 0: block is below the fingertip
    const above = py - b.y1 // > 0: block is above the fingertip
    const dy = Math.max(0, below, above)
    const score = dx + (below > 0 ? dy * 2.5 : dy) + (dx === 0 && dy === 0 ? 0 : 1)
    const area = (b.x1 - b.x0) * (b.y1 - b.y0)
    if (score < bestScore || (score === bestScore && best && area < (best.x1 - best.x0) * (best.y1 - best.y0))) {
      best = b
      bestScore = score
    }
  }
  return bestScore <= maxDist ? best : null
}
