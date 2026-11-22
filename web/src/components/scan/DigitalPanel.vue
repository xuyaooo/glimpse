<script setup lang="ts">
// The right half of the scan window: what the camera saw for a line, what was read from it,
// whether it's right, the explanation (in step with the drawing on the camera), similar
// exercises, answers to questions, and what's going on.
import ActivityFeed from './ActivityFeed.vue'
import StepByStep from './StepByStep.vue'
import Confetti from '../Confetti.vue'
import MathTex from '../MathTex.vue'
import { confirmReply, dismissAnswer, pickExercise, state } from '@/lib/engine'
import { STYLE_LABEL } from '@/lib/mock'
import { speak } from '@/lib/speech'
import type { Hint, Teaching, WrittenPart } from '@/lib/types'
import { youNote } from '@/lib/useWork'

defineProps<{ selected: WrittenPart | null; teaching: Teaching | null; step: number; crop: string | null; hint: Hint | null }>()
defineEmits<{ step: [n: number]; replay: []; select: [id: number] }>()

const BADGE = { correct: 'bg-right-mark', wrong: 'bg-wrong-mark', reading: 'bg-lagoon-bright', unsure: 'bg-[#e0a21a]' }
</script>

<template>
  <div class="flex min-h-0 flex-col gap-4 overflow-y-auto pb-2 pr-1">
    <!-- 1. The line: camera → digital -->
    <section aria-label="What I read" class="relative rounded-[24px] bg-white p-5 shadow-[0_14px_30px_-22px_rgb(24_41_74/0.5)]">
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-lg font-black">{{ selected ? `Line ${selected.id}` : 'What I read' }}</h3>
        <template v-if="selected">
          <span v-if="selected.verdict === 'correct'" class="relative inline-flex animate-pop items-center gap-1 rounded-full bg-right-bg px-3 py-1 text-[14px] font-black text-right">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5" /></svg>Right
            <Confetti :burst="selected.id" />
          </span>
          <span v-else-if="selected.verdict === 'wrong'" class="inline-flex animate-pop items-center gap-1 rounded-full bg-wrong-bg px-3 py-1 text-[14px] font-black text-wrong">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>Not yet
          </span>
          <span v-else-if="selected.verdict === 'reading'" class="rounded-full bg-lagoon-mist px-3 py-1 text-[14px] font-black text-lagoon">Reading</span>
          <span v-else class="rounded-full bg-[#fff4d6] px-3 py-1 text-[14px] font-black text-[#8a5a00]">Check it</span>
        </template>
      </div>

      <div v-if="!selected" class="mt-3 flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line px-4 py-8 text-center">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#14A096" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="animation: bob 1.6s ease-in-out infinite alternate"><path d="M16.9 3.3a2 2 0 0 1 2.8 0l1 1a2 2 0 0 1 0 2.8L9.4 18.4 4 20l1.6-5.4z" /></svg>
        <p class="text-[15px] font-bold text-ink-2">Write a line on your paper. When you lift your pencil, the camera’s picture and what I read appear here.</p>
      </div>

      <div v-else class="mt-3 flex flex-col gap-3">
        <div class="flex flex-col gap-1.5">
          <figure v-if="crop" :key="crop.length" class="m-0 flex flex-col gap-1.5" style="animation: rise 500ms both">
            <figcaption class="text-[12px] font-black text-ink-2">What the camera saw</figcaption>
            <img :src="crop" alt="The handwritten line, as the camera saw it" class="max-h-44 w-full rounded-xl border border-line object-contain object-left shadow-sm" />
          </figure>
          <svg v-if="crop" class="ml-6" width="20" height="26" viewBox="0 0 20 26" aria-hidden="true"><path class="draw" pathLength="1" style="--dur: 0.4s; --delay: 0.3s" d="M10 2v20M3 15l7 7 7-7" fill="none" stroke="#14A096" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" /></svg>
          <figure class="m-0 flex flex-col gap-1.5">
            <figcaption class="text-[12px] font-black text-ink-2">What I read</figcaption>
            <div v-if="selected.verdict === 'reading' && state.confirm?.partId !== selected.id" class="flex flex-col gap-2 py-2">
              <span class="shimmer h-10 w-full rounded-xl" />
              <span class="text-[13px] font-bold text-lagoon">Reading your handwriting…</span>
            </div>
            <MathTex v-else :key="selected.latex" :latex="selected.latex" class="write-on block text-[38px]" style="--dur: 0.7s" />
          </figure>
        </div>

        <div v-if="state.confirm?.partId === selected.id" class="flex flex-wrap items-center gap-2.5 rounded-2xl bg-[#fff8e6] p-3.5" aria-live="assertive">
          <span class="w-full text-[15px] font-black">I’m not sure I read that right. Did you write this?</span>
          <button type="button" class="btn-lagoon min-h-11 rounded-xl px-5 font-black" @click="confirmReply(true)">Yes</button>
          <button type="button" class="min-h-11 rounded-xl border-2 border-line bg-white px-5 font-black" @click="confirmReply(false)">No, let me fix it</button>
        </div>
        <p v-if="selected.verdict === 'wrong' && selected.note" class="rounded-2xl bg-wrong-bg px-4 py-2.5 text-[15px] font-bold text-wrong">{{ youNote(selected.note) }}</p>
        <p v-else-if="selected.verdict === 'unsure' && selected.note" class="rounded-2xl bg-[#fff4d6] px-4 py-2.5 text-[15px] font-bold text-[#7a4f00]">{{ selected.note.charAt(0).toUpperCase() + selected.note.slice(1) }}.</p>

        <!-- what the tutor says about this line (also spoken) -->
        <div v-if="hint" class="flex items-start gap-3 rounded-2xl bg-lagoon-mist px-4 py-3" aria-live="polite">
          <div class="flex-1">
            <p class="text-[12px] font-black text-lagoon-deep">Glim says</p>
            <p :lang="hint.lang" class="text-[16px] font-bold leading-snug">{{ hint.text }}</p>
            <p v-if="hint.translation" lang="en" class="mt-0.5 text-[13px] text-ink-2">{{ hint.translation }}</p>
          </div>
          <button type="button" aria-label="Hear it" title="Hear it" class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white text-lagoon shadow-sm" @click="speak(hint.text, hint.lang)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5L6 9H3v6h3l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /></svg>
          </button>
        </div>
      </div>
    </section>

    <!-- The whole solution, step by step -->
    <StepByStep v-if="state.steps" :steps="state.steps" />

    <!-- Details: what the camera read, for the curious (and for debugging) -->
    <details v-if="state.page" class="rounded-[24px] bg-white px-5 py-3 shadow-[0_14px_30px_-22px_rgb(24_41_74/0.5)]">
      <summary class="cursor-pointer text-[15px] font-black text-ink-2">Details: the whole page, as the camera read it <span class="font-semibold">({{ (state.page.ms / 1000).toFixed(1) }} s)</span></summary>
      <p v-if="!state.page.lines.length" class="mt-2 text-[14px] font-semibold text-ink-2">I couldn’t see any writing.</p>
      <ol v-else class="m-0 mt-2 flex list-none flex-col gap-1 p-0">
        <li v-for="(line, i) in state.page.lines" :key="`${state.page.at}-${i}`" class="flex flex-wrap items-baseline gap-x-1 text-[15px] leading-relaxed">
          <template v-for="(seg, j) in line" :key="j">
            <MathTex v-if="seg.t === 'math'" :latex="seg.v" class="text-[18px]" />
            <span v-else class="font-semibold">{{ seg.v }}</span>
          </template>
        </li>
      </ol>
      <p v-if="selected" class="mt-2 text-[12px] font-bold text-ink-3">Read on this laptop by GLM-OCR, checked by the tutor model.</p>
    </details>

    <!-- 2. Plain-words log, kept near the top -->
    <ActivityFeed :limit="3" />

    <!-- 3. Answer to a question -->
    <Transition name="fade">
      <section v-if="state.answer && state.question" aria-label="Your question" class="flex flex-col gap-2.5 rounded-[24px] p-5" style="background: linear-gradient(130deg, #efeaff, #f6f3ff 55%, #eaf1ff)">
        <p class="text-[14px] font-black text-violet">You asked</p>
        <p :lang="state.question.lang" class="-mt-1.5 text-[19px] font-black">« {{ state.question.text }} »</p>
        <p v-if="state.question.about" class="-mt-1 flex flex-wrap items-center gap-2 text-[14px] font-bold text-ink-2">Pointing at <MathTex :latex="state.question.about" class="text-[20px] text-ink" /></p>
        <p :lang="state.answer.lang" class="text-[16px] font-bold leading-snug">{{ state.answer.text }}</p>
        <p v-if="state.answer.translation" lang="en" class="-mt-1.5 text-[13px] text-ink-2">{{ state.answer.translation }}</p>
        <p v-if="state.answer.visual" class="text-[13px] font-bold text-violet">Drawn on the camera, next to your paper.</p>
        <div class="flex gap-2">
          <button type="button" class="rounded-xl bg-white px-3.5 py-2 text-[14px] font-black text-violet" @click="state.answer && speak(state.answer.text, state.answer.lang)">Hear it</button>
          <button type="button" class="rounded-xl bg-violet px-3.5 py-2 text-[14px] font-black text-white" @click="dismissAnswer">Got it</button>
        </div>
      </section>
    </Transition>

    <!-- 3. Why, step by step, in time with the drawing on the camera -->
    <section v-if="teaching && selected?.verdict === 'wrong'" aria-label="Let's see why" class="flex flex-col gap-3 rounded-[24px] bg-white p-5 shadow-[0_14px_30px_-22px_rgb(24_41_74/0.5)]">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="text-lg font-black">{{ teaching.title }}</h3>
        <div class="flex gap-1">
          <button type="button" aria-label="Draw it again" title="Draw it again" class="flex size-9 items-center justify-center rounded-xl bg-line-2 text-marker transition hover:-translate-y-0.5" @click="$emit('replay')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.9 3.3a2 2 0 0 1 2.8 0l1 1a2 2 0 0 1 0 2.8L9.4 18.4 4 20l1.6-5.4z" /></svg>
          </button>
          <button type="button" aria-label="Hear it" title="Hear it" :disabled="!hint" class="flex size-9 items-center justify-center rounded-xl bg-line-2 text-ink-2 transition hover:-translate-y-0.5 disabled:opacity-40" @click="hint && speak(hint.text, hint.lang)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5L6 9H3v6h3l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /></svg>
          </button>
        </div>
      </div>
      <p class="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-ink-2">
        <span class="rounded-full bg-lagoon-soft px-2.5 py-0.5 text-[13px] font-black text-lagoon-deep">{{ STYLE_LABEL[teaching.style] }}, try {{ teaching.iteration }}</span>
        {{ teaching.why }}
      </p>
      <ol class="m-0 flex list-none flex-col gap-1.5 p-0">
        <li v-for="(s, i) in teaching.steps" :key="i">
          <button
            type="button"
            class="flex w-full items-start gap-3 rounded-2xl px-3 py-2 text-left text-[15px] leading-snug transition-all duration-300"
            :class="i === step ? 'bg-lagoon-mist font-bold shadow-[inset_0_0_0_2px_var(--color-lagoon-soft)]' : i < step ? '' : 'text-ink-2'"
            @click="$emit('step', i)"
          >
            <span class="flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-black transition-colors duration-300" :class="i <= step ? 'bg-lagoon text-white' : 'bg-line-2 text-ink-2'">{{ i + 1 }}</span>
            {{ s }}
          </button>
        </li>
      </ol>
      <p class="flex items-center gap-2 text-[13px] font-bold text-lagoon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4zm8 9a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" /></svg>
        Drawn live on the camera, next to your paper
      </p>
    </section>

    <!-- 4. Similar exercises -->
    <section v-if="state.exercises.length" aria-label="Try a similar one" class="flex flex-col gap-2.5 rounded-[24px] bg-white p-5 shadow-[0_14px_30px_-22px_rgb(24_41_74/0.5)]">
      <h3 class="text-lg font-black">Try a similar one</h3>
      <p class="-mt-1.5 text-[14px] font-semibold text-ink-2">Write it on the next line, then lift your pencil.</p>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="e in state.exercises"
          :key="e.id"
          type="button"
          :aria-pressed="e.id === state.currentExerciseId"
          class="rounded-2xl border-2 px-3.5 py-2 transition-all duration-300 hover:-translate-y-0.5"
          :class="e.id === state.currentExerciseId ? 'border-lagoon bg-lagoon-mist' : 'border-line bg-white'"
          @click="pickExercise(e.id)"
        >
          <MathTex :latex="`${e.latex}=`" class="text-[20px]" />
        </button>
      </div>
    </section>

    <!-- 6. Every line -->
    <section v-if="state.parts.length > 1" aria-label="Earlier lines" class="flex flex-col gap-2 rounded-[24px] bg-white p-5 shadow-[0_14px_30px_-22px_rgb(24_41_74/0.5)]">
      <h3 class="text-lg font-black">All lines</h3>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="p in state.parts"
          :key="p.id"
          type="button"
          :aria-pressed="p.id === selected?.id"
          class="flex items-center gap-2 rounded-2xl border-2 px-2.5 py-1.5 transition-all"
          :class="p.id === selected?.id ? 'border-lagoon bg-lagoon-mist' : 'border-line bg-white hover:-translate-y-0.5'"
          @click="$emit('select', p.id)"
        >
          <span class="flex size-6 items-center justify-center rounded-full text-[12px] font-black text-white" :class="BADGE[p.verdict]">{{ p.id }}</span>
          <MathTex :latex="p.latex" class="text-[16px]" />
        </button>
      </div>
    </section>
  </div>
</template>
