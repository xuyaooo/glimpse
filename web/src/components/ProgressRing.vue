<script setup lang="ts">
// A meter drawn as a ring: one ratio against its whole. The track is a lighter step of the
// same teal, the figure in the middle is ink, not the series colour.
import { computed } from 'vue'
import { useCountUp } from '@/lib/useCountUp'

const props = withDefaults(defineProps<{ value: number | null; size?: number; label: string }>(), { size: 132 })

const R = 52
const C = 2 * Math.PI * R
const pct = computed(() => Math.round((props.value ?? 0) * 100))
const shown = useCountUp(() => pct.value, 1100)
const offset = computed(() => C * (1 - pct.value / 100))
</script>

<template>
  <figure class="m-0 flex flex-col items-center gap-1.5">
    <div class="relative" :style="{ width: `${size}px`, height: `${size}px` }">
      <svg :width="size" :height="size" viewBox="0 0 120 120" class="-rotate-90" role="img" :aria-label="value === null ? `${label}: nothing checked yet` : `${label}: ${pct}%`">
        <circle cx="60" cy="60" :r="R" fill="none" stroke="#D5F0EC" stroke-width="11" />
        <circle
          cx="60"
          cy="60"
          :r="R"
          fill="none"
          stroke="url(#ring-fill)"
          stroke-width="11"
          stroke-linecap="round"
          :stroke-dasharray="C"
          :stroke-dashoffset="offset"
          style="transition: stroke-dashoffset 1.1s cubic-bezier(0.2, 0.8, 0.2, 1)"
        />
        <defs>
          <linearGradient id="ring-fill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#14A096" />
            <stop offset="1" stop-color="#0B6962" />
          </linearGradient>
        </defs>
      </svg>
      <span class="absolute inset-0 flex items-center justify-center text-[30px] font-black tabular-nums" aria-hidden="true">{{ value === null ? '–' : `${shown}%` }}</span>
    </div>
    <figcaption class="max-w-[120px] text-center text-[15px] font-bold leading-tight text-ink">{{ label }}</figcaption>
  </figure>
</template>
