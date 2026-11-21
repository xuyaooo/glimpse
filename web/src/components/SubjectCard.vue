<script setup lang="ts">
// "Choose a practice": the child picks the subject; the tutor checks that subject from now on.
// After a mistake, the current subject also says how many similar exercises are waiting.
import { SUBJECTS, type SubjectId } from '@/lib/subjects'

defineProps<{ current: SubjectId; waiting: number; ping: number }>()
defineEmits<{ pick: [id: SubjectId] }>()
</script>

<template>
  <section id="practice" aria-labelledby="practice-title" class="card stagger relative flex scroll-mt-6 flex-col gap-3.5 p-5 sm:p-6" style="--d: 200ms">
    <!-- New similar exercises: the card glows twice -->
    <span v-if="ping" :key="ping" class="pointer-events-none absolute inset-0 rounded-[26px]" style="animation: pulse-ring 1.1s ease-out 2" aria-hidden="true" />
    <h2 id="practice-title" class="flex items-center gap-2.5 text-[22px] font-black">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="#FFC93C" style="animation: hop 1.2s ease-in-out 1s 2" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" /></svg>
      Choose a practice
    </h2>
    <ul class="m-0 flex list-none flex-col gap-3 p-0">
      <li v-for="(s, i) in SUBJECTS" :key="s.id" class="animate-rise" :style="{ animationDelay: `${320 + i * 90}ms`, animationFillMode: 'backwards' }">
        <button
          type="button"
          :aria-pressed="s.id === current"
          class="group flex min-h-[64px] w-full items-center gap-4 rounded-[20px] px-3.5 py-2.5 text-left shadow-[0_10px_20px_-16px_rgb(24_41_74/0.45)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_26px_-16px_rgb(24_41_74/0.5)] active:scale-[0.98]"
          :class="s.id === current ? 'ring-[2.5px] ring-lagoon' : 'ring-1 ring-white'"
          :style="{ background: s.tint }"
          @click="$emit('pick', s.id)"
        >
          <span class="flex size-11 shrink-0 items-center justify-center rounded-[14px] shadow-[inset_0_-3px_0_rgb(0_0_0/0.14)] transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110" :style="{ background: s.bg }">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="s.icon" /></svg>
          </span>
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="flex flex-wrap items-center gap-2">
              <span class="text-[18px] font-black">{{ s.name }}</span>
              <span v-if="s.id === current && waiting" class="animate-pop rounded-full bg-note px-2 py-0.5 text-[12px] font-black text-ink">{{ waiting }} to try</span>
            </span>
            <span class="text-[13px] font-semibold text-ink-2">{{ s.blurb }}</span>
          </span>
          <!-- The subject being practised gets a check; the others a chevron -->
          <span v-if="s.id === current" class="flex size-7 shrink-0 animate-pop items-center justify-center rounded-full bg-lagoon" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path class="draw" pathLength="1" d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          </span>
          <svg v-else width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#18294A" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
        </button>
      </li>
    </ul>
  </section>
</template>
