<script setup lang="ts">
// Chance: every possible outcome as a tile (die faces, pairs of dice, coin flips, balls in a
// bag); the favourable ones light up; probability = lit tiles ÷ all tiles.
import { computed } from 'vue'
import type { Scene } from '@/lib/types'

const props = defineProps<{ scene: Scene; stage: number }>()
const s = computed(() => props.scene as Scene & { type: string; outcomes: { label: string; good: boolean }[]; good: number; all: number })
const show = computed(() => String(s.value.stages[props.stage]?.show ?? 'all'))
const ink = computed(() => (s.value.skin === 'grown' ? '#fff' : '#18294a'))
const cols = computed(() => (s.value.all === 36 ? 6 : s.value.all <= 8 ? s.value.all : Math.ceil(Math.sqrt(s.value.all * 1.8))))
const size = computed(() => Math.min(76, 540 / cols.value, 262 / Math.ceil(s.value.all / cols.value) - 6))
const pos = (k: number) => ({ x: 320 + ((k % cols.value) - (cols.value - 1) / 2) * (size.value + 6), y: 24 + Math.floor(k / cols.value) * (size.value + 6) + size.value / 2 })
const PIPS: Record<string, string> = { 1: '⚀', 2: '⚁', 3: '⚂', 4: '⚃', 5: '⚄', 6: '⚅' }
const face = (o: { label: string }) => (s.value.type === 'die' ? PIPS[o.label] : s.value.type === 'bag' ? (o.label === 'red' ? '🔴' : '🔵') : s.value.type === 'coins' ? o.label.replace(/H/g, '🙂').replace(/T/g, '🦅') : o.label)
</script>

<template>
  <svg viewBox="0 0 640 400" class="absolute inset-0 size-full" role="img" :aria-label="`${s.good} out of ${s.all}`">
    <g v-for="(o, k) in s.outcomes" :key="k" class="scene-pop" :style="{ animationDelay: `${k * (s.all > 20 ? 0.02 : 0.08)}s` }">
      <rect :x="pos(k).x - size / 2" :y="pos(k).y - size / 2" :width="size" :height="size" rx="12" :fill="show !== 'all' && o.good ? '#ffd34d' : s.skin === 'grown' ? '#ffffff22' : '#ffffffcc'" :stroke="show !== 'all' && o.good ? '#e0a21a' : 'transparent'" stroke-width="3" style="transition: fill 400ms" />
      <text :x="pos(k).x" :y="pos(k).y + 1" :font-size="s.type === 'die' ? size * 0.75 : s.type === 'dice' ? size * 0.28 : size * (s.type === 'coins' ? 0.22 : 0.5)" :font-weight="s.type === 'dice' ? 900 : 400" :fill="show !== 'all' && o.good ? '#0b1d28' : ink" text-anchor="middle" dominant-baseline="central">{{ face(o) }}</text>
    </g>
    <g v-if="show === 'value'" class="scene-pop" style="animation-delay: 0.3s">
      <rect x="215" y="338" width="210" height="52" rx="26" fill="#0f7f76" />
      <text x="320" y="365" font-size="26" font-weight="900" fill="#fff" text-anchor="middle" dominant-baseline="central">P = {{ s.good }}/{{ s.all }}</text>
    </g>
  </svg>
</template>
