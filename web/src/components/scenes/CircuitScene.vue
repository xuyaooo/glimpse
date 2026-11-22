<script setup lang="ts">
// A circuit: a battery (+ and −) pushing a current round a loop through resistors, in a row
// (series) or side by side (parallel); a bulb on the kid skin. Then the resistances and their
// total, V = I × R with the unknown picked out, and the current flowing: dots along the wire,
// faster for a bigger current (in parallel, more dots go through the easier branch).
import { computed } from 'vue'
import type { Scene } from '@/lib/types'

type Unknown = 'V' | 'I' | 'R'
const props = defineProps<{ scene: Scene; stage: number }>()
const s = computed(() => props.scene as Scene & { V: number; I: number; R: number; resistors: number[]; arrangement: 'single' | 'series' | 'parallel'; unknown: Unknown })
const show = computed(() => String(s.value.stages[props.stage]?.show ?? 'circuit'))
const kid = computed(() => s.value.skin === 'kid')
const grown = computed(() => s.value.skin === 'grown')
const ink = computed(() => (grown.value ? '#fff' : '#18294a'))
const flow = computed(() => show.value === 'flow')
// the answer's colour, lighter on the dark board
const teal = computed(() => (grown.value ? '#3fe0d0' : '#0f7f76'))

const SUP: Record<string, string> = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' }
const group = (t: string) => t.replace(/^(-?\d+)/, (d) => (d.replace('-', '').length > 4 ? d.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : d))
const fmt = (v: number) => {
  if (!Number.isFinite(v)) return '?'
  const a = Math.abs(v)
  if (a >= 1e9 || (a > 0 && a < 1e-4)) {
    const [m, e] = v.toExponential(3).split('e')
    return `${+m} × 10${[...String(+e)].map((c) => SUP[c] ?? c).join('')}`
  }
  return group(String(Math.round(v * 1e4) / 1e4))
}
const fit = (text: string, max: number, width: number) => Math.min(max, width / (Math.max(1, text.length) * 0.6))
const UNIT: Record<Unknown, string> = { V: 'V', I: 'A', R: 'Ω' }
const known = (k: Unknown) => k !== s.value.unknown || flow.value

const rs = computed(() => (Array.isArray(s.value.resistors) ? s.value.resistors.filter((r) => r > 0).slice(0, 6) : []))
const parallel = computed(() => s.value.arrangement === 'parallel' && rs.value.length > 1)
// the boxes to draw: the resistors, or one "R = ?" when the resistance is what we look for
const boxes = computed(() => (rs.value.length ? rs.value.map((r) => `${fmt(r)} Ω`) : [known('R') ? `${fmt(s.value.R)} Ω` : 'R = ?']))

// the loop
const L = 110
const RT = 530
const BOT = 296
const TOP = computed(() => (parallel.value ? 70 : 90))
const by = computed(() => (TOP.value + BOT) / 2)
// the battery's terminals (+ above, − below)
const plus = computed(() => by.value - (kid.value ? 48 : 10))
const minus = computed(() => by.value + (kid.value ? 40 : 10))

// in a row on the top wire
const series = computed(() => {
  const n = boxes.value.length
  const sp = 300 / n
  // long labels take turns above and below the wire, so each has room for two
  const stagger = boxes.value.some((label) => fit(label, 17, sp - 8) < 13)
  return boxes.value.map((label, k) => ({ k, label, cx: 170 + sp * (k + 0.5), w: Math.min(70, sp - 14), font: fit(label, 17, stagger ? 2 * sp - 10 : sp - 8), y: stagger && k % 2 ? TOP.value + 36 : TOP.value - 24 }))
})
// side by side, rungs between two bars
const BX0 = 230
const BX1 = 430
const rungs = computed(() => {
  const n = rs.value.length
  const gap = Math.min(56, 150 / Math.max(1, n - 1))
  return boxes.value.map((label, k) => ({ k, label, y: TOP.value + k * gap, h: Math.min(26, gap - 6), font: fit(label, 15, 70) }))
})
const wire = computed(() => {
  const t = TOP.value
  if (!parallel.value) return `M${L} ${plus.value} V${t} H${RT} V${BOT} H${L} V${minus.value}`
  const last = rungs.value[rungs.value.length - 1].y
  let d = `M${L} ${plus.value} V${t} H${RT} V${BOT} H${L} V${minus.value} M${BX0} ${t} V${last} M${BX1} ${t} V${last}`
  for (const r of rungs.value.slice(1)) d += ` M${BX0} ${r.y} H${BX1}`
  return d
})
const labelY = computed(() => (parallel.value ? (rungs.value[rungs.value.length - 1].y + BOT) / 2 + 6 : by.value + 6))

// the current: dots round the loop (a path relative to where each dot starts)
type P = [number, number]
const rel = (pts: P[]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${Math.round(x - pts[0][0])} ${Math.round(y - pts[0][1])}`).join(' ') + ' Z'
const length = (pts: P[]) => pts.reduce((t, p, i) => t + Math.hypot(p[0] - pts[(i + 1) % pts.length][0], p[1] - pts[(i + 1) % pts.length][1]), 0)
const loopDur = computed(() => Math.min(14, Math.max(1.6, 5.5 / Math.sqrt(Math.max(1e-6, s.value.I)))))
const streams = computed(() => {
  const t = TOP.value
  const outer = (inner: P[]): P[] => [[L, plus.value], [L, t], ...inner, [RT, t], [RT, BOT], [L, BOT], [L, minus.value]]
  const base = outer([])
  const speed = length(base) / loopDur.value
  const total = Math.max(10, Math.round(length(base) / 52))
  if (!parallel.value) return [{ k: 0, start: base[0], d: rel(base), dur: loopDur.value, n: total }]
  const conductance = rs.value.map((r) => 1 / r)
  const sum = conductance.reduce((a, b) => a + b, 0)
  return rungs.value.map((r, k) => {
    const pts = outer([[BX0, t], [BX0, r.y], [BX1, r.y], [BX1, t]])
    return { k, start: pts[0], d: rel(pts), dur: length(pts) / speed, n: Math.max(3, Math.round((total * conductance[k]) / sum)) }
  })
})

// the bits of text
const vText = computed(() => (known('V') ? `${fmt(s.value.V)} V` : '? V'))
const iText = computed(() => (known('I') ? `I = ${fmt(s.value.I)} A` : 'I = ?'))
const total = computed(() => {
  if (parallel.value) return `1/R = ${rs.value.map((r) => `1/${fmt(r)}`).join(' + ')}  →  R = ${fmt(s.value.R)} Ω`
  return `R = ${rs.value.map(fmt).join(' + ')} = ${fmt(s.value.R)} Ω`
})
const sum = computed(() => {
  const u = s.value.unknown
  return u === 'I' ? `I = ${fmt(s.value.V)} V ÷ ${fmt(s.value.R)} Ω` : u === 'V' ? `V = ${fmt(s.value.I)} A × ${fmt(s.value.R)} Ω` : `R = ${fmt(s.value.V)} V ÷ ${fmt(s.value.I)} A`
})
const answer = computed(() => `${s.value.unknown} = ${fmt(s.value[s.value.unknown])} ${UNIT[s.value.unknown]}`)
const TOKENS = ['V', '=', 'I', '×', 'R']
const pill = (text: string, f: number) => text.length * 0.6 * f + 40
</script>

<template>
  <svg viewBox="0 0 640 400" class="absolute inset-0 size-full" role="img" :aria-label="`Circuit: ${answer}`">
    <!-- the wires -->
    <path :d="wire" pathLength="1" fill="none" :stroke="ink" stroke-opacity="0.85" stroke-width="4" stroke-linejoin="round" stroke-linecap="round" class="scene-draw" />
    <g v-if="parallel" :fill="ink">
      <circle :cx="BX0" :cy="TOP" r="5" />
      <circle :cx="BX1" :cy="TOP" r="5" />
      <circle v-for="r in rungs.slice(1)" :key="r.k" :cx="BX0" :cy="r.y" r="4" />
      <circle v-for="r in rungs.slice(1)" :key="`b${r.k}`" :cx="BX1" :cy="r.y" r="4" />
    </g>

    <!-- the current: dots going round, from + to − -->
    <g v-if="flow">
      <g v-for="st in streams" :key="st.k">
        <circle v-for="j in st.n" :key="j" :cx="st.start[0]" :cy="st.start[1]" r="5" fill="#ffc93c" :stroke="grown ? 'none' : '#e0a21a'" stroke-width="1.5">
          <animateMotion :path="st.d" :dur="`${st.dur.toFixed(2)}s`" :begin="`${(-((j - 1) * st.dur) / st.n).toFixed(2)}s`" repeatCount="indefinite" />
        </circle>
      </g>
    </g>

    <!-- the battery -->
    <g class="scene-pop">
      <template v-if="kid">
        <rect :x="L - 8" :y="by - 48" width="16" height="10" rx="3" fill="#8a97ab" />
        <rect :x="L - 20" :y="by - 40" width="40" height="40" rx="8" fill="#f47a2a" />
        <rect :x="L - 20" :y="by - 4" width="40" height="44" rx="8" fill="#18294a" />
        <text :x="L" :y="by - 19" font-size="24" font-weight="900" fill="#fff" text-anchor="middle" dominant-baseline="central">+</text>
        <text :x="L" :y="by + 19" font-size="26" font-weight="900" fill="#fff" text-anchor="middle" dominant-baseline="central">−</text>
      </template>
      <template v-else>
        <line :x1="L - 24" :y1="by - 10" :x2="L + 24" :y2="by - 10" :stroke="ink" stroke-width="4" stroke-linecap="round" />
        <line :x1="L - 12" :y1="by + 10" :x2="L + 12" :y2="by + 10" :stroke="ink" stroke-width="9" />
        <text :x="L - 40" :y="by - 14" font-size="22" font-weight="900" fill="#f47a2a" text-anchor="middle" dominant-baseline="central">+</text>
        <text :x="L - 40" :y="by + 14" font-size="24" font-weight="900" :fill="ink" text-anchor="middle" dominant-baseline="central">−</text>
      </template>
      <text :key="vText" :x="L + 32" :y="by + 6" :font-size="fit(vText, 20, 84)" font-weight="900" :fill="s.unknown === 'V' ? (flow ? teal : '#f47a2a') : ink" :class="s.unknown === 'V' && flow ? 'scene-pop' : ''">{{ vText }}</text>
    </g>

    <!-- the resistors -->
    <template v-if="!parallel">
      <g v-for="b in series" :key="b.k" class="scene-pop" :style="{ animationDelay: `${0.3 + b.k * 0.15}s` }">
        <rect :x="b.cx - b.w / 2" :y="TOP - 13" :width="b.w" height="26" rx="6" :fill="kid ? '#ffe2b8' : grown ? '#0b1d28' : '#fff'" :stroke="show === 'resistors' ? '#ffc93c' : ink" :stroke-width="show === 'resistors' ? 5 : 3" style="transition: stroke 400ms" />
        <template v-if="kid">
          <rect v-for="(c, j) in ['#e5484d', '#7c5ce8', '#22a06b']" :key="c" :x="b.cx + (j - 1) * (b.w / 4) - 2.5" :y="TOP - 11" width="5" height="22" :fill="c" />
        </template>
        <text :key="b.label" :x="b.cx" :y="b.y" :font-size="b.font" font-weight="900" :fill="!rs.length ? (flow ? teal : '#f47a2a') : ink" text-anchor="middle" :class="!rs.length && flow ? 'scene-pop' : ''">{{ b.label }}</text>
      </g>
    </template>
    <template v-else>
      <g v-for="r in rungs" :key="r.k" class="scene-pop" :style="{ animationDelay: `${0.3 + r.k * 0.15}s` }">
        <rect :x="330 - 40" :y="r.y - r.h / 2" width="80" :height="r.h" rx="6" :fill="kid ? '#ffe2b8' : grown ? '#0b1d28' : '#fff'" :stroke="show === 'resistors' ? '#ffc93c' : ink" :stroke-width="show === 'resistors' ? 5 : 3" style="transition: stroke 400ms" />
        <text x="330" :y="r.y + 1" :font-size="Math.min(r.font, r.h - 6)" font-weight="900" :fill="kid ? '#18294a' : ink" text-anchor="middle" dominant-baseline="central">{{ r.label }}</text>
      </g>
    </template>

    <!-- the bulb: it lights up when the current flows -->
    <g v-if="kid" class="scene-pop" style="animation-delay: 0.6s">
      <circle v-if="flow" cx="320" :cy="BOT - 32" r="36" fill="#ffc93c" fill-opacity="0.35">
        <animate attributeName="r" values="30;40;30" dur="1.6s" repeatCount="indefinite" />
      </circle>
      <circle cx="320" :cy="BOT - 32" r="20" :fill="flow ? '#ffd34d' : '#fff'" stroke="#18294a" stroke-width="3" style="transition: fill 600ms" />
      <path :d="`M312 ${BOT - 28} L316 ${BOT - 38} L320 ${BOT - 28} L324 ${BOT - 38} L328 ${BOT - 28}`" fill="none" :stroke="flow ? '#f47a2a' : '#8a97ab'" stroke-width="2.5" stroke-linejoin="round" />
      <rect x="310" :y="BOT - 14" width="20" height="12" rx="3" fill="#8a97ab" stroke="#18294a" stroke-width="2" />
    </g>

    <!-- the current's arrow and its value -->
    <g class="scene-pop" style="animation-delay: 0.8s">
      <polygon :points="`${RT},${labelY + 6} ${RT - 9},${labelY - 12} ${RT + 9},${labelY - 12}`" fill="#ffc93c" :stroke="grown ? 'none' : '#e0a21a'" stroke-width="1.5" />
      <text :key="iText" :x="RT - 18" :y="labelY" :font-size="fit(iText, 20, 150)" font-weight="900" :fill="s.unknown === 'I' ? (flow ? teal : '#f47a2a') : ink" text-anchor="end" :class="s.unknown === 'I' && flow ? 'scene-pop' : ''">{{ iText }}</text>
    </g>

    <!-- underneath: the total resistance, the formula, the answer -->
    <g v-if="show === 'resistors'" class="scene-pop" style="animation-delay: 0.4s">
      <rect :x="320 - pill(total, fit(total, 24, 540)) / 2" y="330" :width="pill(total, fit(total, 24, 540))" height="46" rx="23" fill="#ffc93c" />
      <text x="320" y="354" :font-size="fit(total, 24, 540)" font-weight="900" fill="#18294a" text-anchor="middle" dominant-baseline="central">{{ total }}</text>
    </g>
    <g v-if="show === 'formula'">
      <g v-for="(t, k) in TOKENS" :key="t" class="scene-pop" :style="{ animationDelay: `${k * 0.12}s` }">
        <circle v-if="t === s.unknown" :cx="232 + k * 44" cy="340" r="25" fill="#ffc93c" />
        <text :x="232 + k * 44" y="341" font-size="38" font-weight="900" :fill="t === s.unknown ? '#18294a' : ink" text-anchor="middle" dominant-baseline="central">{{ t }}</text>
      </g>
      <text x="320" y="388" :font-size="fit(sum, 20, 560)" font-weight="800" fill="#f47a2a" text-anchor="middle" class="scene-pop" style="animation-delay: 0.7s">{{ sum }}</text>
    </g>
    <g v-if="flow" class="scene-pop" style="animation-delay: 0.3s">
      <rect :x="320 - pill(answer, fit(answer, 32, 400)) / 2" y="326" :width="pill(answer, fit(answer, 32, 400))" height="54" rx="27" fill="#0f7f76" />
      <text x="320" y="354" :font-size="fit(answer, 32, 400)" font-weight="900" fill="#fff" text-anchor="middle" dominant-baseline="central">{{ answer }}</text>
    </g>
  </svg>
</template>
