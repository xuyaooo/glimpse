import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findBlocks, pickBlock } from '../server/vision/layout.js'

// A light page with "words" (dark dashes) in lines, grouped into exercises.
function makePage(w, h, exercises, { shade = false } = {}) {
  const g = new Uint8ClampedArray(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = shade ? 235 - (x / w) * 70 : 235
  for (const ex of exercises) {
    for (let l = 0; l < ex.lines; l++) {
      const yTop = ex.y + l * ex.lineSpacing
      let x = ex.x
      while (x < ex.x + ex.width) {
        const word = 18 + ((x * 7 + l * 13) % 30)
        for (let yy = yTop; yy < yTop + 14; yy++) {
          for (let xx = x; xx < Math.min(x + word, ex.x + ex.width); xx++) {
            if ((xx + yy) % 3 !== 0) g[yy * w + xx] = 40 // strokes, not solid boxes
          }
        }
        x += word + 9 // space between words
      }
    }
  }
  return g
}

const W = 800
const H = 1000
const EXERCISES = [
  { x: 60, y: 80, width: 600, lines: 2, lineSpacing: 26 }, // exercise 1
  { x: 60, y: 260, width: 640, lines: 3, lineSpacing: 26 }, // exercise 2
  { x: 60, y: 520, width: 400, lines: 1, lineSpacing: 26 }, // exercise 3
]

test('finds one block per exercise', () => {
  const { blocks, lineHeight } = findBlocks(makePage(W, H, EXERCISES), W, H)
  assert.equal(blocks.length, 3, JSON.stringify(blocks))
  assert.ok(lineHeight >= 12 && lineHeight <= 18, `line height ${lineHeight}`)
  blocks.forEach((b, i) => {
    assert.ok(Math.abs(b.y0 - EXERCISES[i].y) <= 3, `block ${i} top ${b.y0}`)
  })
})

test('works with uneven lighting', () => {
  const { blocks } = findBlocks(makePage(W, H, EXERCISES, { shade: true }), W, H)
  assert.equal(blocks.length, 3)
})

test('picks the block the finger points at', () => {
  const { blocks } = findBlocks(makePage(W, H, EXERCISES), W, H)
  // inside exercise 2
  assert.equal(pickBlock(blocks, 300, 290), blocks[1])
  // just below exercise 2 (finger under the text)
  assert.equal(pickBlock(blocks, 300, 345), blocks[1])
  // to the left of exercise 1's first line
  assert.equal(pickBlock(blocks, 30, 88), blocks[0])
  // below exercise 3
  assert.equal(pickBlock(blocks, 200, 560), blocks[2])
})

// Printed lines: ruled (slightly tilted, as after an imperfect flatten), a red margin,
// or a full grid. They must not glue the exercises together.
function addRuling(g, w, h, { ruled = false, grid = false, tilt = 0.012 } = {}) {
  const set = (x, y, v) => {
    if (x >= 0 && y >= 0 && x < w && y < h) g[y * w + x] = Math.min(g[y * w + x], v)
  }
  if (ruled || grid) {
    for (let y0 = 20; y0 < h; y0 += 26) for (let x = 0; x < w; x++) for (let t = 0; t < 2; t++) set(x, Math.round(y0 + x * tilt) + t, 175)
  }
  if (ruled) for (let y = 0; y < h; y++) for (let t = 0; t < 2; t++) set(40 + t, y, 170)
  if (grid) for (let x0 = 13; x0 < w; x0 += 26) for (let y = 0; y < h; y++) set(x0, y, 180)
  return g
}

test('lined paper: ruled lines and margin do not merge the exercises', () => {
  const g = addRuling(makePage(W, H, EXERCISES), W, H, { ruled: true })
  const { blocks } = findBlocks(g, W, H)
  assert.equal(blocks.length, 3, JSON.stringify(blocks))
  assert.equal(pickBlock(blocks, 300, 345), blocks[1])
})

test('grid (squared) paper: grid lines do not merge the exercises', () => {
  const g = addRuling(makePage(W, H, EXERCISES), W, H, { grid: true })
  const { blocks } = findBlocks(g, W, H)
  assert.equal(blocks.length, 3, JSON.stringify(blocks))
})

test('ruled-line removal keeps short strokes like fraction bars', async () => {
  const { removeRuledLines } = await import('../server/vision/layout.js')
  const w = 400
  const h = 100
  const mask = new Uint8Array(w * h)
  for (let x = 0; x < w; x++) mask[50 * w + x] = 1 // ruled line across the page
  for (let x = 100; x < 140; x++) mask[30 * w + x] = 1 // fraction bar, 10% of width
  removeRuledLines(mask, w, h)
  let ruled = 0
  let bar = 0
  for (let x = 0; x < w; x++) ruled += mask[50 * w + x]
  for (let x = 100; x < 140; x++) bar += mask[30 * w + x]
  assert.ok(ruled < w * 0.1, `ruled line left: ${ruled}`)
  assert.equal(bar, 40)
})

test('empty page has no blocks', () => {
  const { blocks } = findBlocks(makePage(W, H, []), W, H)
  assert.equal(blocks.length, 0)
})
