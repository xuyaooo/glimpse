// Robust paper detection on synthetic webcam frames (see test/helpers/scenes.js and
// scripts/bench-paper.js for the full benchmark). Seeds 2000+ are not used for tuning.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectPaper } from '../server/vision/paperDetect.js'
import { scenario, renderScene, iou, handPolygon, CATEGORIES, NEGATIVE_CATEGORIES, rng } from './helpers/scenes.js'

const SEEDS = [2000, 2001, 2002, 2003, 2004, 2005]
let good = 0
let total = 0

for (const cat of CATEGORIES) {
  test(`paper found: ${cat}`, () => {
    let ok = 0
    for (const seed of SEEDS) {
      const s = renderScene(scenario(cat, seed))
      // like the app: the hand outline (from MediaPipe) is ignored
      const d = detectPaper(s.rgba, s.w, s.h, s.hand ? { ignore: [handPolygon(s.hand)] } : {})
      const v = d ? iou(s.quad, d.quad, s.w, s.h) : 0
      if (v >= 0.85) ok++
      if (v >= 0.95) good++
      total++
    }
    // The two hardest cases (benchmark: ~85-90% on 40 unseen scenes) need 4 of 6.
    const need = cat === 'grid paper on white' || cat === 'hand on paper' ? 4 : 5
    assert.ok(ok >= need, `${cat}: only ${ok}/${SEEDS.length} found (IoU >= 0.85)`)
  })
}

test('overall: at least 90% of frames are "good" (IoU >= 0.95)', () => {
  assert.ok(total > 0)
  assert.ok(good / total >= 0.9, `good ${good}/${total}`)
})

for (const cat of NEGATIVE_CATEGORIES) {
  test(`no false alarm: ${cat}`, () => {
    for (const seed of SEEDS) {
      const s = renderScene(scenario(cat, seed))
      assert.equal(detectPaper(s.rgba, s.w, s.h), null, `seed ${seed}`)
    }
  })
}

test('tracking: last frame as a hint + hand ignored keeps the paper', () => {
  let ok = 0
  for (const seed of SEEDS) {
    const s = renderScene(scenario('hand on paper', seed))
    const r = rng(seed)
    const prev = s.quad.map(([x, y]) => [x + (r() - 0.5) * 3, y + (r() - 0.5) * 3]) // slightly off
    const d = detectPaper(s.rgba, s.w, s.h, { prev, ignore: [handPolygon(s.hand)] })
    if (d && iou(s.quad, d.quad, s.w, s.h) >= 0.9) ok++
  }
  assert.ok(ok >= 5, `${ok}/${SEEDS.length}`)
})

test('fast enough for live video (< 25 ms per 320x180 frame on average)', () => {
  const scenes = ['white table', 'clutter', 'lined paper'].map((c) => renderScene(scenario(c, 2100)))
  const t = performance.now()
  for (let i = 0; i < 5; i++) for (const s of scenes) detectPaper(s.rgba, s.w, s.h)
  const ms = (performance.now() - t) / 15
  assert.ok(ms < 25, `${ms.toFixed(1)} ms`)
})

test('without the hand outline, a hand on the edge is harder (documents why the app passes it)', () => {
  let withMask = 0
  let without = 0
  for (const seed of SEEDS) {
    const s = renderScene(scenario('hand on paper', seed))
    const a = detectPaper(s.rgba, s.w, s.h, { ignore: [handPolygon(s.hand)] })
    const b = detectPaper(s.rgba, s.w, s.h)
    if (a && iou(s.quad, a.quad, s.w, s.h) >= 0.9) withMask++
    if (b && iou(s.quad, b.quad, s.w, s.h) >= 0.9) without++
  }
  assert.ok(withMask >= without, `with ${withMask} vs without ${without}`)
})
