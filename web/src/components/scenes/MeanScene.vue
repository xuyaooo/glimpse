<script setup lang="ts">
// The mean: towers of different heights; share them out equally and they all end up level.
import { computed } from 'vue'
import type { Scene } from '@/lib/types'

const props = defineProps<{ scene: Scene; stage: number }>()
const s = computed(() => props.scene as Scene & { values: number[]; mean: number; sum: number })
const level = computed(() => s.value.stages[props.stage]?.show === 'level')
const ink = computed(() => (s.value.skin === 'grown' ? '#fff' : '#18294a'))
// the zero line moves up when there are negative numbers, so they can hang below it
const lo = computed(() => Math.min(0, ...s.value.values))
const hi = computed(() => Math.max(0, ...s.value.values, 1))
const unit = computed(() => 250 / (hi.value - lo.value || 1))
const zero = computed(() => 320 + lo.value * unit.value)
const top = (v: number) => (v >= 0 ? zero.value - v * unit.value : zero.value)
const h = (v: number) => Math.abs(v) * unit.value
const w = computed(() => Math.min(64, 480 / s.value.values.length))
const x = (i: number) => 320 + (i - (s.value.values.length - 1) / 2) * (w.value + 12)
const COLORS = ['#7c5ce8', '#f47a2a', '#14a096', '#1f5fd6', '#e0a21a', '#e5484d']
// 3 decimals, like the captions and the answer (1.375, not 1.38)
const fmt = (v: number) => (Number.isInteger(v) ? String(v) : String(+v.toFixed(3)))
</script>

<template>
  <svg viewBox="0 0 640 400" class="absolute inset-0 size-full" role="img" aria-label="The mean">
    <line x1="40" :y1="zero" x2="600" :y2="zero" :stroke="ink" stroke-opacity="0.4" stroke-width="2" />
    <line v-if="level" x1="40" :y1="s.mean >= 0 ? top(s.mean) : top(s.mean) + h(s.mean)" x2="600" :y2="s.mean >= 0 ? top(s.mean) : top(s.mean) + h(s.mean)" stroke="#ffd34d" stroke-width="3" stroke-dasharray="10 7" class="scene-pop" style="animation-delay: 0.6s" />
    <g v-for="(v, i) in s.values" :key="i">
      <rect :x="x(i) - w / 2" :y="top(level ? s.mean : v)" :width="w" :height="Math.max(2, h(level ? s.mean : v))" rx="8" :fill="COLORS[i % COLORS.length]" fill-opacity="0.85" style="transition: y 1s cubic-bezier(0.3, 1.3, 0.5, 1), height 1s cubic-bezier(0.3, 1.3, 0.5, 1)" class="scene-pop" :style="{ animationDelay: `${i * 0.1}s` }" />
      <text :x="x(i)" :y="(level ? s.mean : v) >= 0 ? top(level ? s.mean : v) - 10 : top(level ? s.mean : v) + h(level ? s.mean : v) + 22" font-size="18" font-weight="900" :fill="ink" text-anchor="middle" style="transition: y 1s">{{ fmt(level ? s.mean : v) }}</text>
    </g>
    <text v-if="level" x="320" y="370" font-size="24" font-weight="900" fill="#ffd34d" text-anchor="middle" class="scene-pop">mean = {{ fmt(s.mean) }}</text>
  </svg>
</template>
