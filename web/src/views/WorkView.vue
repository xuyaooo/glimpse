<script setup lang="ts">
// My work: every line written today, the reasoning given for the selected one on the
// whiteboard, and Summary / Explanation beside it.
import { computed, onMounted, ref } from 'vue'
import AppShell from '@/components/AppShell.vue'
import HistoryList from '@/components/HistoryList.vue'
import InsightTabs from '@/components/InsightTabs.vue'
import StudentPickerModal from '@/components/StudentPickerModal.vue'
import TopBar from '@/components/TopBar.vue'
import Whiteboard from '@/components/Whiteboard.vue'
import { state } from '@/lib/engine'
import { ui } from '@/lib/ui'
import { useDesk } from '@/lib/useDesk'

const desk = useDesk()
const { subject, right, fixed, next } = desk
const boardStep = ref(0)
const searchBox = ref<HTMLElement | null>(null)

// Arriving from the search box on Home: keep typing here.
onMounted(() => {
  if (ui.search) searchBox.value?.querySelector('input')?.focus()
})

const plain = (latex: string) => latex.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '$1/$2').replace(/\s+/g, '')
const shownParts = computed(() => {
  const q = ui.search.replace(/\s+/g, '')
  return q ? state.parts.filter((p) => plain(p.latex).includes(q)) : state.parts
})

const selected = computed(() => state.parts.find((p) => p.id === ui.selectedPartId) ?? state.parts[state.parts.length - 1] ?? null)
const selectedTeaching = computed(() => (selected.value ? (state.teachings.filter((t) => t.partId === selected.value!.id).pop() ?? null) : null))
const selectedHint = computed(() => (selected.value ? (state.hintsByPart[selected.value.id] ?? null) : null))
const selectedQuestions = computed(() => state.questions.filter((q) => q.question.pointedAt?.partId === selected.value?.id))

const learned = computed(() => {
  const wrong = state.parts.filter((p) => p.verdict === 'wrong')
  if (fixed.value) return { text: 'You found out that the pieces must be the same size before you add them.', tone: 'right' as const }
  if (wrong.length) return { text: `We're working on it: you ${wrong[wrong.length - 1].note ?? 'got a different answer'}.`, tone: 'working' as const }
  if (right.value) return { text: `Every line is right so far: ${right.value} out of ${right.value}.`, tone: 'right' as const }
  return { text: 'Write a line on your paper to get started.', tone: 'none' as const }
})
</script>

<template>
  <AppShell>
    <div ref="searchBox">
      <TopBar
        title="My work"
        subtitle="Every line you wrote today, and why it's right or not yet."
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
            <span class="font-semibold text-ink-2">{{ subject.topic }}</span>
          </nav>
          <div class="ml-auto flex flex-wrap gap-2">
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
        <div class="grid min-w-0 gap-4 lg:grid-cols-[0.95fr_1.35fr]">
          <HistoryList :parts="shownParts" :selected-id="selected?.id ?? null" :teachings="state.teachings" :filtered="!!ui.search" @select="(id) => (ui.selectedPartId = id)" />
          <Whiteboard v-model:step="boardStep" :part="selected" :teaching="selectedTeaching" :hint="selectedHint" @open-camera="desk.openCamera" />
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
        @next="desk.nextStep"
      />
    </div>

    <StudentPickerModal :open="ui.pickerOpen" :current="state.student?.id" @pick="desk.pick" @close="desk.closePicker" />
  </AppShell>
</template>
