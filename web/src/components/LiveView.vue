<script setup lang="ts">
// The child's paper, live. With an engine: its MJPEG stream plus our marks drawn on top
// (the engine sends each mark's box already mapped into camera coordinates).
// In demo mode: the drawn worksheet.
import PaperSheet from './PaperSheet.vue'
import { state, VIDEO_URL } from '@/lib/engine'

withDefaults(defineProps<{ caption?: string; pointing?: { problem: number; token: string } | null }>(), {
  caption: 'Glimpse reads a line only when you lift your pen',
  pointing: null,
})
</script>

<template>
  <section aria-label="Your paper, live" class="flex min-w-0 flex-col gap-3 rounded-[10px] bg-stage p-4">
    <div class="flex flex-wrap justify-between gap-2 text-[13px] text-[#c4cad5]">
      <span class="inline-flex items-center gap-2 font-bold text-white"><span class="size-2 rounded-full bg-[#ff8a3d]" />Live view of your paper</span>
      <span>{{ caption }}</span>
    </div>

    <div v-if="state.connection === 'live' && state.camera" class="relative aspect-video overflow-hidden rounded-xl bg-table">
      <img :src="VIDEO_URL" alt="Live camera view of the worksheet" class="size-full object-fill" />
      <svg class="absolute inset-0 size-full" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
        <template v-for="m in Object.values(state.marks)" :key="m.problem">
          <ellipse
            v-if="m.box && m.verdict === 'wrong'"
            class="draw-in"
            :cx="m.box[0] + m.box[2] / 2"
            :cy="m.box[1] + m.box[3] / 2"
            :rx="m.box[2] / 2 + 0.02"
            :ry="m.box[3] / 2 + 0.02"
            fill="none"
            stroke="#E8620F"
            stroke-width="4"
            vector-effect="non-scaling-stroke"
            pathLength="1"
          />
          <rect
            v-else-if="m.box && m.verdict === 'correct'"
            :x="m.box[0]"
            :y="m.box[1]"
            :width="m.box[2]"
            :height="m.box[3]"
            fill="none"
            stroke="#2452CC"
            stroke-width="3"
            vector-effect="non-scaling-stroke"
          />
        </template>
      </svg>
    </div>

    <div v-else class="flex min-h-[560px] flex-1 items-center justify-center overflow-hidden rounded-xl bg-table p-6">
      <PaperSheet :problems="state.problems" :written="state.written" :marks="state.marks" :pointing="pointing" />
    </div>
  </section>
</template>
