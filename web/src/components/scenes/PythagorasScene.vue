<script setup lang="ts">
// Pythagoras: a right triangle with a real square on each side. The two small squares together
// are as big as the big one.
import { computed } from 'vue'
import type { Scene } from '@/lib/types'

const props = defineProps<{ scene: Scene; stage: number }>()
const s = computed(() => props.scene as Scene & { a: number; b: number; c: number; missing: 'b' | 'c' })
const show = computed(() => String(s.value.stages[props.stage]?.show ?? 'triangle'))
const ink = computed(() => (s.value.skin === 'grown' ? '#fff' : '#18294a'))
// right angle at O; a vertical (up), b horizontal (right); scaled to fit with the squares
const k = computed(() => 150 / Math.max(s.value.a, s.value.b))
const O = computed(() => ({ x: 250, y: 230 }))
const P = computed(() => ({ x: O.value.x, y: O.value.y - s.value.a * k.value })) // top
const Q = computed(() => ({ x: O.value.x + s.value.b * k.value, y: O.value.y })) // right
const pts = (arr: { x: number; y: number }[]) => arr.map((p) => `${p.x},${p.y}`).join(' ')
const sqA = computed(() => pts([O.value, P.value, { x: P.value.x - s.value.a * k.value, y: P.value.y }, { x: O.value.x - s.value.a * k.value, y: O.value.y }]))
const sqB = computed(() => pts([O.value, Q.value, { x: Q.value.x, y: Q.value.y + s.value.b * k.value }, { x: O.value.x, y: O.value.y + s.value.b * k.value }]))
const sqC = computed(() => {
  const dx = Q.value.x - P.value.x
  const dy = Q.value.y - P.value.y
  return pts([P.value, Q.value, { x: Q.value.x + dy, y: Q.value.y - dx }, { x: P.value.x + dy, y: P.value.y - dx }])
})
// the middle of a square, for its area
const mid = (pts: string) => {
  const ps = pts.split(' ').map((p) => p.split(',').map(Number))
  return { x: ps.reduce((t, p) => t + p[0], 0) / ps.length, y: ps.reduce((t, p) => t + p[1], 0) / ps.length }
}
const fmt = (v: number) => (Number.isInteger(v) ? String(v) : String(+v.toFixed(2)))
const squares = computed(() => show.value !== 'triangle')
// the side being found stays '?' until the answer, in the sum at the bottom too
const area = (side: 'a' | 'b' | 'c') => (s.value.missing === side && show.value !== 'answer' ? '?' : fmt(s.value[side] * s.value[side]))
// With the squares the drawing is made smaller; when a square would still poke out of the
// picture (or over the sum at the bottom), it is scaled and moved to fit instead, with a margin
// so the camera drift of the video card doesn't cut a corner off.
const fit = computed(() => {
  const ps = [sqA.value, sqB.value, sqC.value].join(' ').split(' ').map((p) => p.split(',').map(Number))
  ps.push([O.value.x - s.value.a * k.value - 50, O.value.y], [(O.value.x + Q.value.x) / 2, O.value.y + s.value.b * k.value + 36]) // the side labels
  const xs = ps.map((p) => p[0])
  const ys = ps.map((p) => p[1])
  const box = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }
  const usual = { sc: 0.78, tx: 110.4, ty: 34 } // translate(40, -10) scale(0.78) around (320, 200)
  const inside = usual.tx + box.x0 * usual.sc >= 14 && usual.tx + box.x1 * usual.sc <= 626 && usual.ty + box.y0 * usual.sc >= 14 && usual.ty + box.y1 * usual.sc <= 362
  if (inside) return usual
  const sc = Math.min(0.78, 612 / (box.x1 - box.x0), 348 / (box.y1 - box.y0))
  return { sc, tx: 320 - ((box.x0 + box.x1) / 2) * sc, ty: 188 - ((box.y0 + box.y1) / 2) * sc }
})
</script>

<template>
  <svg viewBox="0 0 640 400" class="absolute inset-0 size-full" role="img" aria-label="Pythagoras">
    <g :style="{ transform: squares ? `translate(${fit.tx}px, ${fit.ty}px) scale(${fit.sc})` : 'translate(60px, 40px) scale(1)', transformOrigin: '0px 0px', transition: 'transform 800ms ease' }">
      <template v-if="squares">
        <polygon :points="sqA" fill="#7c5ce8" fill-opacity="0.75" class="scene-pop" />
        <polygon :points="sqB" fill="#f47a2a" fill-opacity="0.75" class="scene-pop" style="animation-delay: 0.2s" />
        <polygon :points="sqC" fill="#14a096" fill-opacity="0.75" class="scene-pop" style="animation-delay: 0.4s" />
        <text v-for="(q, i) in [{ p: sqA, v: s.a * s.a }, { p: sqB, v: s.b * s.b }, { p: sqC, v: s.c * s.c }]" :key="`area${i}`" :x="mid(q.p).x" :y="mid(q.p).y" font-size="30" font-weight="900" fill="#fff" text-anchor="middle" dominant-baseline="central" class="scene-pop" :style="{ animationDelay: `${0.5 + i * 0.2}s` }">{{ (i === 1 && s.missing === 'b') || (i === 2 && s.missing === 'c') ? (show === 'answer' ? fmt(q.v) : '?') : fmt(q.v) }}</text>
      </template>
      <polygon :points="pts([O, P, Q])" fill="none" :stroke="ink" stroke-width="5" stroke-linejoin="round" />
      <path :d="`M${O.x} ${O.y - 18} h18 v18`" fill="none" :stroke="ink" stroke-width="3" />
      <text :x="O.x - (squares ? s.a * k + 14 : 14)" :y="(O.y + P.y) / 2" font-size="26" font-weight="900" fill="#7c5ce8" text-anchor="end" dominant-baseline="central">{{ fmt(s.a) }}</text>
      <text :x="(O.x + Q.x) / 2" :y="O.y + (squares ? s.b * k + 30 : 30)" font-size="26" font-weight="900" fill="#f47a2a" text-anchor="middle">{{ s.missing === 'b' && show !== 'answer' ? '?' : fmt(s.b) }}</text>
      <text :x="(P.x + Q.x) / 2 + 16" :y="(P.y + Q.y) / 2 - 10" font-size="26" font-weight="900" fill="#14a096">{{ s.missing === 'c' && show !== 'answer' ? '?' : fmt(s.c) }}</text>
    </g>
    <text v-if="squares" x="320" y="388" font-size="22" font-weight="900" :fill="ink" text-anchor="middle" class="scene-pop">{{ area('a') }} + {{ area('b') }} = {{ area('c') }}</text>
  </svg>
</template>
