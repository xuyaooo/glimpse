<script setup lang="ts">
// Order of operations as a staircase: each step underlines the next operation (brackets, then
// powers, then × ÷, then + −) with its result, and the expression gets shorter. Sizes follow the
// picture's width (cqw), like the drawn scenes, so a small card shows the same as full screen.
import { computed } from 'vue'
import MathTex from '../MathTex.vue'
import type { Scene } from '@/lib/types'

const props = defineProps<{ scene: Scene; stage: number }>()
const s = computed(() => props.scene as Scene & { start: string; result: number })
const lines = computed(() => s.value.stages.slice(0, props.stage + 1).map((st) => String(st.math ?? '')))
const kid = computed(() => s.value.skin !== 'grown')
</script>

<template>
  <div class="absolute inset-0 flex flex-col items-center justify-center gap-[1.5cqw] px-[3cqw]" style="container-type: inline-size" :class="kid ? 'text-ink' : 'text-white'">
    <div v-for="(l, i) in lines" :key="`${i}-${l}`" class="flex items-center gap-[1.5cqw] transition-all duration-500" :class="i === lines.length - 1 ? 'scale-110' : 'opacity-40'" :style="{ animation: 'rise 500ms both', marginLeft: `${i * 2.25}cqw` }">
      <span class="flex size-[4cqw] items-center justify-center rounded-full text-[1.75cqw] font-black" :class="i === lines.length - 1 ? 'bg-tangerine text-white' : kid ? 'bg-line-2' : 'bg-white/15'">{{ i + 1 }}</span>
      <MathTex :latex="l" class="text-[3.8cqw]" />
    </div>
  </div>
</template>
