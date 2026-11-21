<script setup lang="ts">
// Today in three numbers: how much is right, right in a row, points. Bars grow beside it.
import ProgressRing from './ProgressRing.vue'
import { useCountUp } from '@/lib/useCountUp'

const props = defineProps<{ accuracy: number | null; streak: number; points: number }>()

const streakShown = useCountUp(() => props.streak)
const pointsShown = useCountUp(() => props.points, 1200)
const BARS = [0.28, 0.5, 0.74, 1]
</script>

<template>
  <section aria-label="Today" class="stagger relative max-w-[700px]" style="--d: 120ms">
    <!-- the little hill with growing bars, peeking out on the right -->
    <svg class="pointer-events-none absolute -right-2 bottom-[-14px] hidden h-[150px] w-[190px] sm:block" viewBox="0 0 190 150" aria-hidden="true">
      <path d="M0 150 C30 96 80 80 120 92 C150 100 176 118 190 150z" fill="#bfe8cc" opacity="0.9" />
      <rect
        v-for="(h, i) in BARS"
        :key="i"
        :x="58 + i * 30"
        :y="120 - h * 92"
        width="20"
        :height="h * 92"
        rx="7"
        :fill="i === BARS.length - 1 ? '#1d9560' : '#3cc48a'"
        class="svg-center"
        :style="{ transformOrigin: 'bottom', transformBox: 'fill-box', animation: `grow-y 800ms cubic-bezier(0.2,0.9,0.3,1.2) ${500 + i * 120}ms both` }"
      />
    </svg>
    <div class="relative mr-0 flex flex-wrap items-center gap-y-4 rounded-[34px] border border-white bg-white/90 px-6 py-5 shadow-[0_22px_40px_-26px_rgb(24_41_74/0.55)] backdrop-blur sm:mr-[150px]">
      <ProgressRing :value="accuracy" :size="124" label="Right today" />
      <span class="mx-6 hidden h-24 w-px bg-line sm:block" aria-hidden="true" />
      <div class="flex min-w-[110px] flex-1 flex-col items-center gap-1">
        <svg width="40" height="40" viewBox="0 0 24 24" class="svg-center" :key="`s${streak}`" :style="streak ? { animation: 'pop 600ms both' } : undefined" aria-hidden="true">
          <defs>
            <linearGradient id="flame" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFB547" /><stop offset="1" stop-color="#F0512A" /></linearGradient>
          </defs>
          <path d="M12 2.5c.6 3-1.2 4.6-2.6 6.3C8 10.5 6.5 12.4 6.5 15a5.5 5.5 0 0 0 11 0c0-2.6-1.3-4.3-2.3-5.4-.3 1.3-1 2.3-2 2.7.4-3.3-.2-7-1.2-9.8z" fill="url(#flame)" />
          <path d="M12 21a2.8 2.8 0 0 1-2.8-2.8c0-1.6 1.2-2.6 2.1-3.7.3 1 .9 1.5 1.6 1.7.1-.7.4-1.3.8-1.7.7.9 1.1 1.8 1.1 3.7A2.8 2.8 0 0 1 12 21z" fill="#FFE08A" />
        </svg>
        <span class="text-[32px] font-black leading-none tabular-nums">{{ streakShown }}</span>
        <span class="text-[15px] font-semibold text-ink-2">Right in a row</span>
      </div>
      <span class="mx-6 hidden h-24 w-px bg-line sm:block" aria-hidden="true" />
      <div class="relative flex min-w-[110px] flex-1 flex-col items-center gap-1">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="#F5A524" aria-hidden="true"><path d="M7 3h10v2h3v3a4 4 0 0 1-4 4h-.4A5 5 0 0 1 13 14.9V17h3v3H8v-3h3v-2.1A5 5 0 0 1 8.4 12H8a4 4 0 0 1-4-4V5h3zm0 4H6v1a2 2 0 0 0 1 1.7zm10 0v2.7A2 2 0 0 0 18 8V7z" /></svg>
        <span class="text-[32px] font-black leading-none tabular-nums">{{ pointsShown }}</span>
        <span class="text-[15px] font-semibold text-ink-2">Points</span>
        <span v-if="points" :key="points" class="pointer-events-none absolute -top-1 right-2 text-sm font-black text-right" style="animation: float-up 1.4s ease-out both">+10</span>
      </div>
    </div>
  </section>
</template>
