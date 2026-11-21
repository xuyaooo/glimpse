<script setup lang="ts">
// A fraction as a pizza: d equal slices, n of them still on the plate. Slices land one by one.
import { computed } from 'vue'

const props = withDefaults(defineProps<{ n: number; d: number; size?: string; label?: string; delay?: number }>(), { size: '120px', label: '', delay: 0 })

const C = 60
const R = 52
const point = (turn: number, r = R) => {
  const a = turn * Math.PI * 2
  return [+(C + r * Math.sin(a)).toFixed(2), +(C - r * Math.cos(a)).toFixed(2)] as const
}

const slices = computed(() =>
  Array.from({ length: props.d }, (_, i) => {
    const a0 = i / props.d
    const a1 = (i + 1) / props.d
    const mid = (a0 + a1) / 2
    const span = a1 - a0
    const [x0, y0] = point(a0)
    const [x1, y1] = point(a1)
    const whole = props.d === 1
    const arc = whole ? `M${C} ${C - R} A${R} ${R} 0 1 1 ${C - 0.01} ${C - R}` : `M${x0} ${y0} A${R} ${R} 0 ${span > 0.5 ? 1 : 0} 1 ${x1} ${y1}`
    const pepperoni = [point(mid, R * 0.6), ...(span > 0.2 ? [point(mid - span * 0.2, R * 0.3), point(mid + span * 0.22, R * 0.82)] : span > 0.1 ? [point(mid, R * 0.28)] : [])]
    return {
      sector: whole ? `${arc} Z` : `M${C} ${C} L${x0} ${y0} ${arc.slice(arc.indexOf('A'))} Z`,
      crust: arc,
      pepperoni,
      onPlate: i < props.n,
      // a little gap between slices, as if just cut
      nudge: `translate(${(Math.sin(mid * 2 * Math.PI) * 2.2).toFixed(2)}px, ${(-Math.cos(mid * 2 * Math.PI) * 2.2).toFixed(2)}px)`,
    }
  }),
)
</script>

<template>
  <svg :style="{ width: size, height: size }" viewBox="0 0 120 120" class="overflow-visible" role="img" :aria-label="`${label ? `${label}: ` : ''}a pizza cut into ${d} equal slices, ${n} on the plate`">
    <circle cx="60" cy="60" r="58" fill="rgb(255 255 255 / 0.14)" stroke="rgb(255 255 255 / 0.6)" stroke-width="1.5" stroke-dasharray="4 4" />
    <g v-for="(s, i) in slices" :key="i" :style="{ transform: s.nudge }">
      <g v-if="s.onPlate" :style="{ transformBox: 'view-box', transformOrigin: '60px 60px', animation: `pop 520ms cubic-bezier(0.3, 1.5, 0.5, 1) ${delay + i * 0.09}s both` }">
        <path :d="s.sector" fill="#FFC94A" />
        <path :d="s.sector" fill="none" stroke="#F4A93B" stroke-width="1" />
        <path :d="s.crust" fill="none" stroke="#C97A2B" stroke-width="8" stroke-linecap="round" />
        <circle v-for="(p, k) in s.pepperoni" :key="k" :cx="p[0]" :cy="p[1]" r="4.6" fill="#C8352C" />
      </g>
      <path v-else :d="s.sector" fill="none" stroke="rgb(255 255 255 / 0.55)" stroke-width="1.5" stroke-dasharray="3 4" />
    </g>
  </svg>
</template>
