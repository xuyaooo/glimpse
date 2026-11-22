<script setup lang="ts">
// Percent: a hundred little squares, p of them filled; then the same share of a bar that is
// the whole amount, and its value.
import { computed } from 'vue'
import type { Scene } from '@/lib/types'

const props = defineProps<{ scene: Scene; stage: number }>()
const s = computed(() => props.scene as Scene & { p: number; of: number; value: number })
const show = computed(() => String(s.value.stages[props.stage]?.show ?? 'grid'))
const ink = computed(() => (s.value.skin === 'grown' ? '#fff' : '#18294a'))
const filled = computed(() => Math.round(Math.min(100, s.value.p)))
const fmt = (v: number) => (Number.isInteger(v) ? String(v) : String(+v.toFixed(3)))
</script>

<template>
  <svg viewBox="0 0 640 400" class="absolute inset-0 size-full" role="img" :aria-label="`${s.p} percent of ${s.of}`">
    <g :style="{ transform: show === 'grid' ? 'translate(0,0)' : 'translate(-150px, 0) scale(0.8)', transformOrigin: '320px 200px', transition: 'transform 800ms ease' }">
      <rect v-for="k in 100" :key="k" :x="220 + ((k - 1) % 10) * 21" :y="40 + Math.floor((k - 1) / 10) * 21" width="18" height="18" rx="3" :fill="k <= filled ? '#f47a2a' : 'none'" :stroke="ink" stroke-opacity="0.35" stroke-width="1.5" :class="k <= filled ? 'scene-pop' : ''" :style="{ animationDelay: `${(k - 1) * 0.012}s` }" />
      <text x="325" y="280" font-size="30" font-weight="900" fill="#f47a2a" text-anchor="middle">{{ fmt(s.p) }} out of 100</text>
      <text v-if="s.p > 100" x="325" y="312" font-size="18" font-weight="800" :fill="ink" text-anchor="middle">(one full hundred, and {{ fmt(s.p - 100) }} more)</text>
    </g>
    <template v-if="show !== 'grid'">
      <rect x="350" y="132" :width="Math.min(270, (270 * s.p) / Math.max(100, s.p))" height="52" rx="8" fill="#f47a2a" class="scene-pop" style="animation-delay: 0.3s" />
      <rect x="350" y="130" :width="(270 * 100) / Math.max(100, s.p)" height="56" rx="10" fill="none" :stroke="ink" stroke-opacity="0.7" stroke-width="3" class="scene-pop" />
      <text v-if="s.p > 100" :x="350 + (270 * 100) / s.p" y="206" font-size="15" font-weight="800" :fill="ink" text-anchor="middle">100%</text>
      <text x="480" y="115" font-size="22" font-weight="900" :fill="ink" text-anchor="middle">all of it: {{ fmt(s.of) }}</text>
      <text v-if="show === 'value'" x="480" y="236" font-size="34" font-weight="900" fill="#0f7f76" text-anchor="middle" class="scene-pop">{{ fmt(s.value) }}</text>
    </template>
  </svg>
</template>
