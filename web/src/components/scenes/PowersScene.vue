<script setup lang="ts">
// Powers: multiply by the base again and again; each new value is a taller bar (a log scale
// when they grow fast). Logarithms count how many times.
import { computed } from 'vue'
import type { Scene } from '@/lib/types'

const props = defineProps<{ scene: Scene; stage: number }>()
const s = computed(() => props.scene as Scene & { base: number; exp: number; value: number; log: boolean; chain: number[]; descending?: boolean })
const upto = computed(() => Number(s.value.stages[props.stage]?.show ?? 0))
const bars = computed(() => s.value.chain.slice(0, Math.max(upto.value, 0)))
const max = computed(() => Math.max(...s.value.chain, 1))
const h = (v: number) => (s.value.value > 1000 ? (Math.log(v) / Math.log(max.value)) * 250 : (v / max.value) * 250)
const ink = computed(() => (s.value.skin === 'grown' ? '#fff' : '#18294a'))
const w = computed(() => Math.min(70, 500 / Math.max(1, s.value.chain.length)))
const x = (i: number) => 320 + (i - (s.value.chain.length - 1) / 2) * (w.value + 10)
// the base as a subscript, every digit of it (log₁₂)
const sub = computed(() => String(s.value.base).replace(/\d/g, (d) => '₀₁₂₃₄₅₆₇₈₉'[+d]))
</script>

<template>
  <svg viewBox="0 0 640 400" class="absolute inset-0 size-full" role="img" :aria-label="`${s.base} to the power ${s.exp}`">
    <text x="320" y="50" font-size="40" font-weight="900" :fill="ink" text-anchor="middle">{{ s.log ? `log${sub}` : '' }}{{ s.log ? ` ${s.value}` : `${s.base}` }}<tspan v-if="!s.log" dy="-18" font-size="26">{{ s.exp }}</tspan></text>
    <line x1="40" y1="340" x2="600" y2="340" :stroke="ink" stroke-opacity="0.4" stroke-width="2" />
    <g v-for="(v, i) in bars" :key="i" class="scene-pop" :style="{ animationDelay: `${i === bars.length - 1 ? 0.1 : 0}s` }">
      <rect :x="x(i) - w / 2" :y="340 - h(v)" :width="w" :height="h(v)" rx="8" :fill="i === bars.length - 1 ? '#ffd34d' : '#3fe0d0'" fill-opacity="0.9" style="transition: height 600ms, y 600ms" />
      <text :x="x(i)" :y="330 - h(v)" font-size="18" font-weight="900" :fill="ink" text-anchor="middle">{{ v }}</text>
      <text :x="x(i)" y="366" font-size="15" font-weight="800" fill="#9fb3c8" text-anchor="middle">{{ s.descending ? (i === 0 ? '' : `÷${s.base}`) : `×${s.base}` }}</text>
    </g>
    <text v-if="s.descending && upto >= 4" x="320" y="392" font-size="18" font-weight="900" fill="#ffd34d" text-anchor="middle" class="scene-pop">{{ s.base }}⁰ = 1</text>
    <text v-if="upto >= s.exp && s.exp > 0" x="320" y="392" font-size="18" font-weight="900" fill="#ffd34d" text-anchor="middle" class="scene-pop">{{ s.exp }} times {{ s.base }}</text>
  </svg>
</template>
