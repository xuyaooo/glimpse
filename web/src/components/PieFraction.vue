<script setup lang="ts">
import { computed } from 'vue'
import type { Tone } from '@/lib/types'

const props = withDefaults(defineProps<{ n: number; d: number; tone?: Tone; size?: number; label: string }>(), { tone: 'pen', size: 128 })

const C = 60
const R = 52
const COLORS = { pen: { fill: '#2452CC', empty: '#DCE4F7' }, marker: { fill: '#E8620F', empty: '#FBE0CB' } }
const color = computed(() => COLORS[props.tone])

const point = (turn: number) => {
  const a = 2 * Math.PI * turn
  return [C + R * Math.sin(a), C - R * Math.cos(a)].map((v) => +v.toFixed(2))
}

const wedge = computed(() => {
  const share = props.n / props.d
  if (share <= 0 || share >= 1) return ''
  const [x, y] = point(share)
  return `M${C} ${C} L${C} ${C - R} A${R} ${R} 0 ${share > 0.5 ? 1 : 0} 1 ${x} ${y} Z`
})

const slices = computed(() =>
  props.d > 1
    ? Array.from({ length: props.d }, (_, i) => {
        const [x, y] = point(i / props.d)
        return `M${C} ${C} L${x} ${y}`
      }).join(' ')
    : '',
)
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 120 120" role="img" :aria-label="label">
    <circle :cx="C" :cy="C" :r="R" :fill="n >= d ? color.fill : color.empty" />
    <path v-if="wedge" :d="wedge" :fill="color.fill" />
    <path v-if="slices" :d="slices" stroke="#FFFFFF" stroke-width="2.5" />
    <circle :cx="C" :cy="C" :r="R" fill="none" stroke="#12141A" stroke-width="2" />
  </svg>
</template>
