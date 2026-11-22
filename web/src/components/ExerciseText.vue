<script setup lang="ts">
// An exercise as it should be read: a worded one ("How long does it take to drive 150 km at
// 60 km/h?") as text that wraps, maths as a formula (that scrolls sideways if it is too long).
import { computed } from 'vue'
import MathTex from './MathTex.vue'
import { titleTex, wordsOnly } from '@/lib/latex'

const props = defineProps<{
  latex: string | null | undefined
  /** Classes for a formula (its size). */
  math?: string
  /** Classes for words (their size, weight). */
  words?: string
}>()
const text = computed(() => wordsOnly(props.latex))
</script>

<template>
  <span v-if="text" class="block min-w-0 break-words leading-snug" :class="words ?? 'text-[17px] font-bold'">{{ text }}</span>
  <MathTex v-else :latex="titleTex(latex)" class="block min-w-0 max-w-full overflow-x-auto" :class="math" />
</template>
