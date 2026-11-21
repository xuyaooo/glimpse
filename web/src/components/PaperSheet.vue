<script setup lang="ts">
// The worksheet as the camera sees it. In demo mode this stands in for the live video;
// the real app draws the same marks over the camera image (see LiveView).
import Frac from './Frac.vue'
import type { Frac as F, Mark, Problem } from '@/lib/types'

withDefaults(
  defineProps<{
    problems: Problem[]
    written?: Record<number, F>
    marks?: Record<number, Mark>
    pointing?: { problem: number; token: string } | null
    detectMarkers?: boolean
    title?: string
  }>(),
  { written: () => ({}), marks: () => ({}), pointing: null, detectMarkers: false, title: 'Fractions, sheet 1' },
)
</script>

<template>
  <div class="relative w-[480px] max-w-full shrink-0 bg-squared-fine shadow-[0_18px_40px_rgba(0,0,0,0.45)] -rotate-[1.5deg]" style="aspect-ratio: 480 / 640">
    <!-- ArUco corner markers -->
    <span
      v-for="corner in ['left-3.5 top-3.5', 'right-3.5 top-3.5', 'left-3.5 bottom-3.5', 'right-3.5 bottom-3.5']"
      :key="corner"
      class="absolute size-[30px] bg-black"
      :class="[corner, detectMarkers ? 'outline-[3px] outline-offset-[5px] outline-[#4f7bff]' : '']"
      :style="detectMarkers ? { outlineStyle: 'solid' } : undefined"
      aria-hidden="true"
    />
    <div class="absolute left-[60px] right-[60px] top-6 text-xs font-bold tracking-[0.04em] text-ink-2">{{ title }}</div>

    <ol class="absolute inset-x-9 top-[64px] flex flex-col gap-3.5 text-2xl text-ink" aria-label="Problems on the worksheet">
      <li
        v-for="p in problems"
        :key="p.id"
        class="flex min-h-[78px] items-center gap-2.5 rounded-md px-4 py-2.5 transition-opacity"
        :class="[
          marks[p.id]?.verdict === 'next' ? 'border-2 border-dashed border-pen' : pointing?.problem === p.id ? 'border-2 border-pen bg-pen-soft/60' : 'border-[1.5px] border-rule',
          pointing && pointing.problem !== p.id ? 'opacity-50' : '',
        ]"
      >
        <span class="w-[18px] text-sm text-ink-2">{{ p.id }}</span>
        <Frac :n="p.a.n" :d="p.a.d" />
        <span aria-hidden="true">+</span>
        <Frac :n="p.b.n" :d="p.b.d" />
        <span aria-hidden="true">=</span>

        <span v-if="written[p.id]" class="relative ml-1.5 inline-flex">
          <!-- The orange circle draws itself in, like a teacher's marker. -->
          <span v-if="marks[p.id]?.verdict === 'wrong'" class="pointer-events-none absolute -inset-x-4 -inset-y-2.5 -rotate-[10deg]" aria-hidden="true">
            <svg class="size-full overflow-visible" viewBox="0 0 100 60" preserveAspectRatio="none">
              <ellipse class="draw-in" cx="50" cy="30" rx="49" ry="29" fill="none" stroke="#E8620F" stroke-width="3.5" vector-effect="non-scaling-stroke" pathLength="1" />
            </svg>
          </span>
          <Frac :n="written[p.id].n" :d="written[p.id].d" hand :outline-den="pointing?.problem === p.id" />
          <!-- Fingertip from hand tracking, with its landmarks -->
          <span
            v-if="pointing?.problem === p.id"
            class="absolute left-1 top-[60px] h-[200px] w-[30px] origin-[15px_0] -rotate-[28deg] rounded-[16px_16px_12px_12px] bg-[#cf9f7e] shadow-[0_8px_18px_rgba(0,0,0,0.25)]"
            aria-hidden="true"
          >
            <span v-for="top in [4, 58, 112, 170]" :key="top" class="absolute left-2 size-[9px] rounded-full border-2 border-pen bg-white" :style="{ top: `${top}px` }" />
          </span>
        </span>

        <svg v-if="marks[p.id]?.verdict === 'correct'" class="ml-auto shrink-0" width="40" height="34" viewBox="0 0 40 34" role="img" aria-label="Correct">
          <path d="M4 18 L15 29 L36 5" fill="none" stroke="#2452CC" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span v-else-if="marks[p.id]?.verdict === 'wrong' && marks[p.id]?.label" class="ml-auto max-w-[150px] rounded-lg bg-marker px-2.5 py-1.5 text-[13px] font-bold leading-tight text-white">
          {{ marks[p.id]?.label }}
        </span>
        <span v-else-if="pointing?.problem === p.id" class="ml-auto rounded-lg bg-pen px-2.5 py-1.5 text-[13px] font-bold text-white">you pointed at: {{ pointing.token }}</span>
        <span v-else-if="marks[p.id]?.verdict === 'next'" class="ml-auto rounded-lg bg-pen px-2.5 py-1.5 text-[13px] font-bold text-white">{{ marks[p.id]?.label ?? 'next' }}</span>
      </li>
    </ol>
  </div>
</template>
