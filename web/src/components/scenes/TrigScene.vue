<script setup lang="ts">
// The unit circle: turn by the angle, the point lands at (cos θ, sin θ); sin is its height,
// cos how far across, tan their ratio (the slope).
import { computed } from 'vue'
import type { Scene } from '@/lib/types'

const props = defineProps<{ scene: Scene; stage: number }>()
const s = computed(() => props.scene as Scene & { fn: 'sin' | 'cos' | 'tan'; deg: number; cos: number; sin: number })
const shown = computed(() => new Set(s.value.stages.slice(0, props.stage + 1).map((st) => String(st.show))))
const R = 140
const C = { x: 320, y: 205 }
const px = computed(() => C.x + s.value.cos * R)
const py = computed(() => C.y - s.value.sin * R)
// the turn from the right-hand side: anticlockwise for a positive angle, clockwise for a
// negative one; a whole turn (or more) draws the full circle first
const arc = computed(() => {
  const r = 38
  const deg = s.value.deg
  const t = (deg * Math.PI) / 180
  const sweep = deg < 0 ? 1 : 0
  const rest = Math.abs(deg) % 360
  const full = Math.abs(deg) >= 360 ? ` A${r} ${r} 0 1 ${sweep} ${C.x - r} ${C.y} A${r} ${r} 0 1 ${sweep} ${C.x + r} ${C.y}` : ''
  const part = rest ? ` A${r} ${r} 0 ${rest > 180 ? 1 : 0} ${sweep} ${C.x + r * Math.cos(t)} ${C.y - r * Math.sin(t)}` : ''
  return `M${C.x + r} ${C.y}${full}${part}`
})
const fmt = (v: number) => String(+v.toFixed(3))
</script>

<template>
  <svg viewBox="0 0 640 400" class="absolute inset-0 size-full" role="img" :aria-label="`${s.fn} of ${s.deg} degrees`">
    <line x1="140" :y1="C.y" x2="500" :y2="C.y" stroke="#fff" stroke-opacity="0.5" stroke-width="2" />
    <line :x1="C.x" y1="40" :x2="C.x" y2="370" stroke="#fff" stroke-opacity="0.5" stroke-width="2" />
    <circle :cx="C.x" :cy="C.y" :r="R" fill="none" stroke="#fff" stroke-width="3" pathLength="1" class="scene-draw" />
    <text :x="C.x + R + 8" :y="C.y + 22" font-size="16" fill="#9fb3c8">1</text>
    <template v-if="shown.has('angle') || shown.has('point') || shown.has(s.fn)">
      <path :d="arc" fill="none" stroke="#ffd34d" stroke-width="4" pathLength="1" class="scene-draw" />
      <line :x1="C.x" :y1="C.y" :x2="px" :y2="py" stroke="#ffd34d" stroke-width="4" stroke-linecap="round" pathLength="1" class="scene-draw" />
      <text :x="C.x + 46" :y="C.y - 14" font-size="18" font-weight="900" fill="#ffd34d">{{ s.deg }}°</text>
    </template>
    <g v-if="shown.has('point') || shown.has(s.fn)" class="scene-pop">
      <line :x1="px" :y1="py" :x2="px" :y2="C.y" stroke="#f47a2a" stroke-width="4" stroke-dasharray="7 6" />
      <line :x1="C.x" :y1="C.y" :x2="px" :y2="C.y" stroke="#3fe0d0" stroke-width="4" stroke-dasharray="7 6" />
      <circle :cx="px" :cy="py" r="9" fill="#fff" stroke="#0b1d28" stroke-width="3" />
      <text :x="px + (s.cos >= 0 ? 14 : -14)" :y="py - 12" font-size="17" font-weight="900" fill="#fff" :text-anchor="s.cos >= 0 ? 'start' : 'end'">({{ fmt(s.cos) }}, {{ fmt(s.sin) }})</text>
    </g>
    <g v-if="shown.has(s.fn)" class="scene-pop">
      <text v-if="s.fn === 'sin'" :x="px + (s.cos >= 0 ? 12 : -12)" :y="(py + C.y) / 2" font-size="20" font-weight="900" fill="#f47a2a" :text-anchor="s.cos >= 0 ? 'start' : 'end'" dominant-baseline="central">sin = {{ fmt(s.sin) }}</text>
      <!-- under the axis; when the point is under it too, the radius is there: under the circle -->
      <text v-else-if="s.fn === 'cos'" :x="(C.x + px) / 2" :y="s.sin < -1e-9 ? 388 : C.y + 26" font-size="20" font-weight="900" fill="#3fe0d0" text-anchor="middle">cos = {{ fmt(s.cos) }}</text>
      <text v-else x="320" y="388" font-size="20" font-weight="900" fill="#ffd34d" text-anchor="middle">tan = sin ÷ cos = {{ Math.abs(s.cos) < 1e-9 ? 'undefined' : fmt(s.sin / s.cos) }}</text>
    </g>
  </svg>
</template>
