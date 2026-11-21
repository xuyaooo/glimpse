<script setup lang="ts">
// A short burst of paper confetti. Bump `burst` to fire it.
import { ref, watch } from 'vue'
import { prefersReducedMotion } from '@/lib/ui'

const props = defineProps<{ burst: number }>()

const COLORS = ['#FFC93C', '#14A096', '#F47A2A', '#7C5CE8', '#1F5FD6', '#22A06B']
const pieces = ref<{ id: number; style: Record<string, string> }[]>([])
let timer = 0

watch(
  () => props.burst,
  (n) => {
    if (!n || prefersReducedMotion()) return
    pieces.value = Array.from({ length: 22 }, (_, i) => {
      const angle = (Math.PI * 2 * i) / 22 + Math.random() * 0.4
      const dist = 70 + Math.random() * 90
      return {
        id: n * 100 + i,
        style: {
          '--x': `${Math.cos(angle) * dist}px`,
          '--y': `${Math.sin(angle) * dist - 40}px`,
          '--r': `${Math.random() * 720 - 360}deg`,
          background: COLORS[i % COLORS.length],
          width: `${6 + (i % 3) * 2}px`,
          height: `${10 - (i % 3) * 2}px`,
          animation: `confetti ${0.9 + Math.random() * 0.5}s cubic-bezier(0.15, 0.7, 0.3, 1) forwards`,
        },
      }
    })
    window.clearTimeout(timer)
    timer = window.setTimeout(() => (pieces.value = []), 1600)
  },
  { immediate: true },
)
</script>

<template>
  <span class="pointer-events-none absolute left-1/2 top-1/2 z-30" aria-hidden="true">
    <span v-for="p in pieces" :key="p.id" class="absolute rounded-[2px]" :style="p.style" />
  </span>
</template>
