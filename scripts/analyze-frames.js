// Run paper detection offline on real frames recorded with "📸 Record test frames".
//   node scripts/analyze-frames.js debug-frames/<session>
// Writes <session>/analysis.jpg: one tile per frame with
//   yellow = what the app showed live, red = offline detection (as the app does it:
//   tracking + hands ignored), purple = hand outline from MediaPipe.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import jpeg from 'jpeg-js'
import { detectPaper } from '../server/vision/paperDetect.js'
import { handPolygon } from '../server/vision/gesture.js'

const dir = process.argv[2]
if (!dir) {
  console.error('usage: node scripts/analyze-frames.js debug-frames/<session>')
  process.exit(1)
}
const W = 320
const names = readdirSync(dir)
  .filter((f) => f.endsWith('.jpg') && f !== 'analysis.jpg')
  .sort()

function downscale(img, w) {
  const h = Math.round((img.height / img.width) * w)
  const out = new Uint8ClampedArray(w * h * 4)
  const sx = img.width / w
  const sy = img.height / h
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * sx)
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx))
      const y0 = Math.floor(y * sy)
      const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy))
      const acc = [0, 0, 0]
      let n = 0
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const p = (yy * img.width + xx) * 4
          acc[0] += img.data[p]
          acc[1] += img.data[p + 1]
          acc[2] += img.data[p + 2]
          n++
        }
      }
      const o = (y * w + x) * 4
      out[o] = acc[0] / n
      out[o + 1] = acc[1] / n
      out[o + 2] = acc[2] / n
      out[o + 3] = 255
    }
  }
  return { data: out, width: w, height: h }
}

function drawPoly(img, poly, color, close = true) {
  if (!poly) return
  const n = close ? poly.length : poly.length - 1
  for (let k = 0; k < n; k++) {
    const [x1, y1] = poly[k]
    const [x2, y2] = poly[(k + 1) % poly.length]
    const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) * 2) + 1
    for (let s = 0; s <= steps; s++) {
      const x = Math.round(x1 + ((x2 - x1) * s) / steps)
      const y = Math.round(y1 + ((y2 - y1) * s) / steps)
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]]) {
        const xx = x + dx
        const yy = y + dy
        if (xx < 0 || yy < 0 || xx >= img.width || yy >= img.height) continue
        const o = (yy * img.width + xx) * 4
        img.data[o] = color[0]
        img.data[o + 1] = color[1]
        img.data[o + 2] = color[2]
      }
    }
  }
}

const tiles = []
let prev
const rows = []
for (const name of names) {
  const meta = JSON.parse(readFileSync(path.join(dir, name.replace('.jpg', '.json')), 'utf8'))
  const small = downscale(jpeg.decode(readFileSync(path.join(dir, name)), { useTArray: true, formatAsRGBA: true }), W)
  const h = small.height
  const hands = (meta.hands || []).map((lm) => handPolygon(lm, W, h)).filter(Boolean)
  const t = performance.now()
  const det = detectPaper(small.data, W, h, { prev, ignore: hands })
  const ms = performance.now() - t
  const bare = detectPaper(small.data, W, h) // no tracking, hands not ignored
  prev = det?.quad ?? prev
  const live = meta.paperQuad?.map(([x, y]) => [x * W, y * h])
  const tile = { data: new Uint8ClampedArray(small.data), width: W, height: h }
  drawPoly(tile, live, [255, 210, 0])
  for (const hp of hands) drawPoly(tile, hp, [170, 90, 255])
  drawPoly(tile, det?.quad, [255, 40, 40])
  tiles.push(tile)
  const fmt = (q) => (q ? q.map((p) => p.map(Math.round).join(',')).join(' ') : '—')
  rows.push(
    `${name}  hands=${hands.length}  live=${live ? 'yes' : 'no '}  offline=${det ? `${det.source}/${det.score.toFixed(2)}` : 'none'}  bare=${bare ? bare.source : 'none'}  ${ms.toFixed(0)}ms  ${fmt(det?.quad)}`,
  )
}
console.log(rows.join('\n'))

// contact sheet: 4 columns
const cols = 4
const th = tiles[0]?.height || 180
const sheet = { width: W * cols, height: th * Math.ceil(tiles.length / cols), data: null }
sheet.data = new Uint8ClampedArray(sheet.width * sheet.height * 4).fill(20)
tiles.forEach((t, i) => {
  const ox = (i % cols) * W
  const oy = Math.floor(i / cols) * th
  for (let y = 0; y < t.height; y++) sheet.data.set(t.data.subarray(y * W * 4, (y + 1) * W * 4), ((oy + y) * sheet.width + ox) * 4)
})
const out = path.join(dir, 'analysis.jpg')
writeFileSync(out, jpeg.encode(sheet, 88).data)
console.log(`\nSaved ${out}  (yellow = live app, red = offline detection, purple = hands)`)
