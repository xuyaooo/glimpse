// Paper-detection benchmark on synthetic webcam frames.
//   node scripts/bench-paper.js [scenesPerCategory=30] [firstSeed=1]
// Compares the old bright-region method with the new edge/line method.
import { detectPaperRegion } from '../server/vision/paper.js'
import { detectPaper } from '../server/vision/paperDetect.js'
import { scenario, renderScene, iou, handPolygon, CATEGORIES, NEGATIVE_CATEGORIES } from '../test/helpers/scenes.js'

const N = Number(process.argv[2] || 30)
const FIRST = Number(process.argv[3] || 1) // first random seed (use a new range to test on unseen scenes)
const methods = {
  old: (s) => detectPaperRegion(s.rgba, s.w, s.h),
  // The app passes the hand outline from MediaPipe; scenes with a hand do the same here.
  new: (s) => detectPaper(s.rgba, s.w, s.h, s.hand ? { ignore: [handPolygon(s.hand)] } : {}),
}

const pad = (v, n) => String(v).padEnd(n)
const pct = (a, b) => `${Math.round((100 * a) / b)}%`.padStart(5)
console.log(`${N} scenes per category, 320x180 analysis frames. "good" = IoU >= 0.95, "ok" = IoU >= 0.85.\n`)
console.log(`${pad('category', 26)}| old good  ok  | new good  ok  | new IoU | new ms`)
console.log('-'.repeat(78))
const totals = { old: { good: 0, ok: 0 }, new: { good: 0, ok: 0 }, n: 0, ms: 0 }
for (const cat of CATEGORIES) {
  const res = { old: { good: 0, ok: 0 }, new: { good: 0, ok: 0, iou: 0, ms: 0 } }
  for (let seed = FIRST; seed < FIRST + N; seed++) {
    const scene = renderScene(scenario(cat, seed))
    for (const [name, fn] of Object.entries(methods)) {
      const t = performance.now()
      const det = fn(scene)
      const ms = performance.now() - t
      const score = det ? iou(scene.quad, det.quad, scene.w, scene.h) : 0
      if (score >= 0.95) res[name].good++
      if (score >= 0.85) res[name].ok++
      if (name === 'new') {
        res.new.iou += score
        res.new.ms += ms
      }
    }
  }
  for (const m of ['old', 'new']) {
    totals[m].good += res[m].good
    totals[m].ok += res[m].ok
  }
  totals.n += N
  totals.ms += res.new.ms
  console.log(
    `${pad(cat, 26)}| ${pct(res.old.good, N)} ${pct(res.old.ok, N)} | ${pct(res.new.good, N)} ${pct(res.new.ok, N)} |  ${(res.new.iou / N).toFixed(3)}  | ${(res.new.ms / N).toFixed(1)}`,
  )
}
console.log('-'.repeat(78))
console.log(
  `${pad('ALL', 26)}| ${pct(totals.old.good, totals.n)} ${pct(totals.old.ok, totals.n)} | ${pct(totals.new.good, totals.n)} ${pct(totals.new.ok, totals.n)} |         | ${(totals.ms / totals.n).toFixed(1)}`,
)

console.log('\nFalse alarms on frames WITHOUT paper (lower is better):')
for (const cat of NEGATIVE_CATEGORIES) {
  const fa = { old: 0, new: 0 }
  for (let seed = FIRST; seed < FIRST + N; seed++) {
    const scene = renderScene(scenario(cat, seed))
    for (const [name, fn] of Object.entries(methods)) if (fn(scene)) fa[name]++
  }
  console.log(`${pad(cat, 26)}| old ${pct(fa.old, N)} | new ${pct(fa.new, N)}`)
}
