<script setup lang="ts">
// Every graph animation, drawn from what the engine computed (scene.plot): the main curve,
// other curves (f', a second line), points (dots, holes), a tangent line, a shaded area, a
// level the curve approaches. Each overlay says at which step it appears (`when`), so the
// picture builds up as Glim tells it. Used for: area, graph, quadratic, limit, derivative, system.
import { computed } from 'vue'
import type { Scene } from '@/lib/types'

type Pt = [number, number | null]
interface Plot {
  points: Pt[]
  mainWhen?: string
  extra: { points: Pt[]; color: string; dash?: boolean; label?: string; when: string }[]
  markers: { x: number; y: number; kind: 'dot' | 'hole'; label?: string; color: string; when: string; delay?: number }[]
  tangent?: { x0: number; y0: number; m: number; when: string }
  region?: { a: number; b: number; value?: number; when: string }
  guide?: { y: number; when: string } | null
  bounds?: { x0: number; x1: number; y0?: number; y1?: number }
}
const props = defineProps<{ scene: Scene; stage: number }>()

// older recordings (history) have no `plot`: build it from their fields
const plot = computed<Plot>(() => {
  const s = props.scene as Scene & { plot?: Plot; points?: Pt[]; a?: number; b?: number; value?: number; roots?: number[]; y0?: number | null }
  if (s.plot) return s.plot
  return {
    points: s.points ?? [],
    extra: [],
    markers: [...(s.y0 !== null && s.y0 !== undefined ? [{ x: 0, y: s.y0, kind: 'dot' as const, label: `(0, ${s.y0})`, color: '#ffd34d', when: 'y0' }] : []), ...(s.roots ?? []).map((r) => ({ x: r, y: 0, kind: 'dot' as const, label: String(r), color: '#f47a2a', when: 'roots' }))],
    region: s.a !== undefined && s.b !== undefined ? { a: s.a, b: s.b, value: s.value, when: 'area' } : undefined,
  }
})

// what has been shown so far: the steps' `show` tokens up to now
const shown = computed(() => new Set(props.scene.stages.slice(0, props.stage + 1).map((st) => String(st.show ?? 'curve'))))
const has = (k?: string) => !k || shown.value.has(k) || (k === 'area' && shown.value.has('value'))

const M = { l: 50, r: 30, t: 30, b: 46 }
const W = 640
const H = 400
const box = computed(() => {
  const all = [plot.value.points, ...plot.value.extra.map((e) => e.points)].flat().filter((p): p is [number, number] => p[1] !== null)
  const xs = all.map((p) => p[0])
  const ys = [...plot.value.points.filter((p): p is [number, number] => p[1] !== null).map((p) => p[1]), ...plot.value.markers.map((m) => m.y)].sort((a, b) => a - b)
  let lo = ys[Math.floor(ys.length * 0.03)] ?? 0
  let hi = ys[Math.ceil(ys.length * 0.97) - 1] ?? 1
  for (const m of plot.value.markers) {
    lo = Math.min(lo, m.y)
    hi = Math.max(hi, m.y)
  }
  lo = Math.min(lo, 0)
  hi = Math.max(hi, 0)
  const pad = (hi - lo || 1) * 0.14
  const b = plot.value.bounds
  return { x0: b?.x0 ?? Math.min(...xs), x1: b?.x1 ?? Math.max(...xs), y0: b?.y0 ?? lo - pad, y1: b?.y1 ?? hi + pad }
})
const X = (x: number) => M.l + ((x - box.value.x0) / (box.value.x1 - box.value.x0 || 1)) * (W - M.l - M.r)
const Y = (y: number) => H - M.b - ((y - box.value.y0) / (box.value.y1 - box.value.y0 || 1)) * (H - M.t - M.b)
const inside = (y: number) => Y(y) > -200 && Y(y) < H + 200
const path = (pts: Pt[]) => {
  let d = ''
  let pen = false
  let lastY: number | null = null
  for (const [x, y] of pts) {
    // a jump (an asymptote) or a hole in the data: lift the pen
    if (y === null || !inside(y) || (lastY !== null && Math.abs(Y(y) - Y(lastY)) > H * 0.8)) {
      pen = false
      lastY = y
      continue
    }
    d += `${pen ? 'L' : 'M'}${X(x).toFixed(1)} ${Y(y).toFixed(1)} `
    pen = true
    lastY = y
  }
  return d
}
const main = computed(() => path(plot.value.points))
const region = computed(() => {
  const r = plot.value.region
  if (!r) return ''
  const lo = Math.min(r.a, r.b)
  const hi = Math.max(r.a, r.b)
  const pts = plot.value.points.filter(([x, y]) => x >= lo && x <= hi && y !== null && inside(y)) as [number, number][]
  if (!pts.length) return ''
  return `M${X(lo)} ${Y(0)} ${pts.map(([x, y]) => `L${X(x).toFixed(1)} ${Y(y).toFixed(1)}`).join(' ')} L${X(hi)} ${Y(0)} Z`
})
const tangent = computed(() => {
  const t = plot.value.tangent
  if (!t) return null
  const dx = (box.value.x1 - box.value.x0) * 0.22
  return { x1: X(t.x0 - dx), y1: Y(t.y0 - t.m * dx), x2: X(t.x0 + dx), y2: Y(t.y0 + t.m * dx), rise: { x: X(t.x0 + dx * 0.5), y0: Y(t.y0), y1: Y(t.y0 + t.m * dx * 0.5) } }
})
const zeroX = computed(() => (box.value.x0 <= 0 && box.value.x1 >= 0 ? X(0) : null))
const ticksX = computed(() => {
  const span = box.value.x1 - box.value.x0
  const step = [0.25, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 10000].find((t) => span / t <= 10) ?? 100000
  const out = []
  for (let v = Math.ceil(box.value.x0 / step) * step; v <= box.value.x1; v += step) out.push(+v.toFixed(2))
  return out
})
const fmt = (v: number) => (Number.isInteger(v) ? String(v) : String(+v.toFixed(3)))
const val = computed(() => {
  const r = plot.value.region
  return r && r.value != null && Number.isFinite(r.value) && has('value') ? r : null
})
</script>

<template>
  <svg viewBox="0 0 640 400" class="absolute inset-0 size-full" role="img" aria-label="Graph">
    <defs>
      <clipPath :id="`reveal-${scene.kind}`"><rect :x="M.l" y="0" :width="has(plot.region?.when) ? W : 0" :height="H" style="transition: width 1.6s ease-in-out" /></clipPath>
      <clipPath :id="`frame-${scene.kind}`"><rect :x="M.l - 4" :y="M.t - 20" :width="W - M.l - M.r + 8" :height="H - M.t - M.b + 24" /></clipPath>
      <linearGradient :id="`fill-${scene.kind}`" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3fe0d0" stop-opacity="0.75" /><stop offset="1" stop-color="#3fe0d0" stop-opacity="0.15" /></linearGradient>
    </defs>
    <!-- grid and axes -->
    <line v-for="t in ticksX" :key="t" :x1="X(t)" :y1="M.t" :x2="X(t)" :y2="H - M.b" stroke="#fff" stroke-opacity="0.07" />
    <line :x1="M.l" :y1="Y(0)" :x2="W - M.r" :y2="Y(0)" stroke="#fff" stroke-opacity="0.6" stroke-width="2" />
    <line v-if="zeroX !== null" :x1="zeroX" :y1="M.t" :x2="zeroX" :y2="H - M.b" stroke="#fff" stroke-opacity="0.6" stroke-width="2" />
    <text v-for="t in ticksX" :key="`l${t}`" :x="X(t)" :y="Math.min(H - 16, Y(0) + 22)" font-size="14" fill="#9fb3c8" text-anchor="middle">{{ fmt(t) }}</text>
    <!-- shaded area (integrals) -->
    <path v-if="region" :d="region" :fill="`url(#fill-${scene.kind})`" :clip-path="`url(#reveal-${scene.kind})`" />
    <template v-if="plot.region && has(plot.region.when)">
      <line v-for="v in [plot.region.a, plot.region.b]" :key="`b${v}`" :x1="X(v)" :y1="Y(0)" :x2="X(v)" :y2="M.t + 10" stroke="#ffd34d" stroke-width="2" stroke-dasharray="6 6" class="scene-pop" />
      <text v-for="v in [plot.region.a, plot.region.b]" :key="`bl${v}`" :x="X(v)" :y="M.t + 4" font-size="17" font-weight="900" fill="#ffd34d" text-anchor="middle" class="scene-pop">x = {{ fmt(v) }}</text>
    </template>
    <!-- the level a limit approaches -->
    <line v-if="plot.guide && has(plot.guide.when)" :x1="M.l" :y1="Y(plot.guide.y)" :x2="W - M.r" :y2="Y(plot.guide.y)" stroke="#3fe0d0" stroke-width="2" stroke-dasharray="8 6" class="scene-pop" />
    <g :clip-path="`url(#frame-${scene.kind})`">
    <!-- other curves (f', the second line) -->
    <template v-for="(e, i) in plot.extra" :key="`e${i}`">
      <path v-if="has(e.when)" :d="path(e.points)" pathLength="1" fill="none" :stroke="e.color" stroke-width="4" :stroke-dasharray="e.dash ? '0.012 0.01' : undefined" stroke-linecap="round" class="scene-draw" />
      <text v-if="has(e.when) && e.label" :x="W - M.r - 6" :y="M.t + 18 + i * 22" font-size="17" font-weight="900" :fill="e.color" text-anchor="end">{{ e.label }}</text>
    </template>
    <!-- the main curve -->
    <path v-if="has(plot.mainWhen)" :d="main" pathLength="1" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" class="scene-draw" />
    <!-- tangent line, with its slope as rise over run -->
    <g v-if="tangent && plot.tangent && has(plot.tangent.when)" class="scene-pop">
      <line :x1="tangent.x1" :y1="tangent.y1" :x2="tangent.x2" :y2="tangent.y2" stroke="#ffd34d" stroke-width="3.5" stroke-linecap="round" />
      <line :x1="X(plot.tangent.x0)" :y1="tangent.rise.y0" :x2="tangent.rise.x" :y2="tangent.rise.y0" stroke="#ffd34d" stroke-opacity="0.7" stroke-width="2" stroke-dasharray="5 5" />
      <line :x1="tangent.rise.x" :y1="tangent.rise.y0" :x2="tangent.rise.x" :y2="tangent.rise.y1" stroke="#ffd34d" stroke-opacity="0.7" stroke-width="2" stroke-dasharray="5 5" />
      <text :x="tangent.rise.x + 8" :y="(tangent.rise.y0 + tangent.rise.y1) / 2" font-size="16" font-weight="900" fill="#ffd34d" dominant-baseline="central">slope {{ fmt(plot.tangent.m) }}</text>
    </g>
    </g>
    <!-- points -->
    <template v-for="(m, i) in plot.markers" :key="`m${i}`">
      <g v-if="has(m.when) && inside(m.y)" class="scene-pop" :style="{ animationDelay: `${m.delay ?? 0}s` }">
        <circle :cx="X(m.x)" :cy="Y(m.y)" :r="m.kind === 'hole' ? 10 : 8" :fill="m.kind === 'hole' ? '#0b1d28' : m.color" :stroke="m.kind === 'hole' ? m.color : '#0b1d28'" stroke-width="3.5" />
        <text v-if="m.label" :x="X(m.x) + 12" :y="Y(m.y) - 14" font-size="16" font-weight="900" :fill="m.color">{{ m.label }}</text>
      </g>
    </template>
    <!-- the area's value -->
    <g v-if="val" class="scene-pop" style="animation-delay: 0.3s">
      <rect :x="(X(val.a) + X(val.b)) / 2 - 80" :y="Math.min(Y(0) - 70, H - 140)" width="160" height="50" rx="25" fill="#3fe0d0" />
      <text :x="(X(val.a) + X(val.b)) / 2" :y="Math.min(Y(0) - 70, H - 140) + 26" font-size="24" font-weight="900" fill="#0b1d28" text-anchor="middle" dominant-baseline="central">≈ {{ fmt(+(val.value ?? 0).toFixed(4)) }}</text>
    </g>
  </svg>
</template>
