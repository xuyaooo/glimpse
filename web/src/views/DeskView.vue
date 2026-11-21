<script setup lang="ts">
// The child's main screen. No menus, no chat: the paper, one mouse button and their voice.
// "Asking a question" is a state of this screen, not a separate page.
import { computed, watch } from 'vue'
import BrandMark from '@/components/BrandMark.vue'
import ExplainPanel from '@/components/ExplainPanel.vue'
import LiveView from '@/components/LiveView.vue'
import ProgressDots from '@/components/ProgressDots.vue'
import StatusPill from '@/components/StatusPill.vue'
import { askEnd, askStart, check, confirmReply, nextStep, state } from '@/lib/engine'
import { useMouseButtons } from '@/lib/keys'
import { speak, stopSpeaking } from '@/lib/speech'

useMouseButtons({ check, askStart, askEnd })

watch(
  () => state.hint,
  (hint) => (hint ? speak(hint.text, hint.lang) : stopSpeaking()),
)

const pointing = computed(() => (state.asking || state.status === 'answering' ? (state.ask?.pointedAt ?? null) : null))
const listening = computed(() => state.asking || state.status === 'answering')
const finished = computed(() => state.problems.length > 0 && state.problems.every((p) => ['correct', 'wrong'].includes(state.marks[p.id]?.verdict ?? '')))
</script>

<template>
  <div class="flex min-h-screen flex-col bg-squared">
    <header class="flex flex-wrap items-center justify-between gap-4 border-b border-line bg-paper px-4 py-3.5 sm:px-7">
      <div class="flex items-center gap-3.5">
        <BrandMark :size="26" :wordmark="false" />
        <span class="inline-flex items-center gap-2 text-[15px] font-bold">
          <span class="flex size-[30px] items-center justify-center rounded-full bg-pen-soft text-pen">{{ state.student?.name[0] }}</span>{{ state.student?.name }}
        </span>
      </div>
      <ProgressDots v-if="state.problems.length" :total="state.problems.length" :current="state.current" :marks="state.marks" />
      <div class="flex items-center gap-3">
        <StatusPill :status="state.status" :connection="state.connection" />
        <RouterLink
          :to="{ name: 'summary' }"
          class="inline-flex min-h-10 items-center rounded-full border px-3.5 text-sm no-underline"
          :class="finished ? 'border-pen bg-pen font-bold text-white' : 'border-line text-ink'"
        >Finish</RouterLink>
      </div>
    </header>

    <main class="flex flex-1 flex-wrap items-stretch gap-5 px-4 py-5 sm:px-7">
      <LiveView class="flex-[999_1_560px]" :pointing="pointing" :caption="listening ? 'Point with your finger, then ask' : undefined" />

      <div class="flex min-w-0 flex-[1_1_420px] flex-col">
        <!-- The reader wasn't sure: ask the child before anything else (cheaper than a big model). -->
        <section v-if="state.confirm" aria-live="assertive" class="flex flex-1 flex-col justify-center gap-6 py-2 pl-3 pr-2">
          <span class="text-base font-bold text-pen-deep">Problem {{ state.confirm.problem }}</span>
          <h2 class="text-[34px] font-bold leading-tight">Did you write {{ state.confirm.guess.n }}/{{ state.confirm.guess.d }}?</h2>
          <div class="flex flex-wrap gap-3">
            <button type="button" class="min-h-[60px] flex-1 rounded-[14px] bg-pen px-6 text-xl font-bold text-white" @click="confirmReply(true)">Yes</button>
            <button type="button" class="min-h-[60px] flex-1 rounded-[14px] border-2 border-ink bg-paper px-6 text-xl font-bold text-ink" @click="confirmReply(false)">No, let me fix it</button>
          </div>
        </section>
        <ExplainPanel v-else class="flex-1" :explanation="state.explanation" :active-step="state.activeStep" idle-text="Write your answer, then press the thumb button." @next="nextStep" />
      </div>
    </main>

    <footer
      class="mx-4 mb-5 flex flex-wrap items-center gap-[18px] rounded-[10px] bg-paper px-5 py-4 sm:mx-7"
      :class="listening ? 'border-2 border-marker' : 'border-[1.5px] border-ink'"
    >
      <template v-if="listening">
        <span aria-hidden="true" class="flex size-14 shrink-0 items-center justify-center rounded-full bg-marker text-white">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
        </span>
        <div class="flex min-w-0 flex-[1_1_420px] flex-col gap-1" aria-live="polite">
          <span :lang="state.ask?.lang" class="text-[22px] leading-snug">{{ state.ask?.text ? `« ${state.ask.text} »` : '…' }}</span>
          <span class="text-sm text-ink-2">{{ state.ask?.pointedAt ? `Pointing at the ${state.ask.pointedAt.token} in problem ${state.ask.pointedAt.problem}` : 'Point at your paper and ask' }}</span>
        </div>
        <span v-if="state.asking" aria-hidden="true" class="flex h-9 shrink-0 items-end gap-1">
          <span v-for="(h, i) in [10, 24, 34, 18, 28, 12, 6]" :key="i" class="wave-bar w-1 rounded-sm bg-marker" :style="{ height: `${h}px`, animationDelay: `${i * 90}ms` }" />
        </span>
        <span class="shrink-0 text-sm font-bold text-marker-ink">{{ state.asking ? 'Let go of the button to hear the answer' : 'Thinking about your question' }}</span>
      </template>

      <template v-else>
        <button
          type="button"
          :disabled="!state.hint"
          aria-label="Hear the hint again"
          class="flex size-14 shrink-0 items-center justify-center rounded-full bg-pen text-white disabled:bg-[#9aa3b2]"
          @click="state.hint && speak(state.hint.text, state.hint.lang)"
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5L6 9H3v6h3l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /></svg>
        </button>
        <div class="flex min-w-0 flex-[1_1_420px] flex-col gap-1" aria-live="polite">
          <template v-if="state.hint">
            <span :lang="state.hint.lang" class="text-[22px] leading-snug">{{ state.hint.text }}</span>
            <span v-if="state.hint.translation" lang="en" class="text-sm text-ink-2">{{ state.hint.translation }}</span>
          </template>
          <span v-else class="text-lg text-ink-2">Hints show up here and are read out loud.</span>
        </div>
        <div class="flex shrink-0 flex-wrap gap-2">
          <button type="button" class="inline-flex min-h-12 items-center gap-2.5 rounded-full bg-desk px-4 text-sm font-bold" @click="check">Check my line</button>
          <button
            type="button"
            class="inline-flex min-h-12 select-none items-center gap-2.5 rounded-full bg-desk px-4 text-sm font-bold"
            @pointerdown.prevent="askStart"
            @pointerup="askEnd"
            @pointerleave="askEnd"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="3" width="12" height="18" rx="6" /><path d="M12 7v4" /></svg>
            Hold to ask
          </button>
        </div>
      </template>
    </footer>
  </div>
</template>
