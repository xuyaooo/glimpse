<script setup lang="ts">
// The tutor's drawing on the desk next to the paper: pizzas, chocolate bars or a worked
// example, with the current step written underneath. Sizes follow the panel (cqw units).
import ChocolateBar from './ChocolateBar.vue'
import Pizza from './Pizza.vue'
import HandMath from '../HandMath.vue'
import type { Tone, Visual } from '@/lib/types'

defineProps<{ visual: Visual; title: string; titleLang?: string; caption: string; captionLang?: string; step: number; steps: number }>()

const LABEL: Record<Tone, string> = { pen: '#A9CBFF', marker: '#FFB98A' }
const RELATION = { '<': 'is smaller than', '>': 'is bigger than', '=': 'is the same as' }
</script>

<template>
  <div class="flex size-full flex-col items-center justify-center gap-[4cqw] rounded-[7cqw] bg-[#0b1d28]/62 p-[6cqw] text-white ring-1 ring-white/25 backdrop-blur-md" style="animation: rise 600ms cubic-bezier(0.2, 0.8, 0.2, 1) both">
    <p :lang="titleLang" class="text-center font-marker text-[9.5cqw] font-bold leading-[1.05]" style="text-shadow: 0 2px 10px rgb(0 0 0 / 0.45)">{{ title }}</p>

    <div v-if="visual.kind === 'compare_pies'" class="flex flex-col items-center gap-[1.5cqw]">
      <Pizza :n="visual.left.n" :d="visual.left.d" size="40cqw" :label="visual.left.label" :delay="0.3" />
      <span class="font-marker text-[7cqw] font-bold" :style="{ color: LABEL[visual.left.tone] }">{{ visual.left.label }}</span>
      <span class="font-marker text-[15cqw] font-bold leading-[0.8]" :aria-label="RELATION[visual.relation]" style="animation: pop 500ms cubic-bezier(0.3, 1.6, 0.5, 1) 1.2s both">{{ visual.relation }}</span>
      <Pizza :n="visual.right.n" :d="visual.right.d" size="40cqw" :label="visual.right.label" :delay="1.4" />
      <span class="font-marker text-[7cqw] font-bold" :style="{ color: LABEL[visual.right.tone] }">{{ visual.right.label }}</span>
    </div>

    <div v-else-if="visual.kind === 'bar_model'" class="flex w-full flex-col gap-[3cqw]">
      <template v-for="(row, r) in visual.rows" :key="r">
        <p v-if="row.note" class="font-marker text-[6.5cqw] font-bold leading-tight text-[#FFD37A]" :style="{ animation: `rise 500ms ${r * 0.5}s both` }">↓ {{ row.note }}</p>
        <div class="flex items-center gap-[3cqw]">
          <span class="w-[17cqw] shrink-0 text-right font-marker text-[8cqw] font-bold" :style="{ color: LABEL[row.tone] }">{{ row.label }}</span>
          <ChocolateBar class="flex-1" :n="row.n" :d="row.d" :delay="r * 0.5" />
        </div>
      </template>
    </div>

    <div v-else class="-rotate-2 rounded-[3cqw] bg-note px-[6cqw] py-[5cqw] text-ink shadow-[0_14px_24px_-12px_rgb(0_0_0/0.6)]">
      <p class="font-marker text-[6.5cqw] font-bold text-[#9a4a10]">{{ visual.caption }}</p>
      <HandMath v-for="(line, i) in visual.lines" :key="i" :latex="line" size="9cqw" color="#1a1c22" :delay="i * 0.9" />
    </div>

    <p v-if="caption" :key="caption" :lang="captionLang" class="write-on text-center font-marker text-[7.5cqw] font-bold leading-snug" style="--dur: 1.1s; text-shadow: 0 2px 8px rgb(0 0 0 / 0.5)">{{ caption }}</p>
    <span v-if="steps > 1" class="flex gap-[1.6cqw]" aria-hidden="true">
      <span v-for="i in steps" :key="i" class="h-[2cqw] rounded-full transition-all duration-500" :class="i - 1 === step ? 'w-[7cqw] bg-white' : 'w-[2cqw] bg-white/40'" />
    </span>
  </div>
</template>
