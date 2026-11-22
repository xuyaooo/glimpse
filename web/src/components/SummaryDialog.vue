<script setup lang="ts">
// The end of a session: what went well, what was practised, mistakes with a tip, what's next,
// and a note for grown-ups. Written by the tutor from what happened (the stars are counted).
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Confetti from './Confetti.vue'
import FocusTrap from './FocusTrap.vue'
import Mascot from './Mascot.vue'
import MathTex from './MathTex.vue'
import { titleTex } from '@/lib/latex'
import { localSummary, startSession, state } from '@/lib/engine'
import { nextTip } from '@/lib/records'
import { speakAuto, stopSpeaking } from '@/lib/speech'
import { ui } from '@/lib/ui'

const router = useRouter()
const s = computed(() => state.summary)
const adults = ref(false)
const burst = ref(0)

// The demo engine writes no summary, and a real one might not answer: count one here instead.
let wait = 0
/** A summary was celebrated and read out since the window opened. */
let told = false
watch(
  () => ui.summaryOpen,
  (open) => {
    window.clearTimeout(wait)
    if (open) told = !!state.summary
    if (!open || state.summary) return
    if (state.connection !== 'live') state.summary = localSummary()
    else wait = window.setTimeout(() => !state.summary && ui.summaryOpen && (state.summary = localSummary()), 40000)
  },
)

// Celebrated and read out once. The tutor's summary arriving after the one counted here takes
// its place quietly, without the confetti and Glim reading a second summary.
watch(s, (v) => {
  if (!v || !ui.summaryOpen || told) return
  told = true
  burst.value++
  speakAuto(`${v.title} ${v.praise}`, v.lang)
})

function close() {
  stopSpeaking()
  ui.summaryOpen = false
}
// the exercises to practise: in My work, where they are kept for every session
const LEVEL = { again: 'Try it again', same: 'New numbers', harder: 'A bit harder', idea: "Glim's idea" } as const
function practise() {
  close()
  router.push({ name: 'work', hash: '#review' })
}
function history() {
  close()
  router.push({ name: 'history' })
}
function again() {
  const id = state.student?.id
  close()
  if (id) startSession(id)
  router.push({ name: 'scan', query: { student: id } })
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && ui.summaryOpen) {
    e.stopPropagation()
    close()
  }
}
onMounted(() => window.addEventListener('keydown', onKey, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <Transition name="fade">
    <div v-if="ui.summaryOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-[#0b1d28]/55 p-4 backdrop-blur-sm" @click.self="close">
      <FocusTrap>
      <section role="dialog" aria-modal="true" aria-labelledby="summary-title" tabindex="-1" class="relative flex max-h-full w-full max-w-[640px] flex-col gap-4 overflow-y-auto rounded-[32px] bg-white p-6 shadow-2xl outline-none sm:p-8" style="animation: rise 500ms both">
        <div class="pointer-events-none absolute inset-x-0 top-0 flex justify-center"><Confetti :burst="burst" /></div>

        <div v-if="!s" class="flex flex-col items-center gap-4 py-10 text-center">
          <Mascot :size="96" />
          <h2 id="summary-title" class="text-[20px] font-black">Glim is writing your summary…</h2>
          <span class="size-10 animate-spin rounded-full border-4 border-lagoon-soft border-t-lagoon" aria-hidden="true" />
          <button type="button" class="min-h-11 rounded-2xl px-4 text-[15px] font-bold text-ink-2" @click="close">Close</button>
        </div>

        <template v-else>
          <div class="flex items-center gap-4">
            <Mascot :size="84" class="shrink-0" />
            <div>
              <p class="text-[14px] font-black text-lagoon">{{ s.name ? `Well done, ${s.name}!` : 'Well done!' }} · {{ s.minutes }} min</p>
              <h2 id="summary-title" class="text-[28px] font-black leading-tight">{{ s.title }}</h2>
              <div class="mt-1 flex gap-1" role="img" :aria-label="`${s.stars} stars out of 3`">
                <svg v-for="i in 3" :key="i" width="34" height="34" viewBox="0 0 24 24" aria-hidden="true" :style="{ animation: `pop 500ms cubic-bezier(0.3, 1.6, 0.5, 1) ${0.3 + i * 0.25}s both` }">
                  <path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z" :fill="i <= s.stars ? '#ffc93c' : '#e3ebf3'" stroke="#e0a21a" :stroke-opacity="i <= s.stars ? 1 : 0" stroke-width="1.2" stroke-linejoin="round" />
                </svg>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-3 gap-2 text-center">
            <div class="rounded-2xl bg-lagoon-mist px-3 py-2.5"><p class="text-[26px] font-black text-lagoon-deep">{{ s.lines }}</p><p class="text-[12px] font-bold text-ink-2">{{ s.lines === 1 ? 'line' : 'lines' }} written</p></div>
            <div class="rounded-2xl bg-right-bg px-3 py-2.5"><p class="text-[26px] font-black text-[#136e43]">{{ s.right }}</p><p class="text-[12px] font-bold text-ink-2">right</p></div>
            <div class="rounded-2xl bg-violet-soft px-3 py-2.5"><p class="text-[26px] font-black text-violet">{{ s.questions }}</p><p class="text-[12px] font-bold text-ink-2">{{ s.questions === 1 ? 'question' : 'questions' }} asked</p></div>
          </div>

          <p :lang="s.lang" class="rounded-2xl bg-[#fff8e6] px-4 py-3 text-[17px] font-bold leading-snug">{{ s.praise }}</p>

          <div v-if="s.practised.length" class="flex flex-col gap-2">
            <h3 class="text-[15px] font-black text-ink-2">Today you practised</h3>
            <div class="flex flex-wrap gap-2">
              <span v-for="(p, i) in s.practised" :key="i" class="rounded-full bg-marker-soft px-3.5 py-1.5 text-[14px] font-black text-marker" :style="{ animation: `pop 400ms ${0.2 + i * 0.1}s both` }">{{ p }}</span>
            </div>
          </div>

          <div v-if="s.mistakes.length" class="flex flex-col gap-2">
            <h3 class="text-[15px] font-black text-ink-2">Watch out for</h3>
            <div v-for="(m, i) in s.mistakes" :key="i" class="rounded-2xl border-2 border-line p-3.5">
              <p class="text-[15px] font-bold">{{ m.what }}</p>
              <p class="mt-1 flex gap-2 text-[15px] font-semibold text-lagoon-deep"><span aria-hidden="true">💡</span>{{ m.tip }}</p>
            </div>
          </div>

          <p class="rounded-2xl bg-lagoon-mist px-4 py-3 text-[16px] font-bold"><span class="font-black text-lagoon-deep">Next time: </span>{{ nextTip(s.next) }}</p>

          <div v-if="s.review?.length" class="flex flex-col gap-2 rounded-2xl border-2 border-tangerine-soft p-3.5">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="text-[15px] font-black"><span aria-hidden="true">🎯</span> To practise next time</h3>
              <span class="text-[13px] font-bold text-ink-2">{{ s.review.length }} {{ s.review.length === 1 ? 'exercise' : 'exercises' }}, kept in My work</span>
            </div>
            <ul class="m-0 flex list-none flex-wrap gap-2 p-0">
              <li v-for="(r, i) in s.review.slice(0, 3)" :key="r.id" class="flex min-w-0 items-center gap-2 rounded-xl bg-[#fffdf7] px-3 py-2 ring-1 ring-line" :style="{ animation: `pop 400ms ${0.3 + i * 0.1}s both` }">
                <span class="shrink-0 text-[11px] font-black uppercase tracking-wide text-[#b4531a]">{{ LEVEL[r.level] }}</span>
                <MathTex :latex="titleTex(r.exercise)" class="min-w-0 overflow-x-auto text-[18px]" />
              </li>
            </ul>
            <button type="button" class="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl bg-tangerine px-4 text-[15px] font-black text-white shadow transition hover:scale-[1.02]" @click="practise">Practise in My work</button>
          </div>

          <div class="rounded-2xl border border-line">
            <button type="button" class="flex w-full items-center justify-between px-4 py-3 text-left text-[15px] font-black" :aria-expanded="adults" @click="adults = !adults">
              For grown-ups
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true" class="transition-transform" :class="adults ? 'rotate-180' : ''"><path d="M6 9l6 6 6-6" /></svg>
            </button>
            <p v-if="adults" class="px-4 pb-4 text-[15px] leading-relaxed text-ink-2">{{ s.for_adults }}</p>
          </div>

          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn-lagoon min-h-12 flex-1 rounded-2xl px-5 text-[16px] font-black" @click="history">See my history</button>
            <button type="button" class="min-h-12 flex-1 rounded-2xl border-2 border-line bg-white px-5 text-[16px] font-black" @click="again">Start a new session</button>
            <button type="button" class="min-h-12 rounded-2xl px-4 text-[15px] font-bold text-ink-2" @click="close">Close</button>
          </div>
        </template>
      </section>
      </FocusTrap>
    </div>
  </Transition>
</template>
