<script setup lang="ts">
// Adding fractions: pizzas for little ones, bars for older children. Cut both into pieces of
// the same size, then put the pieces together.
import { computed } from 'vue'
import type { Scene } from '@/lib/types'

const props = defineProps<{ scene: Scene; stage: number }>()
const s = computed(() => props.scene as Scene & { n1: number; d1: number; n2: number; d2: number; op: '+' | '-'; l: number; m1: number; m2: number; top: number })
const st = computed(() => s.value.stages[props.stage] as { cut?: boolean; joined?: boolean })
const pizza = computed(() => s.value.skin === 'kid')
const A = '#f47a2a'
const B = '#7c5ce8'
const ink = computed(() => (s.value.skin === 'grown' ? '#ffffff' : '#18294a'))

// slices of a pizza as paths
function slices(cx: number, cy: number, r: number, d: number) {
  return Array.from({ length: d }, (_, i) => {
    if (d === 1) return `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0`
    const a0 = (i / d) * Math.PI * 2 - Math.PI / 2
    const a1 = ((i + 1) / d) * Math.PI * 2 - Math.PI / 2
    return `M${cx} ${cy} L${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)} A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)} Z`
  })
}
// what each fraction looks like at this step
const left = computed(() => (st.value.cut ? { n: s.value.m1, d: s.value.l } : { n: s.value.n1, d: s.value.d1 }))
const right = computed(() => (st.value.cut ? { n: s.value.m2, d: s.value.l } : { n: s.value.n2, d: s.value.d2 }))
// joined: wholes needed for the sum
const wholes = computed(() => Math.max(1, Math.ceil(s.value.top / s.value.l)))
// a fraction over 1 (5/4) needs more than one whole: pizza k shows slices k*d ... k*d + d - 1
const wholesOf = (f: { n: number; d: number }) => Math.max(1, Math.ceil(f.n / f.d))
// Every whole is the same size (that's what makes fractions comparable): one radius for all the
// pizzas on screen, the two fractions side by side with a gap between them.
const layout = computed(() => {
  const wl = wholesOf(left.value)
  const wr = wholesOf(right.value)
  const gap = 40
  const slot = Math.min(250, (600 - gap) / (wl + wr))
  const r = Math.min(110, slot / 2 - 16)
  const width = slot * (wl + wr) + gap
  const x0 = 320 - width / 2
  return {
    r,
    left: Array.from({ length: wl }, (_, k) => ({ k, cx: x0 + slot * (k + 0.5), cy: 180, r })),
    right: Array.from({ length: wr }, (_, k) => ({ k, cx: x0 + slot * (wl + k + 0.5) + gap, cy: 180, r })),
    labelL: x0 + (slot * wl) / 2,
    labelR: x0 + slot * wl + gap + (slot * wr) / 2,
  }
})
function pizzas(count: number, x0: number, x1: number, cy: number, rMax: number) {
  const r = Math.min(rMax, (x1 - x0) / count / 2 - 16)
  return Array.from({ length: count }, (_, k) => ({ k, cx: x0 + (x1 - x0) * ((k + 0.5) / count), cy, r }))
}
// the bars of the sum, one row per whole, all of them above the answer (its pill starts at y = 330)
const rows = computed(() => {
  const n = wholes.value
  if (n <= 2) return { y: 110, pitch: 90, h: 64 }
  if (n <= 4) return { y: 60, pitch: 70, h: 54 }
  const pitch = 290 / n
  return { y: 36, pitch, h: pitch * 0.77 }
})
// the name of the pieces: halves, thirds, 21sts, 22nds, 23rds, 12ths
const pieces = (l: number) => {
  if (l === 2) return 'halves'
  if (l === 3) return 'thirds'
  const end = l % 100 >= 11 && l % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][l % 10] ?? 'th')
  return `${l}${end}s`
}
const joinedFill = (i: number) => {
  if (s.value.op === '-') return i < s.value.top ? A : 'none'
  return i < s.value.m1 ? A : i < s.value.m1 + s.value.m2 ? B : 'none'
}
</script>

<template>
  <svg viewBox="0 0 640 400" class="absolute inset-0 size-full" role="img" :aria-label="`${s.n1}/${s.d1} ${s.op} ${s.n2}/${s.d2}`">
    <template v-if="!st.joined">
      <template v-if="pizza">
        <g v-for="(f, side) in [left, right]" :key="`${side}-${f.d}-${f.n}`" class="scene-pop" :style="{ animationDelay: `${side * 0.2}s` }">
          <g v-for="p in side ? layout.right : layout.left" :key="p.k">
            <circle :cx="p.cx" :cy="p.cy" :r="p.r + 10" fill="#f3d7a1" stroke="#d9a75c" stroke-width="8" />
            <path v-for="(d, i) in slices(p.cx, p.cy, p.r, f.d)" :key="i" :d="d" :fill="p.k * f.d + i < f.n ? (side ? B : A) : '#fff4dc'" :fill-opacity="p.k * f.d + i < f.n ? 0.9 : 1" stroke="#fff" stroke-width="3" />
          </g>
          <text :x="side ? layout.labelR : layout.labelL" y="345" font-size="34" font-weight="900" :fill="side ? B : A" text-anchor="middle">{{ f.n }}/{{ f.d }}</text>
        </g>
      </template>
      <template v-else>
        <g v-for="(f, side) in [left, right]" :key="`${side}-${f.d}-${f.n}`" class="scene-pop" :style="{ animationDelay: `${side * 0.2}s` }">
          <text x="34" :y="side ? 252 : 132" font-size="30" font-weight="900" :fill="side ? B : A" dominant-baseline="central">{{ f.n }}/{{ f.d }}</text>
          <template v-for="w in wholesOf(f)" :key="w">
            <rect v-for="i in f.d" :key="i" :x="120 + (w - 1) * (480 / wholesOf(f)) + ((i - 1) * (480 / wholesOf(f) - 8)) / f.d" :y="side ? 222 : 102" :width="(480 / wholesOf(f) - 8) / f.d - 3" height="60" rx="6" :fill="(w - 1) * f.d + i <= f.n ? (side ? B : A) : 'none'" :stroke="ink" stroke-opacity="0.45" stroke-width="2" />
          </template>
        </g>
      </template>
      <text v-if="st.cut" x="320" y="388" font-size="20" font-weight="800" :fill="ink" text-anchor="middle" class="scene-pop">all pieces are now {{ pieces(s.l) }}</text>
    </template>
    <template v-else>
      <template v-if="pizza">
        <g v-for="p in pizzas(wholes, 20, 620, 175, 130)" :key="p.k" class="scene-pop" :style="{ animationDelay: `${p.k * 0.2}s` }">
          <circle :cx="p.cx" :cy="p.cy" :r="p.r + 10" fill="#f3d7a1" stroke="#d9a75c" stroke-width="8" />
          <path v-for="(d, i) in slices(p.cx, p.cy, p.r, s.l)" :key="i" :d="d" :fill="joinedFill(p.k * s.l + i) === 'none' ? '#fff4dc' : joinedFill(p.k * s.l + i)" stroke="#fff" stroke-width="3" class="scene-pop" :style="{ animationDelay: `${0.3 + (p.k * s.l + i) * 0.06}s` }" />
        </g>
      </template>
      <template v-else>
        <g v-for="w in wholes" :key="w">
          <rect v-for="i in s.l" :key="i" :x="85 + ((i - 1) * 470) / s.l" :y="rows.y + (w - 1) * rows.pitch" :width="470 / s.l - 3" :height="rows.h" rx="6" :fill="joinedFill((w - 1) * s.l + i - 1)" :stroke="ink" stroke-opacity="0.45" stroke-width="2" class="scene-pop" :style="{ animationDelay: `${0.2 + ((w - 1) * s.l + i) * 0.05}s` }" />
        </g>
      </template>
      <g class="scene-pop" style="animation-delay: 1s">
        <rect x="235" y="330" width="170" height="56" rx="28" fill="#0f7f76" />
        <text x="320" y="359" font-size="30" font-weight="900" fill="#fff" text-anchor="middle" dominant-baseline="central">{{ s.top }}/{{ s.l }}</text>
      </g>
    </template>
  </svg>
</template>
