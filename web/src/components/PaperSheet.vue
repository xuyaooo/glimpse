<script setup lang="ts">
// The paper as the camera sees it, in demo mode: the child's pencil plus the marks the tutor
// draws on it. With a real camera, the scan window's ArLayer draws the same marks over the video.
import { computed } from 'vue'
import Frac from './Frac.vue'
import { tokens } from '@/lib/latex'
import type { WrittenPart } from '@/lib/types'

const props = withDefaults(defineProps<{ parts: WrittenPart[]; pointing?: { partId: number; token: string } | null; name?: string }>(), {
  pointing: null,
  name: '',
})

// The paper has room for the last six lines.
const lines = computed(() =>
  props.parts.slice(-6).map((p) => {
    const t = tokens(p.latex)
    const lastFrac = t.map((x) => x.kind).lastIndexOf('frac')
    return { part: p, head: t.slice(0, lastFrac), last: t[lastFrac] }
  }),
)
</script>

<template>
  <div class="relative w-[380px] max-w-full shrink-0 -rotate-[1.5deg] bg-squared-fine shadow-[0_22px_44px_rgba(0,0,0,0.45)]" style="aspect-ratio: 3 / 4">
    <span v-for="c in ['left-3 top-3', 'right-3 top-3', 'left-3 bottom-3', 'right-3 bottom-3']" :key="c" class="absolute size-6 bg-black" :class="c" aria-hidden="true" />
    <span v-if="name" class="absolute left-12 top-3 font-pencil text-xl text-[#2a2d33]">{{ name }}</span>

    <ol class="absolute inset-x-7 top-14 m-0 flex list-none flex-col gap-2 p-0 text-[24px]" aria-label="The child's paper">
      <li
        v-for="{ part, head, last } in lines"
        :key="part.id"
        class="relative flex min-h-[58px] items-center gap-1.5 rounded-md px-2 transition-all duration-500"
        :class="[
          part.verdict === 'reading' ? 'bg-lagoon-bright/10 outline-2 outline-dashed outline-lagoon-bright' : '',
          part.verdict === 'unsure' ? 'outline-2 outline-dashed outline-[#e0a21a]' : '',
          pointing?.partId === part.id ? 'bg-marker-soft' : '',
          pointing && pointing.partId !== part.id ? 'opacity-45' : '',
        ]"
        style="animation: write-on 900ms steps(20, end) backwards"
      >
        <template v-for="(t, i) in head" :key="i">
          <Frac v-if="t.kind === 'frac'" :n="t.n" :d="t.d" />
          <span v-else class="font-pencil text-[#2a2d33]">{{ t.v }}</span>
        </template>
        <span v-if="last && last.kind === 'frac'" class="relative inline-flex">
          <span v-if="part.verdict === 'wrong'" class="pointer-events-none absolute -inset-x-3.5 -inset-y-2 -rotate-[10deg]" aria-hidden="true">
            <svg class="size-full overflow-visible" viewBox="0 0 100 60" preserveAspectRatio="none">
              <ellipse class="draw" style="--dur: 0.65s; --delay: 0.1s" cx="50" cy="30" rx="49" ry="29" fill="none" stroke="#E8620F" stroke-width="3.5" vector-effect="non-scaling-stroke" pathLength="1" />
            </svg>
          </span>
          <Frac :n="last.n" :d="last.d" :outline-den="pointing?.partId === part.id" />
          <span
            v-if="pointing?.partId === part.id"
            class="absolute left-0.5 top-[52px] z-10 h-[170px] w-[26px] origin-[13px_0] -rotate-[28deg] rounded-[14px_14px_10px_10px] bg-[#cf9f7e] shadow-[0_8px_18px_rgba(0,0,0,0.25)]"
            style="animation: rise 500ms both"
            aria-hidden="true"
          >
            <span v-for="top in [4, 50, 96, 146]" :key="top" class="absolute left-[7px] size-2 rounded-full border-2 border-marker bg-white" :style="{ top: `${top}px` }" />
          </span>
        </span>
        <svg v-if="part.verdict === 'correct'" class="ml-auto shrink-0" width="34" height="28" viewBox="0 0 40 34" role="img" aria-label="Correct">
          <path class="draw" pathLength="1" style="--dur: 0.45s" d="M4 18 L15 29 L36 5" fill="none" stroke="#22A06B" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </li>
    </ol>
  </div>
</template>
