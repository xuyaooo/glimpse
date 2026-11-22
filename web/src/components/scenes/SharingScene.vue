<script setup lang="ts">
// Division as sharing: sweets dealt one at a time to each friend until they run out; what is
// left over stays in the middle. Older learners see groups taken away from a bar.
import { computed } from 'vue'
import type { Scene } from '@/lib/types'

const props = defineProps<{ scene: Scene; stage: number }>()
const s = computed(() => props.scene as Scene & { n: number; d: number; q: number; r: number })
const show = computed(() => String(s.value.stages[props.stage]?.show ?? 'start'))
const kid = computed(() => s.value.skin !== 'grown' && s.value.n <= 60)
const ink = computed(() => (s.value.skin === 'grown' ? '#fff' : '#18294a'))
const friends = computed(() => Array.from({ length: s.value.d }, (_, i) => ({ i, x: 320 + (i - (s.value.d - 1) / 2) * Math.min(120, 560 / s.value.d) })))
const FACES = ['🧒', '👧', '👦', '🧒🏽', '👧🏾', '👦🏻', '🧒🏿', '👧🏼', '👦🏽', '🧒🏻', '👧🏽', '👦🏾']
// the pile in the middle, then the sweets on each friend's plate
const pile = computed(() => Array.from({ length: s.value.n }, (_, k) => ({ k, x: 320 + ((k % 12) - 5.5) * 22, y: 70 + Math.floor(k / 12) * 22 })))
const dealt = (k: number) => show.value !== 'start' && k < s.value.q * s.value.d
const spot = (k: number) => {
  const f = friends.value[k % s.value.d]
  const row = Math.floor(k / s.value.d)
  return { x: f.x + ((row % 3) - 1) * 18, y: 300 - Math.floor(row / 3) * 18 }
}
const barW = 520
// a block of k on the bar, with a gap on each side (a thinner gap for thin blocks, so that one
// left over out of 137 is still drawn)
const block = (from: number, k: number) => {
  const w = (barW * k) / s.value.n
  const gap = Math.min(2, w / 8)
  return { x: 60 + (barW * from) / s.value.n + gap, w: Math.max(3, w - 2 * gap) }
}
</script>

<template>
  <svg viewBox="0 0 640 400" class="absolute inset-0 size-full" role="img" :aria-label="`${s.n} shared between ${s.d}`">
    <template v-if="kid">
      <g v-for="f in friends" :key="f.i">
        <text :x="f.x" y="372" font-size="40" text-anchor="middle">{{ FACES[f.i % FACES.length] }}</text>
        <ellipse :cx="f.x" cy="318" rx="34" ry="12" fill="#fff" stroke="#c9d6e3" stroke-width="2" />
        <text v-if="show === 'result'" :x="f.x" y="250" font-size="22" font-weight="900" fill="#0f7f76" text-anchor="middle" class="scene-pop">{{ s.q }}</text>
      </g>
      <text v-for="p in pile" :key="p.k" font-size="20" text-anchor="middle" dominant-baseline="central" class="scene-move" :style="{ transform: dealt(p.k) ? `translate(${spot(p.k).x}px, ${spot(p.k).y}px)` : `translate(${p.x}px, ${p.y}px)`, transitionDelay: `${dealt(p.k) ? p.k * 0.08 : 0}s` }">🍬</text>
      <text v-if="show === 'result' && s.r" x="320" y="40" font-size="20" font-weight="900" fill="#e5484d" text-anchor="middle" class="scene-pop">{{ s.r }} left over</text>
    </template>
    <template v-else>
      <rect x="60" y="150" :width="barW" height="70" rx="12" fill="none" :stroke="ink" stroke-opacity="0.5" stroke-width="3" />
      <g v-for="g in s.q" :key="g">
        <rect v-if="show !== 'start'" :x="block((g - 1) * s.d, s.d).x" y="152" :width="block((g - 1) * s.d, s.d).w" height="66" rx="10" fill="#3fe0d0" fill-opacity="0.8" class="scene-pop" :style="{ animationDelay: `${g * 0.15}s` }" />
        <text v-if="show !== 'start' && s.q <= 20" :x="60 + ((g - 0.5) * barW * s.d) / s.n" y="186" font-size="18" font-weight="900" fill="#0b1d28" text-anchor="middle" dominant-baseline="central" class="scene-pop" :style="{ animationDelay: `${g * 0.15}s` }">{{ s.d }}</text>
      </g>
      <rect v-if="show === 'result' && s.r" :x="block(s.q * s.d, s.r).x" y="152" :width="block(s.q * s.d, s.r).w" height="66" rx="10" fill="#e5484d" fill-opacity="0.7" class="scene-pop" />
      <text x="320" y="120" font-size="26" font-weight="900" :fill="ink" text-anchor="middle">{{ s.n }}</text>
      <text v-if="show === 'result'" x="320" y="280" font-size="30" font-weight="900" fill="#3fe0d0" text-anchor="middle" class="scene-pop">{{ s.q }} groups of {{ s.d }}{{ s.r ? `, ${s.r} left` : '' }}</text>
    </template>
  </svg>
</template>
