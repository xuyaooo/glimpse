<script setup lang="ts">
// My work: every line written today, the reasoning given for the selected one on the
// whiteboard, and Summary / Explanation beside it.
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import HistoryList from '@/components/HistoryList.vue'
import InsightTabs from '@/components/InsightTabs.vue'
import ReviewSection from '@/components/ReviewSection.vue'
import StudentPickerModal from '@/components/StudentPickerModal.vue'
import TopBar from '@/components/TopBar.vue'
import Whiteboard from '@/components/Whiteboard.vue'
import { state, topicLabel } from '@/lib/engine'
import { ui } from '@/lib/ui'
import { useDesk } from '@/lib/useDesk'
import MathTex from '@/components/MathTex.vue'
import { start } from '@/lib/player'
import { useCountUp } from '@/lib/useCountUp'
import { searchKey, titleTex } from '@/lib/latex'
import { useWork, youNote, type SavedLine } from '@/lib/useWork'

const desk = useDesk()
const { subject, right, fixed, next } = desk
const boardStep = ref(0)
const searchBox = ref<HTMLElement | null>(null)

// Arriving from the search box on Home: keep typing here.
onMounted(() => {
  if (ui.search) searchBox.value?.querySelector('input')?.focus()
})

// 6x89, 6*89 or 6 × 89 typed finds 6 \times 89 written (both sides made the same way)
const query = computed(() => searchKey(ui.search))
const shownParts = computed(() => {
  const q = query.value
  return q ? state.parts.filter((p) => searchKey(p.latex).includes(q)) : state.parts
})

// Everything saved (earlier sessions) under what is going on now
const work = useWork()
const pastShown = computed(() => {
  const q = query.value
  return q ? work.pastLines.value.filter((p) => searchKey(p.latex).includes(q)) : work.pastLines.value
})
const allParts = computed(() => [...[...pastShown.value].reverse(), ...shownParts.value])
const meta = computed(() =>
  Object.fromEntries(
    work.pastLines.value.map((p) => [p.id, { when: new Date(p.at).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }), photo: p.photo, animated: !!p.solution?.scene }]),
  ),
)
const savedSelected = computed<SavedLine | null>(() => work.pastLines.value.find((p) => p.id === ui.selectedPartId) ?? null)
const tiles = [
  { key: 'exercises', label: 'exercises', color: 'text-lagoon-deep', bg: 'bg-lagoon-mist' },
  { key: 'right', label: 'right', color: 'text-[#136e43]', bg: 'bg-right-bg' },
  { key: 'questions', label: 'questions', color: 'text-violet', bg: 'bg-violet-soft' },
  { key: 'animations', label: 'animations', color: 'text-tangerine', bg: 'bg-tangerine-soft' },
  { key: 'sessions', label: 'sessions', color: 'text-marker', bg: 'bg-marker-soft' },
  { key: 'stars', label: 'stars', color: 'text-[#b8860b]', bg: 'bg-[#fff6d6]' },
] as const
const counts = Object.fromEntries(tiles.map((t) => [t.key, useCountUp(() => work.stats.value[t.key])])) as Record<(typeof tiles)[number]['key'], ReturnType<typeof useCountUp>>

// Practise again: exercises suggested after each finished session (also reached from the summary,
// as /work#review)
const route = useRoute()
const toPractise = computed(() => work.reviews.value.reduce((t, r) => t + r.items.filter((i) => !i.done).length, 0))
function goToReview() {
  document.getElementById('review')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
let arrived = false
watch(
  () => [route.hash, work.loadedFor.value, state.student?.id] as const,
  async ([hash, loadedFor, student]) => {
    // once this student's work is on the page (not under the "Who's writing?" picker)
    if (hash !== '#review' || arrived || !student || loadedFor !== student) return
    arrived = true
    await nextTick()
    goToReview()
  },
  { immediate: true },
)

const selected = computed(() => state.parts.find((p) => p.id === ui.selectedPartId) ?? savedSelected.value ?? state.parts[state.parts.length - 1] ?? work.pastLines.value[0] ?? null)
const selectedTeaching = computed(() => (selected.value ? (state.teachings.filter((t) => t.partId === selected.value!.id).pop() ?? null) : null))
const selectedHint = computed(() => (savedSelected.value && selected.value === savedSelected.value ? (savedSelected.value.hint ? { text: savedSelected.value.hint, lang: state.lang } : null) : selected.value ? (state.hintsByPart[selected.value.id] ?? null) : null))
const selectedQuestions = computed(() => state.questions.filter((q) => q.question.pointedAt?.partId === selected.value?.id))

const learned = computed(() => {
  const latest = work.latest.value
  if (!state.parts.length && latest) return { text: latest.praise, tone: 'right' as const }
  const wrong = state.parts.filter((p) => p.verdict === 'wrong')
  if (fixed.value) return { text: 'You found out that the pieces must be the same size before you add them.', tone: 'right' as const }
  if (wrong.length) return { text: `We're working on it: ${youNote(wrong[wrong.length - 1].note ?? 'got a different answer').replace(/^You/, 'you')}`, tone: 'working' as const }
  if (right.value) return { text: `Every line is right so far: ${right.value} out of ${right.value}.`, tone: 'right' as const }
  return { text: 'Write a line on your paper to get started.', tone: 'none' as const }
})
</script>

<template>
  <AppShell>
    <div ref="searchBox">
      <TopBar
        title="My work"
        subtitle="Everything you've done: every line, why it's right or not yet, and what you learned."
        :sun="false"
        :avatar="state.student?.name[0] ?? '?'"
        :bell="state.exercises.length"
        :search="ui.search"
        @update:search="ui.search = $event"
        @bell="desk.nextStep"
        @avatar="ui.pickerOpen = true"
      />
    </div>

    <div class="grid gap-5 xl:grid-cols-[2.1fr_1fr]">
      <section aria-label="Your work" class="card stagger flex min-w-0 flex-col gap-4 p-4 sm:p-5" style="--d: 120ms">
        <div class="flex flex-wrap items-center gap-2 border-b border-line pb-3">
          <span class="flex size-9 items-center justify-center rounded-xl" :style="{ background: subject.bg }">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="subject.icon" /></svg>
          </span>
          <nav aria-label="Where you are" class="flex items-center gap-2 text-[16px]">
            <span class="font-black">{{ subject.name }}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8a97ab" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
            <span class="font-semibold text-ink-2">{{ topicLabel(subject.topic) }}</span>
          </nav>
          <div class="ml-auto flex flex-wrap gap-2">
            <button v-if="work.reviews.value.length" type="button" class="inline-flex min-h-10 items-center gap-2 rounded-full bg-tangerine-soft px-4 text-[14px] font-black text-[#b4531a] transition-transform hover:-translate-y-0.5" @click="goToReview">
              <span aria-hidden="true">🎯</span> Practise again
              <span v-if="toPractise" class="rounded-full bg-tangerine px-2 py-0.5 text-[12px] tabular-nums text-white">{{ toPractise }}</span>
            </button>
            <button type="button" class="btn-lagoon inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-[14px] font-black transition-transform hover:-translate-y-0.5" @click="desk.openCamera">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13" r="3.6" /></svg>
              Open camera
            </button>
            <button
              v-if="state.parts.length"
              type="button"
              class="inline-flex min-h-10 items-center gap-2 rounded-full border border-line bg-white px-4 text-[14px] font-black transition-transform hover:-translate-y-0.5"
              @click="desk.end"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              End session
            </button>
          </div>
        </div>
        <!-- progress, from everything saved -->
        <div v-if="work.stats.value.exercises || work.stats.value.questions" class="grid grid-cols-3 gap-2 sm:grid-cols-6" aria-label="Your progress">
          <div v-for="(t, i) in tiles" :key="t.key" class="rounded-2xl px-3 py-2.5 text-center" :class="t.bg" :style="{ animation: `rise 450ms ${i * 0.06}s both` }">
            <p class="text-[24px] font-black tabular-nums leading-none" :class="t.color">{{ counts[t.key].value }}</p>
            <p class="mt-1 text-[12px] font-bold text-ink-2">{{ t.label }}</p>
          </div>
        </div>
        <div class="grid min-w-0 gap-4 lg:grid-cols-[0.95fr_1.35fr]">
          <HistoryList :parts="allParts" :meta="meta" :selected-id="selected?.id ?? null" :teachings="state.teachings" :filtered="!!ui.search" @select="(id) => (ui.selectedPartId = id)" />
          <div class="flex min-w-0 flex-col gap-3">
            <Whiteboard v-model:step="boardStep" :part="selected" :teaching="selectedTeaching" :hint="selectedHint" @open-camera="desk.openCamera" />
            <!-- a saved line: the photo it was read from, and its animation -->
            <div v-if="savedSelected" class="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-white p-3" style="animation: rise 400ms both">
              <img v-if="savedSelected.photo" :src="savedSelected.photo" alt="Your paper, as the camera saw it" class="h-24 w-36 rounded-xl object-cover" />
              <div class="flex min-w-0 flex-1 flex-col gap-2">
                <p class="text-[13px] font-bold text-ink-2">From your paper, {{ new Date(savedSelected.at).toLocaleString([], { weekday: 'long', hour: '2-digit', minute: '2-digit' }) }}</p>
                <button v-if="savedSelected.solution?.scene" type="button" class="inline-flex w-fit items-center gap-2 rounded-full bg-tangerine py-1.5 pl-1.5 pr-4 text-[14px] font-black text-white shadow transition hover:scale-105" @click="start(savedSelected.solution!, 'full')">
                  <span class="flex size-7 items-center justify-center rounded-full bg-white text-tangerine"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg></span>
                  Watch the animation
                </button>
                <p v-if="savedSelected.solution?.result" class="flex items-center gap-2 text-[14px] font-bold">Answer <MathTex :latex="savedSelected.solution.result" class="text-[18px]" /></p>
                <p v-else-if="savedSelected.solution?.about" class="text-[13px] text-ink-2"><MathTex :latex="titleTex(savedSelected.solution.about)" /></p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <InsightTabs
        v-model:tab="ui.tab"
        v-model:step="boardStep"
        :part="selected"
        :teaching="selectedTeaching"
        :profile="state.profile"
        :learned="learned.text"
        :learned-tone="learned.tone"
        :next="next"
        :questions="selectedQuestions"
        :topics="work.topics.value"
        :mistakes="work.mistakes.value"
        :next-text="work.latest.value?.next"
        @next="desk.nextStep"
      />
    </div>

    <ReviewSection class="mt-5 scroll-mt-4" :reviews="work.reviews.value" :loading="work.loading.value" :error="work.error.value" @done="work.markDone" @camera="desk.openCamera" />

    <StudentPickerModal :open="ui.pickerOpen" :current="state.student?.id" @pick="desk.pick" @close="desk.closePicker" />
  </AppShell>
</template>
