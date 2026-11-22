<script setup lang="ts">
// Adding or subtracting in columns: ones under ones, one column at a time from the right, with
// the carried ten (or the borrowed one) drawn above the next column.
import { computed } from 'vue'
import type { Scene } from '@/lib/types'

const props = defineProps<{ scene: Scene; stage: number }>()
const s = computed(() => props.scene as Scene & { a: number; b: number; op: '+' | '-'; width: number; da: (number | null)[]; db: (number | null)[]; result: number })
const st = computed(() => s.value.stages[props.stage] as unknown as { col: number; digits?: (number | null)[]; carries: number[] })
const ink = computed(() => (s.value.skin === 'grown' ? '#fff' : '#18294a'))
const W = computed(() => Math.min(76, 440 / s.value.width))
const x = (i: number) => 320 - ((s.value.width - 1) / 2 - i) * W.value
</script>

<template>
  <svg viewBox="0 0 640 400" class="absolute inset-0 size-full" role="img" :aria-label="`${s.a} ${s.op} ${s.b} in columns`">
    <!-- the column being worked on -->
    <rect v-if="st.col >= 0" :key="st.col" :x="x(st.col) - W / 2 + 4" y="40" :width="W - 8" height="300" rx="14" fill="#ffd34d" fill-opacity="0.35" class="scene-pop" />
    <!-- carries / borrows -->
    <text v-for="c in st.carries" :key="`c${c}`" :x="x(c)" y="78" font-size="26" font-weight="900" fill="#e5484d" text-anchor="middle" class="scene-pop">{{ s.op === '+' ? '1' : '−1' }}</text>
    <text v-for="(d, i) in s.da" :key="`a${i}`" :x="x(i)" y="140" font-size="54" font-weight="900" :fill="ink" text-anchor="middle">{{ d ?? '' }}</text>
    <text :x="x(0) - W * 0.9" y="210" font-size="54" font-weight="900" fill="#f47a2a" text-anchor="middle">{{ s.op === '+' ? '+' : '−' }}</text>
    <text v-for="(d, i) in s.db" :key="`b${i}`" :x="x(i)" y="210" font-size="54" font-weight="900" :fill="ink" text-anchor="middle">{{ d ?? '' }}</text>
    <line :x1="x(0) - W" y1="236" :x2="x(s.width - 1) + W / 2" y2="236" :stroke="ink" stroke-width="5" stroke-linecap="round" />
    <template v-if="st.digits">
      <text v-for="(d, i) in st.digits" :key="`r${i}-${d}`" :x="x(i)" y="300" font-size="54" font-weight="900" fill="#0f7f76" text-anchor="middle" class="scene-pop">{{ d ?? '' }}</text>
    </template>
  </svg>
</template>
