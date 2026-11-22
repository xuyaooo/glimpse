<script setup lang="ts">
// Times as equal groups: plates of cookies for little ones, a dot array for grown-ups.
import { computed } from 'vue'
import type { Scene } from '@/lib/types'

const props = defineProps<{ scene: Scene; stage: number }>()
const s = computed(() => props.scene as Scene & { a: number; b: number; result: number; counts: number[] })
const kid = computed(() => s.value.skin !== 'grown')

// plates in up to 2 rows; two rows, with each plate's count under it, stay above the result
// (its pill starts at y = 330)
const plates = computed(() => {
  const a = s.value.a
  const cols = a <= 4 ? a : Math.ceil(a / 2)
  const r = Math.min(a <= 4 ? 62 : 56, 560 / cols / 2 - 6)
  return Array.from({ length: a }, (_, i) => ({ cx: 320 + ((i % cols) - (cols - 1) / 2) * (r * 2 + 12), cy: a <= 4 ? 190 : 14 + r + Math.floor(i / cols) * (r * 2 + 46), r, i }))
})
const cookies = (p: { cx: number; cy: number; r: number }) => {
  const b = s.value.b
  return Array.from({ length: b }, (_, j) => {
    if (b === 1) return { x: p.cx, y: p.cy }
    const ring = b <= 6 ? 0.5 : j < 4 ? 0.28 : 0.62
    const n = b <= 6 ? b : j < 4 ? 4 : b - 4
    const k = b <= 6 ? j : j < 4 ? j : j - 4
    const ang = (k / n) * Math.PI * 2 - Math.PI / 2
    return { x: p.cx + Math.cos(ang) * p.r * ring, y: p.cy + Math.sin(ang) * p.r * ring }
  })
}
// dot array, all of it above the result (its pill starts at y = 330)
const cell = computed(() => Math.min(270 / s.value.a, 520 / s.value.b, 44))
const gx = (c: number) => 320 + (c - (s.value.b - 1) / 2) * cell.value
const gy = (r: number) => 190 + (r - (s.value.a - 1) / 2) * cell.value
// "3 rows" to the left of the dots; written upwards when it would not fit there
const rowsLabel = computed(() => {
  const x = gx(0) - cell.value
  const fits = x - (String(s.value.a).length + 5) * 12.5 >= 4
  return fits ? { x, up: false } : { x: gx(0) - cell.value / 2 - 17, up: true }
})
// the result's pill, as wide as its text (12 × 12 = 144 is wider than 3 × 4 = 12)
const result = computed(() => `${s.value.a} × ${s.value.b} = ${s.value.result}`)
const pillW = computed(() => Math.max(180, result.value.length * 16 + 36))
</script>

<template>
  <svg viewBox="0 0 640 400" class="absolute inset-0 size-full" role="img" :aria-label="`${s.a} groups of ${s.b}`">
    <template v-if="kid">
      <g v-for="p in plates" :key="p.i" class="scene-pop" :style="{ animationDelay: `${p.i * 0.1}s` }">
        <ellipse :cx="p.cx" :cy="p.cy + 6" :rx="p.r" :ry="p.r * 0.92" fill="#d8e3ee" />
        <circle :cx="p.cx" :cy="p.cy" :r="p.r" fill="#fff" stroke="#c9d6e3" stroke-width="3" />
        <circle :cx="p.cx" :cy="p.cy" :r="p.r * 0.7" fill="none" stroke="#eef3f8" stroke-width="3" />
        <template v-if="stage >= 1">
          <text v-for="(c, j) in cookies(p)" :key="j" :x="c.x" :y="c.y" :font-size="Math.max(16, p.r * 0.5)" text-anchor="middle" dominant-baseline="central" class="scene-pop" :style="{ animationDelay: `${0.2 + p.i * 0.15 + j * 0.05}s` }">🍪</text>
        </template>
        <g v-if="stage >= 2" class="scene-pop" :style="{ animationDelay: `${0.3 + p.i * 0.45}s` }">
          <rect :x="p.cx - 26" :y="p.cy + p.r + 8" width="52" height="30" rx="15" fill="#f47a2a" />
          <text :x="p.cx" :y="p.cy + p.r + 23" font-size="18" font-weight="900" fill="#fff" text-anchor="middle" dominant-baseline="central">{{ s.counts[p.i] }}</text>
        </g>
      </g>
    </template>
    <template v-else>
      <rect v-for="r in s.a" :key="`row${r}`" :x="gx(0) - cell / 2 - 4" :y="gy(r - 1) - cell / 2 + 2" :width="cell * s.b + 8" :height="cell - 4" rx="8" fill="none" stroke="#3fe0d0" stroke-opacity="0.5" stroke-width="2" class="scene-pop" :style="{ animationDelay: `${r * 0.08}s` }" />
      <template v-if="stage >= 1">
        <template v-for="r in s.a" :key="`r${r}`">
          <circle v-for="c in s.b" :key="c" :cx="gx(c - 1)" :cy="gy(r - 1)" :r="cell * 0.3" fill="#ffd34d" class="scene-pop" :style="{ animationDelay: `${(r - 1) * 0.12 + c * 0.03}s` }" />
        </template>
      </template>
      <text v-if="stage >= 1" :x="rowsLabel.x" :y="190" font-size="22" font-weight="800" fill="#9fb3c8" :text-anchor="rowsLabel.up ? 'middle' : 'end'" dominant-baseline="central" :transform="rowsLabel.up ? `rotate(-90 ${rowsLabel.x} 190)` : undefined">{{ s.a }} rows</text>
      <text v-if="stage >= 1" x="320" :y="gy(0) - cell" font-size="22" font-weight="800" fill="#9fb3c8" text-anchor="middle">{{ s.b }} in each row</text>
    </template>
    <g v-if="stage >= 2" class="scene-pop" :style="{ animationDelay: `${kid ? s.a * 0.45 + 0.4 : 0.6}s` }">
      <rect :x="320 - pillW / 2" y="330" :width="pillW" height="56" rx="28" :fill="kid ? '#fff' : '#3fe0d0'" :stroke="kid ? '#0f7f76' : 'none'" stroke-width="4" />
      <text x="320" y="359" font-size="30" font-weight="900" :fill="kid ? '#0b6962' : '#0b1d28'" text-anchor="middle" dominant-baseline="central">{{ result }}</text>
    </g>
  </svg>
</template>
