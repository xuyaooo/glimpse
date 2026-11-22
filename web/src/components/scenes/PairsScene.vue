<script setup lang="ts">
// 1 + 2 + ... + n, the pairing trick: write the numbers forwards and backwards, every column
// adds up to n + 1, there are n columns, and that is the sum twice.
import { computed } from 'vue'
import type { Scene } from '@/lib/types'

const props = defineProps<{ scene: Scene; stage: number }>()
const s = computed(() => props.scene as Scene & { n: number; total: number })
const ink = computed(() => (s.value.skin === 'grown' ? '#ffffff' : '#18294a'))
// every number when there are few (each one once), else the first four, ..., the last two
const cols = computed(() => {
  const n = s.value.n
  const top = n <= 7 ? Array.from({ length: n }, (_, i) => i + 1) : [1, 2, 3, 4, null, n - 1, n]
  return top.map((v, i) => ({ top: v, bottom: v === null ? null : n + 1 - v, i, x: 320 + (i - (top.length - 1) / 2) * 83 }))
})
</script>

<template>
  <svg viewBox="0 0 640 400" class="absolute inset-0 size-full" role="img" :aria-label="`1 to ${s.n}: ${s.total}`">
    <g v-for="c in cols" :key="c.i">
      <g class="scene-pop" :style="{ animationDelay: `${c.i * 0.1}s` }">
        <rect v-if="c.top !== null" :x="c.x - 34" y="60" width="68" height="56" rx="14" fill="#ffffff" stroke="#1f5fd6" stroke-width="3" />
        <text :x="c.x" y="89" :font-size="c.top === null ? 34 : 24" font-weight="900" :fill="c.top === null ? ink : '#1f5fd6'" text-anchor="middle" dominant-baseline="central">{{ c.top ?? '…' }}</text>
      </g>
      <g v-if="stage >= 1" class="scene-pop" :style="{ animationDelay: `${(cols.length - 1 - c.i) * 0.1}s` }">
        <rect v-if="c.bottom !== null" :x="c.x - 34" y="150" width="68" height="56" rx="14" fill="#ffffff" stroke="#f47a2a" stroke-width="3" />
        <text :x="c.x" y="179" :font-size="c.bottom === null ? 34 : 24" font-weight="900" :fill="c.bottom === null ? ink : '#f47a2a'" text-anchor="middle" dominant-baseline="central">{{ c.bottom ?? '…' }}</text>
      </g>
      <g v-if="stage >= 2 && c.top !== null" class="scene-pop" :style="{ animationDelay: `${0.3 + c.i * 0.15}s` }">
        <text :x="c.x" y="134" font-size="22" font-weight="900" :fill="ink" text-anchor="middle" dominant-baseline="central">+</text>
        <rect :x="c.x - 36" y="226" width="72" height="44" rx="22" fill="#22a06b" />
        <text :x="c.x" y="248" font-size="21" font-weight="900" fill="#fff" text-anchor="middle" dominant-baseline="central">{{ s.n + 1 }}</text>
      </g>
    </g>
    <text v-if="stage >= 3" x="320" y="318" font-size="28" font-weight="900" :fill="ink" text-anchor="middle" class="scene-pop">{{ s.n }} pairs × {{ s.n + 1 }} = {{ s.n * (s.n + 1) }}</text>
    <g v-if="stage >= 4" class="scene-pop" style="animation-delay: 0.3s">
      <rect x="170" y="338" width="300" height="52" rx="26" fill="#0f7f76" />
      <text x="320" y="365" font-size="26" font-weight="900" fill="#fff" text-anchor="middle" dominant-baseline="central">÷ 2 = {{ s.total }}</text>
    </g>
  </svg>
</template>
