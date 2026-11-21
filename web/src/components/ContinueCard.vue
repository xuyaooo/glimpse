<script setup lang="ts">
// "Continue your practice": the paper on the desk, the subject and topic, how far today got,
// and Continue, which opens the camera.
import { computed, onBeforeUnmount, ref } from 'vue'
import PaperSheet from './PaperSheet.vue'
import type { Subject } from '@/lib/subjects'
import type { WrittenPart } from '@/lib/types'

const props = defineProps<{ parts: WrittenPart[]; name: string; subject: Subject; startedAt: number }>()
defineEmits<{ open: [] }>()

const now = ref(Date.now())
const timer = window.setInterval(() => (now.value = Date.now()), 30_000)
onBeforeUnmount(() => window.clearInterval(timer))

const progress = computed(() => {
  const n = props.parts.length
  if (!n) return 'Nothing written yet'
  const lines = `${n} ${n === 1 ? 'line' : 'lines'} checked`
  const min = props.startedAt ? Math.max(1, Math.round((now.value - props.startedAt) / 60_000)) : 0
  return min ? `${lines} in ${min} min` : lines
})
const DOT = { correct: 'bg-right-mark', wrong: 'bg-wrong-mark', reading: 'bg-lagoon-bright animate-pulse', unsure: 'bg-sun' }
</script>

<template>
  <section aria-labelledby="continue-title" class="card stagger relative overflow-hidden p-5 sm:p-7" style="--d: 260ms">
    <!-- maths symbols drifting on the right, and a little hill -->
    <div class="pointer-events-none absolute inset-y-0 right-0 hidden w-[260px] md:block" aria-hidden="true">
      <svg class="absolute bottom-0 right-0 h-[150px] w-[260px]" viewBox="0 0 260 150">
        <path d="M0 150 C50 104 110 92 160 104 C200 113 236 96 260 86 L260 150z" fill="#e6f3fb" />
        <path d="M70 150 C120 118 180 116 260 128 L260 150z" fill="#d6ecf5" />
        <g fill="#7fb7a6"><path d="M214 112 l-14 30 h28z M214 99 l-11 22 h22z" /><path d="M238 120 l-9 20 h18z" /></g>
      </svg>
      <span class="absolute right-16 top-24 text-[38px] font-black text-marker/70" style="animation: float-sym 4s ease-in-out infinite">+</span>
      <span class="absolute right-8 top-36 text-[34px] font-black text-lagoon/60" style="animation: float-sym 5s ease-in-out -1.5s infinite">÷</span>
      <span class="absolute right-40 top-48 text-[30px] font-black text-marker/50" style="animation: float-sym 4.6s ease-in-out -3s infinite">×</span>
    </div>

    <div class="relative flex flex-wrap items-center gap-3 border-b border-line pb-4">
      <h2 id="continue-title" class="flex items-center gap-3 text-[23px] font-black">
        <svg width="34" height="34" viewBox="0 0 32 32" aria-hidden="true" style="animation: float-sym 3.4s ease-in-out infinite">
          <path d="M8 22c-2 1-3 4-3 6 2 0 5-1 6-3z" fill="#F47A2A" />
          <path d="M9 23l-1-4c2-7 8-13 18-14-1 10-7 16-14 18z" fill="#E8EEF8" stroke="#1F5FD6" stroke-width="1.6" stroke-linejoin="round" />
          <circle cx="19" cy="13" r="2.6" fill="#1F5FD6" />
          <path d="M9 19l-4 0 3-5 4 1M13 23v4l5-3-1-4" fill="#E5484D" />
        </svg>
        Continue your practice
      </h2>
      <RouterLink :to="{ name: 'work' }" class="group ml-auto inline-flex items-center gap-1.5 text-[16px] font-bold text-marker underline decoration-2 underline-offset-4">
        View all
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" class="transition-transform group-hover:translate-x-1" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </RouterLink>
    </div>

    <div class="relative mt-5 flex flex-wrap items-center gap-6 md:gap-8">
      <!-- the paper on a wooden desk, as the camera last saw it -->
      <div class="relative h-[200px] w-full max-w-[290px] shrink-0 overflow-hidden rounded-[22px] shadow-[0_18px_30px_-18px_rgb(24_41_74/0.6)] transition-transform duration-500 hover:-rotate-1 hover:scale-[1.02]" style="background: linear-gradient(150deg, #c99766, #a8744a 60%, #93623c)">
        <div class="absolute left-[46px] top-[14px] origin-top-left -rotate-[5deg] scale-[0.5]">
          <PaperSheet :parts="parts" :name="name" />
        </div>
        <svg class="absolute bottom-3 right-4 h-[120px] w-[22px] rotate-[18deg]" viewBox="0 0 22 120" aria-hidden="true">
          <rect x="4" y="0" width="14" height="96" rx="2" fill="#f4b400" />
          <rect x="4" y="0" width="14" height="10" rx="2" fill="#e5484d" />
          <path d="M4 96 L11 118 L18 96z" fill="#f3d7a8" />
          <path d="M9 112 L11 118 L13 112z" fill="#18294a" />
        </svg>
      </div>

      <div class="flex min-w-[220px] flex-1 flex-col items-start gap-1.5">
        <Transition name="fade" mode="out-in">
          <div :key="subject.id" class="flex flex-col items-start gap-1.5">
            <span class="rounded-full bg-marker-soft px-3 py-1 text-[15px] font-black text-marker">{{ subject.name }}</span>
            <span class="text-[26px] font-black leading-tight">{{ subject.topic }}</span>
          </div>
        </Transition>
        <span class="text-[17px] font-semibold text-ink-2">{{ progress }}</span>
        <div v-if="parts.length" class="my-1 flex items-center" aria-hidden="true">
          <template v-for="(p, i) in parts.slice(-7)" :key="p.id">
            <span v-if="i > 0" class="h-[3px] w-4 bg-line" />
            <span class="size-3 shrink-0 animate-pop rounded-full" :class="DOT[p.verdict]" />
          </template>
        </div>
        <button
          type="button"
          class="group relative mt-2 inline-flex min-h-[58px] items-center gap-3 overflow-hidden rounded-full px-9 text-[20px] font-black text-white shadow-[0_16px_28px_-14px_rgb(29_79_176/0.8)] transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97]"
          style="background: linear-gradient(180deg, #2f72dc, #1c4fae)"
          :style="parts.length ? undefined : { animation: 'pulse-ring 1.8s ease-out infinite' }"
          @click="$emit('open')"
        >
          <span class="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-white/25 opacity-0 group-hover:opacity-100" style="animation: shine 1.1s ease-in-out infinite" />
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" class="transition-transform group-hover:scale-110" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5z" /></svg>
          {{ parts.length ? 'Continue' : 'Start' }}
        </button>
      </div>
    </div>
  </section>
</template>
