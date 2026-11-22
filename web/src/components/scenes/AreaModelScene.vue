<script setup lang="ts">
// Big multiplication as a rectangle: one side split into tens and ones, the other too; each
// little rectangle is a partial product; add them all up.
import { computed } from 'vue'
import type { Scene } from '@/lib/types'

const props = defineProps<{ scene: Scene; stage: number }>()
const s = computed(() => props.scene as Scene & { a: number; b: number; A: number[]; B: number[]; cells: { i: number; j: number; x: number; y: number; p: number }[]; result: number })
const show = computed(() => String(s.value.stages[props.stage]?.show ?? 'split'))
const COLORS = ['#7c5ce8', '#f47a2a', '#14a096', '#1f5fd6', '#e0a21a', '#e5484d']
const ink = computed(() => (s.value.skin === 'grown' ? '#fff' : '#18294a'))
// sizes: proportional, but every part at least big enough to read
const sizes = (parts: number[], total: number) => {
  const raw = parts.map((p) => Math.max(0.22, p / parts.reduce((t, x) => t + x, 0)))
  const sum = raw.reduce((t, x) => t + x, 0)
  return raw.map((r) => (r / sum) * total)
}
const cols = computed(() => sizes(s.value.B, 440))
const rows = computed(() => sizes(s.value.A, 250))
const x0 = 140
const y0 = 70
const cx = (j: number) => x0 + cols.value.slice(0, j).reduce((t, x) => t + x, 0)
const cy = (i: number) => y0 + rows.value.slice(0, i).reduce((t, x) => t + x, 0)
</script>

<template>
  <svg viewBox="0 0 640 400" class="absolute inset-0 size-full" role="img" :aria-label="`${s.a} times ${s.b}`">
    <g v-for="(b, j) in s.B" :key="`c${j}`" class="scene-pop" :style="{ animationDelay: `${j * 0.15}s` }">
      <text :x="cx(j) + cols[j] / 2" :y="y0 - 16" font-size="26" font-weight="900" fill="#f47a2a" text-anchor="middle">{{ b }}</text>
    </g>
    <g v-for="(a, i) in s.A" :key="`r${i}`" class="scene-pop" :style="{ animationDelay: `${0.3 + i * 0.15}s` }">
      <text :x="x0 - 14" :y="cy(i) + rows[i] / 2" font-size="26" font-weight="900" fill="#7c5ce8" text-anchor="end" dominant-baseline="central">{{ a }}</text>
    </g>
    <g v-for="(c, k) in s.cells" :key="k">
      <rect :x="cx(c.j) + 2" :y="cy(c.i) + 2" :width="cols[c.j] - 4" :height="rows[c.i] - 4" rx="10" :fill="COLORS[k % COLORS.length]" :fill-opacity="show === 'split' ? 0.18 : 0.85" :stroke="COLORS[k % COLORS.length]" stroke-width="3" class="scene-pop" :style="{ animationDelay: `${0.4 + k * 0.12}s`, transition: 'fill-opacity 600ms' }" />
      <text v-if="show !== 'split'" :x="cx(c.j) + cols[c.j] / 2" :y="cy(c.i) + rows[c.i] / 2" :font-size="Math.min(26, cols[c.j] / 4)" font-weight="900" fill="#fff" text-anchor="middle" dominant-baseline="central" class="scene-pop" :style="{ animationDelay: `${k * 0.35}s` }">{{ c.p }}</text>
    </g>
    <g v-if="show === 'sum'" class="scene-pop" style="animation-delay: 0.5s">
      <rect x="200" y="338" width="240" height="52" rx="26" fill="#0f7f76" />
      <text x="320" y="364" font-size="26" font-weight="900" fill="#fff" text-anchor="middle" dominant-baseline="central">= {{ s.result }}</text>
    </g>
    <text v-else x="320" y="370" font-size="20" font-weight="800" :fill="ink" fill-opacity="0.7" text-anchor="middle">{{ s.a }} × {{ s.b }}</text>
  </svg>
</template>
