<script setup lang="ts">
// The tutor's explanation, drawn straight onto the squared page next to the child's paper.
import PieFraction from './PieFraction.vue'
import FractionBar from './FractionBar.vue'
import type { Explanation } from '@/lib/types'

defineProps<{ explanation: Explanation | null; activeStep: number; idleText: string }>()
defineEmits<{ next: [] }>()

const RELATION = { '<': 'is smaller than', '>': 'is bigger than', '=': 'is the same as' }
</script>

<template>
  <section aria-live="polite" aria-label="Explanation" class="flex min-w-0 flex-col gap-5 py-2 pl-3 pr-2">
    <template v-if="explanation">
      <div class="flex flex-col gap-1.5">
        <span class="text-base font-bold" :class="explanation.visual.kind === 'bar_model' ? 'text-pen-deep' : 'text-marker-ink'">{{ explanation.heading }}</span>
        <h2 :lang="explanation.titleLang" class="text-[30px] font-bold leading-[1.15] tracking-[-0.01em]">{{ explanation.title }}</h2>
      </div>

      <div v-if="explanation.visual.kind === 'compare_pies'" class="flex flex-wrap items-center justify-center gap-[18px] rounded border-[1.5px] border-ink bg-paper px-4 py-[22px]">
        <figure class="m-0 flex flex-col items-center gap-2">
          <PieFraction v-bind="explanation.visual.left" />
          <figcaption class="text-[15px] font-bold" :class="explanation.visual.left.tone === 'marker' ? 'text-marker-ink' : 'text-pen-deep'">{{ explanation.visual.left.label }}</figcaption>
        </figure>
        <span class="text-[44px] font-bold" :aria-label="RELATION[explanation.visual.relation]">{{ explanation.visual.relation }}</span>
        <figure class="m-0 flex flex-col items-center gap-2">
          <PieFraction v-bind="explanation.visual.right" />
          <figcaption class="text-[15px] font-bold" :class="explanation.visual.right.tone === 'marker' ? 'text-marker-ink' : 'text-pen-deep'">{{ explanation.visual.right.label }}</figcaption>
        </figure>
      </div>

      <div v-else class="flex flex-col gap-3.5 rounded border-[1.5px] border-ink bg-paper px-5 py-[22px]">
        <template v-for="row in explanation.visual.rows" :key="row.label">
          <div v-if="row.note" class="flex items-center gap-2.5 pl-[58px] text-sm font-bold text-marker-ink">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6" /></svg>
            {{ row.note }}
          </div>
          <div class="flex items-center gap-3.5">
            <span class="w-11 text-right text-lg font-bold">{{ row.label }}</span>
            <FractionBar :n="row.n" :d="row.d" :tone="row.tone" />
          </div>
        </template>
      </div>

      <ol class="m-0 flex list-none flex-col gap-3 p-0">
        <li v-for="(step, i) in explanation.steps" :key="i" class="flex items-start gap-3 text-[17px] leading-[1.45]" :class="i <= activeStep ? 'font-bold text-ink' : 'text-ink-2'">
          <span class="flex size-7 shrink-0 items-center justify-center rounded-full text-sm" :class="i <= activeStep ? 'bg-pen text-white' : 'bg-mute text-ink-2'">{{ i + 1 }}</span>
          {{ step }}
        </li>
      </ol>

      <button
        v-if="activeStep < explanation.steps.length - 1"
        type="button"
        class="mt-auto flex min-h-[52px] items-center justify-center rounded-[14px] border-2 border-pen bg-paper text-[17px] font-bold text-pen-deep"
        @click="$emit('next')"
      >
        Show me the next step
      </button>
    </template>

    <div v-else class="flex flex-1 flex-col justify-center gap-4 py-10">
      <p class="m-0 max-w-[420px] text-[26px] font-bold leading-snug">{{ idleText }}</p>
      <p class="m-0 max-w-[420px] text-base text-ink-2">If something looks off, Glimpse will draw it here and say it out loud.</p>
    </div>
  </section>
</template>
