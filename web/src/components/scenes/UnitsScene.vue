<script setup lang="ts">
// Units: the units of one quantity as a staircase, the biggest at the top. One step down is a
// smaller unit, so there are more of them (×10, ×1000, ×60); one step up is a bigger unit (÷).
// The value walks from its unit to the new one (a frog hops it on the kid skin), then the answer.
import { computed, nextTick, ref, watch } from 'vue'
import type { Scene } from '@/lib/types'

const props = defineProps<{ scene: Scene; stage: number }>()
const s = computed(() => props.scene as Scene & { quantity: string; value: number; from: string; to: string; factor: number; result: number; ladder: string[] })
const show = computed(() => String(s.value.stages[props.stage]?.show ?? 'ladder'))
const kid = computed(() => s.value.skin === 'kid')
const ink = computed(() => (s.value.skin === 'grown' ? '#fff' : '#18294a'))
// the marker blue, lighter on the dark board
const blue = computed(() => (s.value.skin === 'grown' ? '#8fb8ff' : '#1f5fd6'))
const svg = ref<SVGSVGElement | null>(null)
// the hops start from the first step each time a step of the explanation begins
watch(
  () => props.stage,
  () => nextTick(() => svg.value?.setCurrentTime?.(0)),
)

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

// how many of the base unit there are in each unit (as in the engine)
const SIZE: Record<string, number> = { mm: 0.001, cm: 0.01, dm: 0.1, m: 1, km: 1000, mg: 0.001, g: 1, kg: 1000, t: 1e6, ml: 0.001, cl: 0.01, dl: 0.1, l: 1, s: 1, min: 60, h: 3600, day: 86400 }
const NAME: Record<string, string> = { ml: 'mL', cl: 'cL', dl: 'dL', l: 'L' }
const name = (u: string) => NAME[u] ?? String(u)
const EMOJI: Record<string, string> = { length: '📏', mass: '⚖️', capacity: '🥛', time: '⏰' }

const ladder = computed(() => {
  const l = Array.isArray(s.value.ladder) ? s.value.ladder.slice(0, 6) : []
  if (l.includes(s.value.from) && l.includes(s.value.to)) return l
  return s.value.factor >= 1 ? [s.value.from, s.value.to] : [s.value.to, s.value.from]
})
const n = computed(() => ladder.value.length)
const iFrom = computed(() => ladder.value.indexOf(s.value.from))
const iTo = computed(() => ladder.value.indexOf(s.value.to))
const down = computed(() => iTo.value > iFrom.value)
const lo = computed(() => Math.min(iFrom.value, iTo.value))
const hi = computed(() => Math.max(iFrom.value, iTo.value))
// one step down the stairs: × this
const stepFactor = (i: number) => {
  const a = SIZE[ladder.value[i]]
  const b = SIZE[ladder.value[i + 1]]
  if (a && b) return Math.round(a / b)
  const f = s.value.factor >= 1 ? s.value.factor : 1 / s.value.factor
  return n.value === 2 && Number.isFinite(f) ? Math.round(f * 1e4) / 1e4 : null
}

// the staircase
const X0 = 60
const W = 520
const FLOOR = 340
const w = computed(() => W / n.value)
const rise = computed(() => Math.min(56, 180 / Math.max(1, n.value - 1)))
const stepX = (i: number) => X0 + i * w.value
const top = (i: number) => 84 + i * rise.value
const centre = (i: number) => stepX(i) + w.value / 2
const inRange = (i: number) => i >= lo.value && i <= hi.value
const stepFill = (i: number) => (i === iFrom.value ? '#f47a2a' : i === iTo.value ? '#0f7f76' : inRange(i) ? '#ffc93c' : ink.value)
const stepOpacity = (i: number) => (i === iFrom.value || i === iTo.value ? 1 : inRange(i) ? 0.55 : s.value.skin === 'grown' ? 0.14 : 0.1)
const labelFill = (i: number) => (i === iFrom.value || i === iTo.value ? '#fff' : ink.value)

// the hop between step i and step i+1: a curve over the edge, its label at the top
const arc = (i: number) => {
  const a = { x: stepX(i) + w.value * 0.62, y: top(i) - 6 }
  const b = { x: stepX(i + 1) + w.value * 0.38, y: top(i + 1) - 6 }
  const c = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - 34 }
  const peak = 0.25 * a.y + 0.5 * c.y + 0.25 * b.y
  return { a, b, c, peak }
}
const arcs = computed(() =>
  Array.from({ length: n.value - 1 }, (_, i) => {
    const { a, b, c, peak } = arc(i)
    const used = i >= lo.value && i < hi.value
    const forward = !used || down.value
    const [p, q] = forward ? [a, b] : [b, a]
    // the arrow head at the end, along the curve
    const ang = Math.atan2(q.y - c.y, q.x - c.x)
    const head = [0, 2.5, -2.5].map((d, k) => (k === 0 ? [q.x, q.y] : [q.x - 13 * Math.cos(ang + d * 0.2), q.y - 13 * Math.sin(ang + d * 0.2)]))
    const f = stepFactor(i)
    const order = down.value ? i - lo.value : hi.value - 1 - i
    return { i, d: `M${p.x} ${p.y} Q${c.x} ${c.y} ${q.x} ${q.y}`, head: head.map((h) => h.join(',')).join(' '), x: c.x, y: peak - 9, label: f === null ? '' : `${used && !down.value ? '÷' : '×'}${fmt(f)}`, used, order }
  }),
)
const used = computed(() => arcs.value.filter((a) => a.used))
const total = computed(() => {
  const f = s.value.factor >= 1 ? s.value.factor : 1 / s.value.factor
  const op = s.value.factor >= 1 ? '×' : '÷'
  const one = `${op}${fmt(f)}`
  const parts = used.value.map((a) => a.label)
  return parts.length > 1 && parts.every(Boolean) ? `${(down.value ? parts : [...parts].reverse()).join(' ')} = ${one}` : one
})
const totalSize = computed(() => Math.min(24, 380 / (total.value.length * 0.6)))

// the frog: from the first step to the last, hop by hop (a path relative to where it sits)
const seat = (i: number) => ({ x: centre(i), y: top(i) - 4 })
const hops = computed(() => {
  const order = down.value ? Array.from({ length: hi.value - lo.value + 1 }, (_, k) => lo.value + k) : Array.from({ length: hi.value - lo.value + 1 }, (_, k) => hi.value - k)
  const o = seat(order[0])
  let d = 'M0 0'
  for (let k = 1; k < order.length; k++) {
    const p = seat(order[k - 1])
    const q = seat(order[k])
    d += ` Q${(p.x + q.x) / 2 - o.x} ${Math.min(p.y, q.y) - 58 - o.y} ${q.x - o.x} ${q.y - o.y}`
  }
  return { d, count: order.length - 1 }
})
const frogAt = computed(() => seat(show.value === 'result' ? iTo.value : iFrom.value))

// a number on a step: its unit at the top, the amount under it
const amount = (i: number) => (i === iFrom.value ? fmt(s.value.value) : i === iTo.value ? (show.value === 'result' ? fmt(s.value.result) : '?') : '')
const amountSize = (t: string) => Math.min(17, (w.value - 12) / (Math.max(1, t.length) * 0.6))

// the answer: two pills, the value before and after
const left = computed(() => `${fmt(s.value.value)} ${name(s.value.from)}`)
const right = computed(() => `${fmt(s.value.result)} ${name(s.value.to)}`)
const bigFont = computed(() => Math.min(40, 430 / ((left.value.length + right.value.length) * 0.6)))
const pillW = (t: string) => t.length * 0.6 * bigFont.value + 34
const answer = computed(() => {
  const gap = 96
  const wl = pillW(left.value)
  const wr = pillW(right.value)
  const x = 320 - (wl + gap + wr) / 2
  return { lx: x, wl, ax: x + wl + gap / 2, rx: x + wl + gap, wr }
})
const op = computed(() => (s.value.factor >= 1 ? `× ${fmt(s.value.factor)}` : `÷ ${fmt(1 / s.value.factor)}`))
</script>

<template>
  <svg ref="svg" viewBox="0 0 640 400" class="absolute inset-0 size-full" role="img" :aria-label="`${fmt(s.value)} ${name(s.from)} in ${name(s.to)}`">
    <text x="24" y="34" font-size="18" font-weight="800" :fill="ink" fill-opacity="0.7">{{ kid ? `${EMOJI[s.quantity] ?? '📏'} ` : '' }}{{ s.quantity }} units</text>
    <g :style="{ transform: show === 'result' ? 'translate(40px, -34px) scale(0.6)' : 'none', transformOrigin: '320px 40px', transition: 'transform 800ms cubic-bezier(0.3, 1.2, 0.5, 1)' }">
      <!-- the steps -->
      <g v-for="(u, i) in ladder" :key="u" class="scene-pop" :style="{ animationDelay: `${i * 0.12}s` }">
        <rect :x="stepX(i) + 2" :y="top(i)" :width="w - 4" :height="FLOOR - top(i)" rx="10" :fill="stepFill(i)" :fill-opacity="stepOpacity(i)" :stroke="kid ? '#fff' : ink" :stroke-opacity="kid ? 0.9 : 0.25" stroke-width="2" style="transition: fill 500ms, fill-opacity 500ms" />
        <text :x="centre(i)" :y="top(i) + 30" font-size="24" font-weight="900" :fill="labelFill(i)" text-anchor="middle">{{ name(u) }}</text>
        <text v-if="amount(i)" :key="`${i}-${amount(i)}`" :x="centre(i)" :y="top(i) + 56" :font-size="amountSize(amount(i))" font-weight="900" fill="#fff" text-anchor="middle" class="scene-pop">{{ amount(i) }}</text>
      </g>
      <!-- the hops between steps: the ones we take are coloured -->
      <g v-for="a in arcs" :key="`arc${a.i}-${show}`">
        <template v-if="!a.used || show === 'ladder' || show === 'result'">
          <path :d="a.d" fill="none" :stroke="a.used ? blue : ink" :stroke-opacity="a.used ? 0.9 : 0.3" stroke-width="3" :stroke-dasharray="a.used ? undefined : '6 6'" stroke-linecap="round" />
          <polygon :points="a.head" :fill="a.used ? blue : ink" :fill-opacity="a.used ? 0.9 : 0.3" />
        </template>
        <template v-else>
          <path :d="a.d" pathLength="1" fill="none" :stroke="blue" stroke-width="5" stroke-linecap="round" class="scene-draw" :style="{ animationDelay: `${a.order * 0.7}s`, animationDuration: '0.7s' }" />
          <polygon :points="a.head" :fill="blue" class="scene-pop" :style="{ animationDelay: `${a.order * 0.7 + 0.55}s` }" />
        </template>
        <text v-if="a.label" :x="a.x" :y="a.y" :font-size="a.used ? 18 : 14" font-weight="900" :fill="a.used ? blue : ink" :fill-opacity="a.used ? 1 : 0.55" text-anchor="middle" :class="a.used && show === 'steps' ? 'scene-pop' : ''" :style="{ animationDelay: `${a.order * 0.7 + 0.3}s` }">{{ a.label }}</text>
      </g>
      <!-- the frog hops down (or up) the stairs, again and again -->
      <text v-if="kid" :x="frogAt.x" :y="frogAt.y" font-size="34" text-anchor="middle">🐸<animateMotion v-if="show === 'steps' && hops.count" :path="hops.d" :dur="`${hops.count * 0.8 + 1.6}s`" keyPoints="0;1;1" keyTimes="0;0.66;1" calcMode="linear" repeatCount="indefinite" /></text>
    </g>

    <!-- which way: down multiplies, up divides -->
    <g v-if="show === 'ladder'" class="scene-pop" style="animation-delay: 0.6s">
      <text x="40" y="378" font-size="16" font-weight="800" :fill="ink" fill-opacity="0.75">⬇ smaller unit: ×</text>
      <text x="600" y="378" font-size="16" font-weight="800" :fill="ink" fill-opacity="0.75" text-anchor="end">⬆ bigger unit: ÷</text>
    </g>
    <g v-if="show === 'steps'" class="scene-pop" :style="{ animationDelay: `${used.length * 0.7 + 0.2}s` }">
      <rect :x="320 - (total.length * 0.6 * totalSize + 40) / 2" y="352" :width="total.length * 0.6 * totalSize + 40" height="42" rx="21" fill="#ffc93c" />
      <text x="320" y="374" :font-size="totalSize" font-weight="900" fill="#18294a" text-anchor="middle" dominant-baseline="central">{{ total }}</text>
    </g>

    <!-- the answer -->
    <g v-if="show === 'result'">
      <g class="scene-pop" style="animation-delay: 0.3s">
        <rect :x="answer.lx" y="262" :width="answer.wl" :height="bigFont + 30" rx="18" fill="#f47a2a" />
        <text :x="answer.lx + answer.wl / 2" :y="262 + (bigFont + 30) / 2" :font-size="bigFont" font-weight="900" fill="#fff" text-anchor="middle" dominant-baseline="central">{{ left }}</text>
      </g>
      <g class="scene-pop" style="animation-delay: 0.6s">
        <line :x1="answer.ax - 36" :y1="262 + (bigFont + 30) / 2" :x2="answer.ax + 30" :y2="262 + (bigFont + 30) / 2" :stroke="ink" stroke-width="4" stroke-linecap="round" />
        <polygon :points="`${answer.ax + 38},${262 + (bigFont + 30) / 2} ${answer.ax + 26},${254 + (bigFont + 30) / 2} ${answer.ax + 26},${270 + (bigFont + 30) / 2}`" :fill="ink" />
        <text :x="answer.ax" y="250" font-size="18" font-weight="900" :fill="blue" text-anchor="middle">{{ op }}</text>
      </g>
      <g class="scene-pop" style="animation-delay: 0.9s">
        <rect :x="answer.rx" y="262" :width="answer.wr" :height="bigFont + 30" rx="18" fill="#0f7f76" />
        <text :x="answer.rx + answer.wr / 2" :y="262 + (bigFont + 30) / 2" :font-size="bigFont" font-weight="900" fill="#fff" text-anchor="middle" dominant-baseline="central">{{ right }}</text>
      </g>
    </g>
  </svg>
</template>
