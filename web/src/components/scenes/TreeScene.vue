<script setup lang="ts">
// A tree diagram for two independent events: the first split, then the second on every
// branch; "both" is the top path, and its probability is the product along it.
import { computed } from 'vue'
import type { Scene } from '@/lib/types'

const props = defineProps<{ scene: Scene; stage: number }>()
type Labels = { A: string; notA: string; B: string; notB: string; paths: string[] }
const s = computed(() => props.scene as Scene & { pA: number; pB: number; nameA: string; nameB: string; both: number; labels?: Labels })
const shown = computed(() => new Set(s.value.stages.slice(0, props.stage + 1).map((st) => String(st.show))))
const ink = computed(() => (s.value.skin === 'grown' ? '#fff' : '#18294a'))
const f = (v: number) => String(+v.toFixed(3))
// the exact values from the engine (1/3, 0.0875), rounded numbers only when they are missing
const lab = (k: 'A' | 'notA' | 'B' | 'notB', v: number) => s.value.labels?.[k] ?? f(v)
const pathLab = (i: number, j: number, v: number) => s.value.labels?.paths?.[i * 2 + j] ?? f(v)
const root = { x: 70, y: 200 }
const first = [
  { x: 260, y: 110, label: () => s.value.nameA, p: () => s.value.pA, text: () => lab('A', s.value.pA) },
  { x: 260, y: 290, label: () => `not ${s.value.nameA}`, p: () => 1 - s.value.pA, text: () => lab('notA', 1 - s.value.pA) },
]
const second = (y: number) => [
  { x: 480, y: y - 50, label: () => s.value.nameB, p: () => s.value.pB, text: () => lab('B', s.value.pB) },
  { x: 480, y: y + 50, label: () => `not ${s.value.nameB}`, p: () => 1 - s.value.pB, text: () => lab('notB', 1 - s.value.pB) },
]
const top = computed(() => shown.value.has('path'))
</script>

<template>
  <svg viewBox="0 0 640 400" class="absolute inset-0 size-full" role="img" aria-label="Tree diagram">
    <circle :cx="root.x" :cy="root.y" r="8" :fill="ink" />
    <g v-for="(n, i) in first" :key="`a${i}`">
      <line :x1="root.x" :y1="root.y" :x2="n.x - 40" :y2="n.y" :stroke="top && i === 0 ? '#ffd34d' : ink" :stroke-width="top && i === 0 ? 6 : 3" stroke-opacity="0.85" pathLength="1" class="scene-draw" />
      <text :x="(root.x + n.x - 40) / 2" :y="(root.y + n.y) / 2 + (i ? 22 : -10)" font-size="17" font-weight="900" fill="#f47a2a" text-anchor="middle">{{ n.text() }}</text>
      <text :x="n.x - 30" :y="n.y" font-size="19" font-weight="900" :fill="ink" dominant-baseline="central">{{ n.label() }}</text>
      <template v-if="shown.has('second') || top">
        <g v-for="(m, j) in second(n.y)" :key="`b${i}${j}`">
          <line :x1="n.x + 40" :y1="n.y" :x2="m.x - 40" :y2="m.y" :stroke="top && i === 0 && j === 0 ? '#ffd34d' : ink" :stroke-width="top && i === 0 && j === 0 ? 6 : 3" stroke-opacity="0.85" pathLength="1" class="scene-draw" />
          <text :x="(n.x + m.x) / 2" :y="(n.y + m.y) / 2 + (j ? 18 : -8)" font-size="15" font-weight="900" fill="#14a096" text-anchor="middle">{{ m.text() }}</text>
          <text :x="m.x - 30" :y="m.y" font-size="17" font-weight="900" :fill="ink" dominant-baseline="central">{{ m.label() }}</text>
          <text v-if="top" :x="m.x + 70" :y="m.y" font-size="16" font-weight="900" :fill="i === 0 && j === 0 ? '#ffd34d' : ink" :fill-opacity="i === 0 && j === 0 ? 1 : 0.5" dominant-baseline="central" class="scene-pop">{{ pathLab(i, j, n.p() * m.p()) }}</text>
        </g>
      </template>
    </g>
  </svg>
</template>
