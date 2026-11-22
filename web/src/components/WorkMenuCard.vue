<script setup lang="ts">
// Home: the way into My work, by subject. There is no subject to pick: Glim recognises whether an
// exercise is maths, reading or science (Laya) and files it there.
import { RouterLink } from 'vue-router'
import { state } from '@/lib/engine'
import { SUBJECTS } from '@/lib/subjects'
import { useWork } from '@/lib/useWork'

const work = useWork()
</script>

<template>
  <section id="practice" aria-labelledby="work-menu-title" class="card stagger relative flex scroll-mt-6 flex-col gap-3.5 p-5 sm:p-6" style="--d: 200ms">
    <div>
      <h2 id="work-menu-title" class="flex items-center gap-2.5 text-[22px] font-black">
        <span aria-hidden="true" style="animation: hop 1.2s ease-in-out 1s 2">📚</span>
        My work
      </h2>
      <p class="mt-1 text-[13px] font-semibold text-ink-2">Write anything: Glim sees if it's maths, reading or science, and files it here.</p>
    </div>
    <ul class="m-0 flex list-none flex-col gap-3 p-0">
      <li v-for="(s, i) in SUBJECTS" :key="s.id" class="animate-rise" :style="{ animationDelay: `${320 + i * 90}ms`, animationFillMode: 'backwards' }">
        <RouterLink
          :to="{ name: 'work', query: { subject: s.id } }"
          class="group flex min-h-[64px] w-full items-center gap-4 rounded-[20px] px-3.5 py-2.5 text-left no-underline shadow-[0_10px_20px_-16px_rgb(24_41_74/0.45)] ring-1 ring-white transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_26px_-16px_rgb(24_41_74/0.5)] active:scale-[0.98]"
          :style="{ background: s.tint }"
        >
          <span class="flex size-11 shrink-0 items-center justify-center rounded-[14px] shadow-[inset_0_-3px_0_rgb(0_0_0/0.14)] transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110" :style="{ background: s.bg }">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="s.icon" /></svg>
          </span>
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="flex flex-wrap items-center gap-2">
              <span class="text-[18px] font-black text-ink">{{ s.name }}</span>
              <span v-if="s.id === state.subject && state.parts.length" class="animate-pop rounded-full bg-lagoon px-2 py-0.5 text-[11px] font-black text-white">now</span>
            </span>
            <span class="text-[13px] font-semibold text-ink-2">
              {{ (work.subjectCounts.value[s.id] ?? 0) === 0 ? s.blurb : `${work.subjectCounts.value[s.id]} ${work.subjectCounts.value[s.id] === 1 ? 'thing' : 'things'} done · ${s.blurb.toLowerCase()}` }}
            </span>
          </span>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#18294A" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
        </RouterLink>
      </li>
    </ul>
    <RouterLink :to="{ name: 'work' }" class="self-start text-[14px] font-black text-lagoon-deep underline-offset-4 hover:underline">See all my work →</RouterLink>
  </section>
</template>
