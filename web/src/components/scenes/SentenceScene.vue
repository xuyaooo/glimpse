<script setup lang="ts">
// Sentences: the sentence as written (in pencil); then one fix at a time, the word crossed out
// and the right one written above it (and the end mark); then the corrected sentence with a tick.
import { computed } from 'vue'
import type { Scene } from '@/lib/types'

type Word = { w: string; fixed?: string; why?: string | null }
type Fix = { at?: number; word?: string; fixed?: string; end?: string; what?: string }
type Tok = { old: string; neu: string; drop: boolean; fix: number; at: number }
const props = defineProps<{ scene: Scene; stage: number }>()
const s = computed(() => props.scene as Scene & { original: string; corrected: string; words: Word[]; end: string; ending: string; fixes: Fix[] })
const show = computed(() => String(s.value.stages[props.stage]?.show ?? 'original'))
const kid = computed(() => s.value.skin === 'kid')
const grown = computed(() => s.value.skin === 'grown')
const ink = computed(() => (grown.value ? '#fff' : '#18294a'))
const GREEN = computed(() => (grown.value ? '#4cd38f' : '#22a06b'))
const RED = '#e5484d'

// The words as written, with the fix that changes each one: duplicated words (removed by the
// engine) come back from the original sentence so they can be crossed out.
const model = computed(() => {
  const fixes = (Array.isArray(s.value.fixes) ? s.value.fixes : []).filter(Boolean)
  const words = (Array.isArray(s.value.words) ? s.value.words : [])
    .filter((x) => x && typeof x.w === 'string' && x.w)
    .map((x) => ({ w: x.w, fixed: typeof x.fixed === 'string' && x.fixed ? x.fixed : x.w, why: x.why ?? null }))
  const toks = String(s.value.original ?? '').replace(/[.!?]+$/, '').split(' ').filter(Boolean)
  const removed = new Set(fixes.filter((f) => Number.isInteger(f.at) && (f.at as number) < toks.length).map((f) => f.at as number))
  let list: Tok[]
  if (toks.length - removed.size === words.length) {
    let k = 0
    list = toks.map((t, j) => {
      if (removed.has(j)) return { old: t, neu: '', drop: true, fix: -1, at: j }
      const x = words[k++]
      return { old: x.w, neu: x.fixed, drop: false, fix: -1, at: j }
    })
  } else list = words.map((x, j) => ({ old: x.w, neu: x.fixed, drop: false, fix: -1, at: j }))
  // word fixes come in the order of the words that have a reason
  const why = words.map((x, j) => (x.why ? j : -1)).filter((j) => j >= 0)
  const kept = list.filter((t) => !t.drop)
  let m = 0
  fixes.forEach((f, q) => {
    if (Number.isInteger(f.at)) {
      const t = list.find((x) => x.drop && x.at === f.at)
      if (t) t.fix = q
    } else if (typeof f.end !== 'string') {
      const t = kept.length === words.length ? kept[why[m]] : undefined
      if (t) t.fix = q
      m++
    }
  })
  const endFix = fixes.findIndex((f) => typeof f.end === 'string')
  const endOld = String(s.value.ending ?? '')
  const endNew = String(s.value.end ?? '') || endOld
  return { list, endFix, endOld, endNew }
})
// which fix this step shows (-1 before the first one)
const cur = computed(() => {
  if (show.value === 'done') return Number.MAX_SAFE_INTEGER
  if (show.value !== 'fix') return -1
  return s.value.stages.slice(0, props.stage).filter((x) => x?.show === 'fix').length
})
const state = (fix: number) => (fix < 0 || fix > cur.value ? 'plain' : fix === cur.value ? 'now' : 'done')

// The advance width of each character (hundredths of an em) in the app's fonts, measured in the
// browser: Kalam 400 (pencil), Caveat 700 (marker), Nunito 900 (clean). Enough to lay out lines.
const CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.,!?'’;: -"
const WIDTHS = [
  [47, 53, 45, 50, 45, 38, 47, 54, 24, 25, 47, 24, 80, 53, 45, 48, 47, 33, 43, 39, 48, 42, 67, 43, 47, 44, 61, 64, 60, 65, 58, 52, 61, 67, 31, 47, 59, 55, 79, 68, 61, 54, 64, 58, 53, 54, 60, 53, 78, 62, 57, 62, 24, 23, 37, 52, 14, 29, 31, 25, 40, 46],
  [45, 45, 36, 40, 33, 31, 36, 48, 21, 23, 38, 19, 58, 46, 36, 38, 38, 36, 35, 35, 37, 34, 52, 36, 35, 34, 51, 52, 49, 59, 53, 47, 50, 57, 41, 32, 50, 41, 73, 57, 51, 47, 49, 50, 49, 46, 48, 49, 72, 52, 48, 52, 20, 20, 21, 38, 12, 12, 20, 20, 24, 33],
  [57, 62, 48, 62, 56, 40, 63, 61, 28, 29, 58, 35, 90, 61, 60, 62, 62, 43, 50, 43, 60, 54, 87, 57, 54, 49, 76, 70, 69, 79, 61, 58, 75, 79, 31, 39, 71, 58, 88, 76, 81, 68, 81, 71, 65, 64, 75, 74, 113, 70, 70, 62, 27, 27, 27, 48, 27, 27, 27, 27, 29, 45],
]
const PENCIL = 0
const MARKER = 1
const CLEAN = 2
// a little wider than measured, to be safe
const est = (t: string, fs: number, font: number) => ([...t].reduce((a, c) => a + (WIDTHS[font][CHARS.indexOf(c)] ?? 65), 0) / 100) * fs * 1.05
function wrap(widths: number[], space: number, maxW: number) {
  const lines: number[][] = [[]]
  let w = 0
  widths.forEach((tw, i) => {
    const line = lines[lines.length - 1]
    const need = line.length ? w + space + tw : tw
    if (line.length && need > maxW) {
      lines.push([i])
      w = tw
    } else {
      line.push(i)
      w = need
    }
  })
  return lines.filter((l) => l.length)
}
function place(widths: number[], sizes: number[], lineH: (fs: number) => number, maxH: number, endW: (fs: number) => number, space: number) {
  for (const fs of sizes) {
    const ws = widths.map((w, i) => w * fs + (i === widths.length - 1 ? endW(fs) : 0))
    const lines = wrap(ws, space * fs, 580)
    const fits = lines.every((l) => l.reduce((a, i) => a + ws[i], 0) + (l.length - 1) * space * fs <= 580)
    if ((fits && lines.length * lineH(fs) <= maxH) || fs === sizes[sizes.length - 1]) {
      const boxes: { x: number; w: number; line: number }[] = []
      lines.forEach((l, r) => {
        const lw = l.reduce((a, i) => a + ws[i], 0) + (l.length - 1) * space * fs
        let x = 320 - lw / 2
        l.forEach((i) => {
          boxes[i] = { x, w: ws[i], line: r }
          x += ws[i] + space * fs
        })
      })
      return { fs, boxes, lines: lines.length }
    }
  }
  return { fs: 18, boxes: [] as { x: number; w: number; line: number }[], lines: 0 }
}

// ---- the sentence as written, with room above each word for its correction
const written = computed(() => {
  const { list, endOld, endNew } = model.value
  const unit = list.map((t) => Math.max(est(t.old, 1, PENCIL), est(t.neu, 1, MARKER)))
  const endW = (fs: number) => Math.max(est(endOld, fs, PENCIL), est(endNew, fs, MARKER), fs * 0.3) + fs * 0.1
  const p = place(unit, [50, 46, 42, 38, 35, 32, 29, 26, 23, 20, 18], (fs) => fs * 2.2, 290, endW, 0.42)
  const H = p.lines * p.fs * 2.2
  const top = 196 - H / 2
  const toks = list.map((t, i) => {
    const b = p.boxes[i] ?? { x: 320, w: 0, line: 0 }
    const oldW = est(t.old, p.fs, PENCIL)
    const w = i === list.length - 1 ? b.w - endW(p.fs) : b.w
    return { ...t, i, cx: b.x + w / 2, oldW, w, x: b.x, base: top + b.line * p.fs * 2.2 + p.fs * 1.7 }
  })
  const last = toks[toks.length - 1]
  const end = last ? { x: last.cx + last.oldW / 2 + p.fs * 0.06, base: last.base } : { x: 320, base: 200 }
  const xs = toks.map((t) => [t.x, t.x + t.w]).flat()
  const x0 = Math.min(320, ...xs)
  const x1 = Math.max(320, ...xs, end.x + endW(p.fs))
  return { fs: p.fs, toks, end, top, H, x0, x1 }
})
const endState = computed(() => state(model.value.endFix))

// ---- the corrected sentence
const clean = computed(() => {
  const kept = model.value.list.filter((t) => !t.drop)
  const endNew = model.value.endNew
  const unit = kept.map((t) => est(t.neu, 1, CLEAN))
  const endW = (fs: number) => est(endNew, fs, CLEAN) + fs * 0.05
  const p = place(unit, [52, 48, 44, 40, 36, 32, 29, 26, 23, 20, 18], (fs) => fs * 1.45, 220, endW, 0.3)
  const H = p.lines * p.fs * 1.45
  const top = 168 - H / 2
  const toks = kept.map((t, i) => {
    const b = p.boxes[i] ?? { x: 320, w: 0, line: 0 }
    const w = est(t.neu, p.fs, CLEAN)
    return { ...t, i, x: b.x, w, changed: t.neu !== t.old, base: top + b.line * p.fs * 1.45 + p.fs * 1.08 }
  })
  const last = toks[toks.length - 1]
  return { fs: p.fs, toks, end: last ? { x: last.x + last.w + p.fs * 0.04, base: last.base } : { x: 320, base: 168 }, top, H }
})
const tickAt = computed(() => 0.4 + clean.value.toks.length * 0.06)
</script>

<template>
  <svg viewBox="0 0 640 400" class="absolute inset-0 size-full" role="img" :aria-label="show === 'done' ? String(s.corrected ?? '') : String(s.original ?? '')">
    <!-- as written, then fixed one by one -->
    <g v-if="show !== 'done'" key="written">
      <rect v-if="kid" :x="written.x0 - 22" :y="written.top - 14" :width="written.x1 - written.x0 + 44" :height="written.H + 28" rx="24" fill="#fff" fill-opacity="0.85" />
      <g v-for="t in written.toks" :key="t.at">
        <rect v-if="state(t.fix) === 'now'" :key="`hl${cur}`" :x="t.cx - Math.max(t.w, written.fs * 0.7) / 2 - 6" :y="t.base - written.fs * 1.85" :width="Math.max(t.w, written.fs * 0.7) + 12" :height="written.fs * 2.15" rx="12" fill="#ffc93c" :fill-opacity="grown ? 0.16 : 0.55" :stroke="grown ? '#ffc93c' : 'none'" stroke-width="2.5" class="scene-pop" />
        <text :x="t.cx" :y="t.base" :font-size="written.fs" font-weight="400" :fill="state(t.fix) === 'now' ? RED : ink" :fill-opacity="state(t.fix) === 'done' ? 0.45 : 1" text-anchor="middle" class="font-pencil" :class="show === 'original' ? 'scene-pop' : ''" :style="{ animationDelay: `${t.i * 0.08}s`, transition: 'fill 400ms, fill-opacity 400ms' }">{{ t.old }}</text>
        <template v-if="state(t.fix) !== 'plain'">
          <line :key="`x${state(t.fix)}`" :x1="t.cx - t.oldW / 2 - 3" :x2="t.cx + t.oldW / 2 + 3" :y1="t.base - written.fs * 0.3" :y2="t.base - written.fs * 0.3" pathLength="1" :stroke="state(t.fix) === 'now' ? RED : ink" :stroke-opacity="state(t.fix) === 'now' ? 1 : 0.45" stroke-width="4" stroke-linecap="round" :class="state(t.fix) === 'now' ? 'scene-draw' : ''" style="animation-delay: 0.3s" />
          <text v-if="t.neu && !t.drop" :key="`n${state(t.fix)}`" :x="t.cx" :y="t.base - written.fs * 1.05" :font-size="written.fs * 0.95" font-weight="700" :fill="GREEN" text-anchor="middle" class="font-marker" :class="state(t.fix) === 'now' ? 'scene-pop' : ''" style="animation-delay: 0.7s">{{ t.neu }}</text>
        </template>
      </g>
      <!-- the end mark -->
      <g v-if="written.toks.length">
        <rect v-if="endState === 'now'" :key="`hle${cur}`" :x="written.end.x - 8" :y="written.end.base - written.fs * 1.85" :width="Math.max(written.fs * 0.6, Math.max(model.endOld.length, model.endNew.length) * written.fs * 0.4) + 16" :height="written.fs * 2.15" rx="12" fill="#ffc93c" :fill-opacity="grown ? 0.16 : 0.55" :stroke="grown ? '#ffc93c' : 'none'" stroke-width="2.5" class="scene-pop" />
        <template v-if="endState === 'plain' || model.endOld">
          <text :x="written.end.x" :y="written.end.base" :font-size="written.fs" font-weight="400" :fill="endState === 'now' ? RED : ink" :fill-opacity="endState === 'done' ? 0.45 : 1" class="font-pencil">{{ model.endOld }}</text>
          <template v-if="endState !== 'plain'">
            <line :x1="written.end.x - 2" :x2="written.end.x + Math.max(written.fs * 0.3, model.endOld.length * written.fs * 0.32) + 2" :y1="written.end.base - written.fs * 0.3" :y2="written.end.base - written.fs * 0.3" pathLength="1" :stroke="endState === 'now' ? RED : ink" :stroke-opacity="endState === 'now' ? 1 : 0.45" stroke-width="4" stroke-linecap="round" :class="endState === 'now' ? 'scene-draw' : ''" style="animation-delay: 0.3s" />
            <text :x="written.end.x" :y="written.end.base - written.fs * 1.05" :font-size="written.fs * 1.05" font-weight="700" :fill="GREEN" class="font-marker" :class="endState === 'now' ? 'scene-pop' : ''" style="animation-delay: 0.7s">{{ model.endNew }}</text>
          </template>
        </template>
        <text v-else :x="written.end.x" :y="written.end.base" :font-size="written.fs * 1.15" font-weight="700" :fill="GREEN" class="font-marker" :class="endState === 'now' ? 'scene-pop' : ''" style="animation-delay: 0.4s">{{ model.endNew }}</text>
      </g>
    </g>

    <!-- the corrected sentence, and a tick -->
    <g v-else key="done">
      <rect v-if="kid" x="30" :y="clean.top - 16" width="580" :height="clean.H + 32" rx="24" fill="#fff" fill-opacity="0.85" />
      <g v-for="t in clean.toks" :key="t.at" class="scene-pop" :style="{ animationDelay: `${t.i * 0.06}s` }">
        <text :x="t.x + t.w / 2" :y="t.base" :font-size="clean.fs" font-weight="900" :fill="t.changed ? GREEN : ink" text-anchor="middle">{{ t.neu }}</text>
        <line v-if="t.changed" :x1="t.x" :x2="t.x + t.w" :y1="t.base + clean.fs * 0.18" :y2="t.base + clean.fs * 0.18" :stroke="GREEN" stroke-width="4" stroke-linecap="round" />
      </g>
      <text v-if="clean.toks.length" :x="clean.end.x" :y="clean.end.base" :font-size="clean.fs" font-weight="900" :fill="model.endFix >= 0 ? GREEN : ink" class="scene-pop" :style="{ animationDelay: `${clean.toks.length * 0.06}s` }">{{ model.endNew }}</text>
      <g class="scene-pop" :style="{ animationDelay: `${tickAt}s` }">
        <circle cx="320" cy="328" r="32" :fill="GREEN" />
        <path d="M305 329 l10 10 l21 -22" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" />
      </g>
      <template v-if="kid">
        <text x="262" y="330" font-size="36" text-anchor="middle" dominant-baseline="central" class="scene-pop" :style="{ animationDelay: `${tickAt + 0.3}s` }">⭐</text>
        <text x="378" y="330" font-size="36" text-anchor="middle" dominant-baseline="central" class="scene-pop" :style="{ animationDelay: `${tickAt + 0.45}s` }">⭐</text>
      </template>
    </g>
  </svg>
</template>
