<script setup lang="ts">
import { computed } from 'vue'
import HandMath from './HandMath.vue'
import MathTex from './MathTex.vue'
import { STYLE_LABEL } from '@/lib/mock'
import type { Answer, Exercise, Profile, Question, Teaching, TeachStyle, WrittenPart } from '@/lib/types'

const props = defineProps<{
  tab: 'summary' | 'explanation'
  part: WrittenPart | null
  teaching: Teaching | null
  profile: Profile
  learned: string
  learnedTone: 'right' | 'working' | 'none'
  next: Exercise | null
  questions: { question: Question; answer: Answer }[]
  step: number
}>()
defineEmits<{ 'update:tab': [tab: 'summary' | 'explanation']; 'update:step': [n: number]; next: [] }>()

const styles = computed(() =>
  (Object.entries(props.profile) as [TeachStyle, { tries: number; wins: number }][])
    .map(([style, v]) => ({ style, ...v }))
    .sort((a, b) => b.wins / Math.max(1, b.tries) - a.wins / Math.max(1, a.tries)),
)
</script>

<template>
  <section aria-label="What we learned" class="card stagger flex min-w-0 flex-col gap-5 p-4 sm:p-5" style="--d: 400ms">
    <div role="tablist" aria-label="Summary or explanation" class="relative grid grid-cols-2 rounded-2xl bg-line-2 p-1.5">
      <span
        class="absolute inset-y-1.5 left-1.5 w-[calc(50%-6px)] rounded-xl bg-white shadow-[0_6px_14px_-8px_rgb(24_41_74/0.45)] transition-transform duration-500"
        style="transition-timing-function: cubic-bezier(0.3, 1.4, 0.5, 1)"
        :style="{ transform: tab === 'explanation' ? 'translateX(100%)' : 'none' }"
        aria-hidden="true"
      />
      <button
        v-for="t in (['summary', 'explanation'] as const)"
        :key="t"
        role="tab"
        :aria-selected="tab === t"
        type="button"
        class="relative z-10 flex min-h-11 items-center justify-center gap-2 rounded-xl text-[16px] font-black transition-colors"
        :class="tab === t ? 'text-marker' : 'text-ink-2'"
        @click="$emit('update:tab', t)"
      >
        <svg v-if="t === 'summary'" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 5.5A1.5 1.5 0 0 1 4.5 4H10a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4.5A1.5 1.5 0 0 1 3 16.5zm18 0A1.5 1.5 0 0 0 19.5 4H14a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h5.5a1.5 1.5 0 0 0 1.5-1.5z" /></svg>
        <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm5 4.5v7l6-3.5z" /></svg>
        {{ t === 'summary' ? 'Summary' : 'Explanation' }}
      </button>
    </div>

    <Transition name="fade" mode="out-in">
      <div v-if="tab === 'summary'" key="summary" role="tabpanel" class="flex flex-col gap-5">
        <div class="flex flex-col gap-2.5">
          <h3 class="flex items-center gap-2 text-lg font-black">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="#FFC93C" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" /></svg>
            What we learned
          </h3>
          <p
            class="flex items-start gap-3 rounded-2xl px-4 py-3.5 text-[15px] font-semibold leading-snug"
            :class="learnedTone === 'right' ? 'bg-right-bg text-right' : learnedTone === 'working' ? 'bg-[#fff4d6] text-[#7a4f00]' : 'bg-line-2 text-ink-2'"
          >
            <svg v-if="learnedTone === 'right'" class="shrink-0" width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#22A06B" /><path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
            {{ learned }}
          </p>
        </div>

        <div class="flex flex-col gap-2.5">
          <h3 class="flex items-center gap-2 text-lg font-black">
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a7 7 0 0 0-4 12.7V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.3A7 7 0 0 0 12 2z" fill="#FFC93C" /><path d="M9 20h6v1a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z" fill="#5b6b84" /></svg>
            Key ideas
          </h3>
          <div class="grid grid-cols-2 gap-3">
            <div class="flex flex-col items-center gap-2 rounded-2xl border border-line bg-[#f7fbff] p-3 text-center transition-transform duration-300 hover:-translate-y-1">
              <span class="text-[15px] font-black">Same-size pieces</span>
              <svg width="120" height="44" viewBox="0 0 120 44" aria-hidden="true">
                <g fill="none" stroke="#1F5FD6" stroke-width="2"><rect x="4" y="4" width="112" height="14" rx="2" /><path d="M60 4v14" /><rect x="4" y="26" width="112" height="14" rx="2" /><path d="M32 26v14M60 26v14M88 26v14" /></g>
                <rect x="6" y="6" width="52" height="10" rx="1.5" fill="#5B8DEF" /><rect x="6" y="28" width="24" height="10" rx="1.5" fill="#5B8DEF" /><rect x="34" y="28" width="24" height="10" rx="1.5" fill="#5B8DEF" />
              </svg>
              <span class="text-[13px] font-semibold leading-snug text-ink-2">Make the bottoms match before you add.</span>
            </div>
            <div class="flex flex-col items-center gap-2 rounded-2xl border border-line bg-[#f7fbff] p-3 text-center transition-transform duration-300 hover:-translate-y-1">
              <span class="text-[15px] font-black">Check the size</span>
              <HandMath latex="\frac{4}{6}<\frac{3}{4}" :size="26" />
              <span class="text-[13px] font-semibold leading-snug text-ink-2">Adding can't make a number smaller.</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          class="group flex items-center gap-3.5 rounded-2xl px-4 py-3.5 text-left transition-transform duration-300 hover:-translate-y-0.5"
          style="background: linear-gradient(120deg, #efeaff, #f6f3ff 60%, #eaf1ff)"
          @click="$emit('next')"
        >
          <svg class="shrink-0 transition-transform duration-500 group-hover:rotate-90" width="34" height="34" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#fff" stroke="#7C5CE8" stroke-width="2" /><circle cx="12" cy="12" r="6" fill="none" stroke="#E5484D" stroke-width="2" /><circle cx="12" cy="12" r="2.4" fill="#7C5CE8" /></svg>
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="text-[16px] font-black">Next step</span>
            <span v-if="next" class="flex flex-wrap items-center gap-1.5 text-[14px] font-semibold text-ink-2">Try <MathTex :latex="`${next.latex}=`" class="text-[16px] text-ink" /></span>
            <span v-else class="text-[14px] font-semibold text-ink-2">Write a new line on your paper</span>
          </span>
          <span class="flex size-10 shrink-0 items-center justify-center rounded-full bg-marker text-white transition-transform duration-300 group-hover:translate-x-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </span>
        </button>
      </div>

      <div v-else key="explanation" role="tabpanel" class="flex flex-col gap-5">
        <template v-if="teaching && part?.verdict === 'wrong'">
          <div class="flex flex-col gap-2">
            <span class="text-[14px] font-black text-wrong">Line {{ teaching.partId }}: you {{ teaching.misconception.name }}</span>
            <h3 class="text-[22px] font-black leading-tight">{{ teaching.title }}</h3>
            <p class="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-ink-2">
              <span class="rounded-full bg-lagoon-soft px-2.5 py-0.5 text-[13px] font-black text-lagoon-deep">{{ STYLE_LABEL[teaching.style] }}, try {{ teaching.iteration }}</span>
              {{ teaching.why }}
            </p>
          </div>
          <ol class="m-0 flex list-none flex-col gap-2 p-0">
            <li v-for="(s, i) in teaching.steps" :key="i">
              <button
                type="button"
                class="flex w-full items-start gap-3 rounded-2xl px-3 py-2.5 text-left text-[15px] leading-snug transition-all duration-300"
                :class="i === step ? 'bg-lagoon-mist font-bold text-ink shadow-[inset_0_0_0_2px_var(--color-lagoon-soft)]' : i < step ? 'text-ink' : 'text-ink-2'"
                @click="$emit('update:step', i)"
              >
                <span class="flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-black transition-colors duration-300" :class="i <= step ? 'bg-lagoon text-white' : 'bg-line-2 text-ink-2'">{{ i + 1 }}</span>
                {{ s }}
              </button>
            </li>
          </ol>
        </template>
        <p v-else class="rounded-2xl bg-line-2 px-4 py-3.5 text-[15px] font-semibold text-ink-2">
          {{ part?.verdict === 'correct' ? 'This line is right, so there is nothing to fix. Pick a line marked "Not yet" to see its explanation.' : 'Pick a line marked "Not yet" to see why, step by step.' }}
        </p>

        <div v-if="styles.length" class="flex flex-col gap-2.5">
          <h3 class="text-[16px] font-black">What works for you</h3>
          <div v-for="s in styles" :key="s.style" class="grid grid-cols-[110px_1fr_auto] items-center gap-3 text-[14px]">
            <span class="font-bold">{{ STYLE_LABEL[s.style] }}</span>
            <span class="h-2 overflow-hidden rounded bg-lagoon-soft" :title="`${s.wins} of ${s.tries} times the next exercise was right`">
              <span class="block h-full rounded bg-lagoon transition-[width] duration-1000" :style="{ width: `${(s.wins / Math.max(1, s.tries)) * 100}%` }" />
            </span>
            <span class="font-semibold tabular-nums text-ink-2">{{ s.wins }} of {{ s.tries }}</span>
          </div>
        </div>

        <div v-if="questions.length" class="flex flex-col gap-2.5">
          <h3 class="text-[16px] font-black">Your questions about this line</h3>
          <div v-for="(q, i) in questions" :key="i" class="rounded-2xl border border-line px-4 py-3">
            <p :lang="q.question.lang" class="font-bold">« {{ q.question.text }} »</p>
            <p :lang="q.answer.lang" class="mt-1 text-[14px] text-ink-2">{{ q.answer.text }}</p>
          </div>
        </div>
      </div>
    </Transition>
  </section>
</template>
