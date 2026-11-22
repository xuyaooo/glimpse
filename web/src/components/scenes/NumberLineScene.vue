<script setup lang="ts">
// Adding and subtracting as jumps on a number line. Little ones see a frog hopping.
import { computed } from 'vue'
import type { Scene } from '@/lib/types'

const props = defineProps<{ scene: Scene; stage: number }>()
const s = computed(() => props.scene as Scene & { min: number; max: number; jumps: { from: number; to: number }[]; result: number })
const X0 = 50
const X1 = 590
const Y = 270
const x = (v: number) => X0 + ((v - s.value.min) / (s.value.max - s.value.min || 1)) * (X1 - X0)
const ticks = computed(() => {
  const span = s.value.max - s.value.min
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000].find((t) => span / t <= 12) ?? 10000
  const out = []
  for (let v = Math.ceil(s.value.min / step) * step; v <= s.value.max; v += step) out.push(v)
  return out
})
const at = computed(() => Number(s.value.stages[props.stage]?.at ?? s.value.stages[0].at))
const done = computed(() => s.value.jumps.filter((_, i) => i < props.stage))
const arc = (j: { from: number; to: number }) => {
  const a = x(j.from)
  const b = x(j.to)
  const h = Math.min(150, 40 + Math.abs(b - a) * 0.45)
  return `M${a} ${Y - 14} Q${(a + b) / 2} ${Y - 14 - h * 2} ${b} ${Y - 14}`
}
const label = (j: { from: number; to: number }) => `${j.to > j.from ? '+' : '−'}${Math.abs(j.to - j.from)}`
const hopper = computed(() => (s.value.skin === 'kid' ? '🐸' : s.value.skin === 'junior' ? '🐰' : ''))
const ink = computed(() => (s.value.skin === 'grown' ? '#ffffff' : '#18294a'))
</script>

<template>
  <svg viewBox="0 0 640 400" class="absolute inset-0 size-full" role="img" :aria-label="`Number line, landing on ${at}`">
    <line :x1="X0 - 20" :y1="Y" :x2="X1 + 20" :y2="Y" :stroke="ink" stroke-width="5" stroke-linecap="round" />
    <g v-for="t in ticks" :key="t">
      <line :x1="x(t)" :y1="Y - 10" :x2="x(t)" :y2="Y + 10" :stroke="ink" stroke-width="3" />
      <text :x="x(t)" :y="Y + 38" font-size="20" font-weight="800" :fill="ink" text-anchor="middle">{{ t }}</text>
    </g>
    <g v-for="(j, i) in done" :key="`j${i}`">
      <path :d="arc(j)" pathLength="1" fill="none" stroke="#f47a2a" stroke-width="5" stroke-linecap="round" class="scene-draw" />
      <text :x="(x(j.from) + x(j.to)) / 2" :y="Y - 40 - Math.min(150, 40 + Math.abs(x(j.to) - x(j.from)) * 0.45)" font-size="26" font-weight="900" fill="#f47a2a" text-anchor="middle" class="scene-pop" style="animation-delay: 0.6s">{{ label(j) }}</text>
    </g>
    <!-- where we are -->
    <g class="scene-move" :style="{ transform: `translate(${x(at)}px, 0px)` }">
      <circle cx="0" :cy="Y" r="11" fill="#0f7f76" stroke="#fff" stroke-width="4" />
      <text v-if="hopper" :key="at" x="0" :y="Y - 34" font-size="46" text-anchor="middle" class="scene-hop">{{ hopper }}</text>
    </g>
    <g v-if="stage === scene.stages.length - 1" class="scene-pop" style="animation-delay: 0.5s">
      <rect :x="x(s.result) - 56" :y="Y + 56" width="112" height="56" rx="28" fill="#0f7f76" />
      <text :x="x(s.result)" :y="Y + 86" font-size="32" font-weight="900" fill="#fff" text-anchor="middle" dominant-baseline="central">{{ s.result }}</text>
    </g>
  </svg>
</template>
