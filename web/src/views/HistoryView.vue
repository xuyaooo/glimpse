<script setup lang="ts">
import ExerciseText from '@/components/ExerciseText.vue'
import SubjectTabs from '@/components/SubjectTabs.vue'
import { sceneIcon, sceneLabel } from '@/lib/sceneKinds'
// History: every session saved in the database, newest first. Each one has its summary, the
// lines written (with the photo they were read from), the questions asked, and the worked
// solutions, whose animations can be watched again.
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import MathTex from '@/components/MathTex.vue'
import StudentPickerModal from '@/components/StudentPickerModal.vue'
import TopBar from '@/components/TopBar.vue'
import { state } from '@/lib/engine'
import { nextTip } from '@/lib/records'
import type { Scene, SessionSummary } from '@/lib/types'
import { ui } from '@/lib/ui'
import { useDesk } from '@/lib/useDesk'
import { start } from '@/lib/player'

interface Record {
  ref: string
  sessionId: string
  kind: 'line' | 'question' | 'steps' | 'summary'
  at: number
  data: Record_
}
type Record_ = { [k: string]: unknown }

const desk = useDesk()
const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const router = useRouter()
// Searching your exercises happens on My work (as from Home).
function search(v: string) {
  ui.search = v
  router.push({ name: 'work' })
}
const records = ref<Record[]>([])
const loading = ref(true)
const error = ref('')
const open = ref<Set<string>>(new Set())

async function load() {
  error.value = ''
  // Only the history of the child who is here: nobody picked yet, nothing to show.
  const id = state.student?.id
  if (!id) {
    records.value = []
    loading.value = false
    return
  }
  loading.value = true
  try {
    const r = await fetch(`/api/history?limit=400&student=${encodeURIComponent(id)}`)
    if (!r.ok) throw new Error(`${r.status}`)
    records.value = await r.json()
    const first = sessions.value[0]
    if (first) open.value = new Set([first.id])
  } catch {
    error.value = 'The history needs the tutor engine. Start it with npm run dev.'
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch(() => state.student?.id, load)

// Maths, Reading and Science kept apart: a session belongs to the subject most of its records have
// (records from before there were subjects are maths)
const subject = ref<string>(state.subject)
const subjectOf = (r: Record) => String((r.data as { subject?: string } | null)?.subject ?? 'maths')
const SUBJECT_NAME: { [k: string]: string } = { maths: 'Maths', reading: 'Reading', science: 'Science' }
const allSessions = computed(() => {
  const by = new Map<string, Record[]>()
  for (const r of records.value) by.set(r.sessionId, [...(by.get(r.sessionId) ?? []), r])
  return [...by.entries()]
    .map(([id, rs]) => {
      const sorted = rs.sort((a, b) => a.at - b.at)
      return {
        id,
        at: sorted[0].at,
        last: sorted[sorted.length - 1].at,
        summary: sorted.find((r) => r.kind === 'summary')?.data as unknown as SessionSummary | undefined,
        lines: sorted.filter((r) => r.kind === 'line'),
        questions: sorted.filter((r) => r.kind === 'question'),
        solutions: sorted.filter((r) => r.kind === 'steps'),
        subject: mostCommon(sorted.map(subjectOf)),
      }
    })
    .sort((a, b) => b.last - a.last)
})
function mostCommon(xs: string[]) {
  const n = new Map<string, number>()
  for (const x of xs) n.set(x, (n.get(x) ?? 0) + 1)
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'maths'
}
const sessions = computed(() => (subject.value === 'all' ? allSessions.value : allSessions.value.filter((s) => s.subject === subject.value)))
const sessionCounts = computed(() => {
  const c: { [k: string]: number } = { maths: 0, reading: 0, science: 0 }
  for (const s of allSessions.value) c[s.subject] = (c[s.subject] ?? 0) + 1
  return c
})

const when = (ms: number) => new Date(ms).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const VERDICT: { [k: string]: { label: string; cls: string } } = {
  correct: { label: 'Right', cls: 'bg-right-bg text-[#136e43]' },
  wrong: { label: 'Not yet', cls: 'bg-wrong-bg text-wrong' },
  unsure: { label: 'Unfinished', cls: 'bg-[#fff4d6] text-[#8a5a00]' },
}

function toggle(id: string) {
  const s = new Set(open.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  open.value = s
}
function watchIt(r: Record) {
  const d = r.data as { about: string; title: string; result: string; scene: Scene | null; items: { say: string; math: string }[] }
  if (!d.scene) return
  start({ about: d.about, title: d.title, items: d.items ?? [], result: d.result, lang: state.lang, at: Date.now(), scene: d.scene }, 'full')
}
const str = (v: unknown) => (typeof v === 'string' ? v : '')
</script>

<template>
  <AppShell>
    <TopBar title="History" subtitle="Every session, saved: what you wrote, what you asked, and the animations." :sun="false" :avatar="state.student?.name[0] ?? '?'" :bell="0" :search="ui.search" @update:search="search" @avatar="ui.pickerOpen = true" />

    <div class="flex flex-col gap-4">
      <SubjectTabs v-model="subject" :counts="sessionCounts" />
      <p v-if="loading" class="card p-6 text-[16px] font-bold text-ink-2">Loading your history…</p>
      <p v-else-if="error" class="card p-6 text-[16px] font-bold text-wrong">{{ error }}</p>
      <div v-else-if="!sessions.length" class="card flex flex-col items-center gap-3 p-10 text-center">
        <p class="text-[20px] font-black">Nothing here yet</p>
        <p class="text-[15px] font-semibold text-ink-2">Open the camera, write a line or point at an exercise, and it will be saved here.</p>
        <button type="button" class="btn-lagoon min-h-11 rounded-full px-5 font-black" @click="desk.openCamera">Open camera</button>
      </div>

      <section v-for="(s, k) in sessions" :key="s.id" class="card stagger flex flex-col gap-3 p-4 sm:p-5" :style="{ '--d': `${k * 60}ms` }">
        <button type="button" class="flex w-full flex-wrap items-center gap-3 text-left" :aria-expanded="open.has(s.id)" @click="toggle(s.id)">
          <span class="flex gap-0.5" :aria-label="s.summary ? `${s.summary.stars} stars` : 'No summary'">
            <svg v-for="i in 3" :key="i" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z" :fill="s.summary && i <= s.summary.stars ? '#ffc93c' : '#e3ebf3'" /></svg>
          </span>
          <span class="flex flex-col">
            <span class="flex flex-wrap items-center gap-2 text-[18px] font-black">{{ s.summary?.title ?? 'Session' }}<span class="rounded-full bg-line-2 px-2 py-0.5 text-[11px] font-black uppercase tracking-wide text-ink-2">{{ SUBJECT_NAME[s.subject] ?? s.subject }}</span></span>
            <span class="text-[13px] font-bold text-ink-2">{{ when(s.at) }} · {{ count(s.lines.length, 'line') }} · {{ count(s.questions.length, 'question') }} · {{ count(s.solutions.length, 'solution') }}</span>
          </span>
          <svg class="ml-auto transition-transform" :class="open.has(s.id) ? 'rotate-180' : ''" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
        </button>

        <template v-if="open.has(s.id)">
          <p v-if="s.summary" class="rounded-2xl bg-[#fff8e6] px-4 py-3 text-[15px] font-bold">{{ s.summary.praise }} <span class="font-semibold text-ink-2">Next time: {{ nextTip(s.summary.next) }}</span></p>

          <div v-if="s.lines.length" class="flex flex-col gap-2">
            <h3 class="text-[14px] font-black text-ink-2">What you wrote</h3>
            <div class="grid gap-2 md:grid-cols-2">
              <div v-for="l in s.lines" :key="l.ref" class="flex gap-3 rounded-2xl border border-line p-3">
                <img v-if="str(l.data.photo)" :src="str(l.data.photo)" alt="The photo the line was read from" class="h-20 w-28 shrink-0 rounded-xl object-cover" />
                <div class="flex min-w-0 flex-col gap-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <MathTex :latex="str(l.data.latex)" class="text-[19px]" />
                    <span v-if="VERDICT[str(l.data.verdict)]" class="rounded-full px-2.5 py-0.5 text-[12px] font-black" :class="VERDICT[str(l.data.verdict)].cls">{{ VERDICT[str(l.data.verdict)].label }}</span>
                  </div>
                  <p v-if="str(l.data.hint)" class="text-[13px] font-semibold text-ink-2">{{ str(l.data.hint) }}</p>
                </div>
              </div>
            </div>
          </div>

          <div v-if="s.questions.length" class="flex flex-col gap-2">
            <h3 class="text-[14px] font-black text-ink-2">What you asked</h3>
            <div v-for="q in s.questions" :key="q.ref" class="flex gap-3 rounded-2xl bg-violet-soft p-3">
              <img v-if="str(q.data.photo)" :src="str(q.data.photo)" alt="Where you pointed" class="h-20 w-28 shrink-0 rounded-xl object-cover" />
              <div class="min-w-0">
                <p class="text-[15px] font-black">« {{ str(q.data.text) }} »</p>
                <ExerciseText v-if="str(q.data.about)" :latex="str(q.data.about)" math="text-[17px]" words="text-[15px] font-bold" />
                <p class="mt-1 text-[14px] font-semibold">{{ str(q.data.answer) }}</p>
              </div>
            </div>
          </div>

          <div v-if="s.solutions.length" class="flex flex-col gap-2">
            <h3 class="text-[14px] font-black text-ink-2">Solutions and animations</h3>
            <div class="flex flex-wrap gap-2">
              <button v-for="r in s.solutions" :key="r.ref" type="button" class="flex items-center gap-2.5 rounded-2xl border-2 border-line bg-white px-3.5 py-2 transition hover:-translate-y-0.5 hover:border-lagoon disabled:cursor-default disabled:hover:translate-y-0 disabled:hover:border-line" :disabled="!(r.data as any).scene" @click="watchIt(r)">
                <span v-if="(r.data as any).scene" class="flex size-8 items-center justify-center rounded-full bg-tangerine text-white" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg></span>
                <ExerciseText :latex="str(r.data.about)" math="text-[17px]" words="text-[15px] font-bold" />
                <span v-if="(r.data as any).scene" class="text-[12px] font-black text-ink-2">{{ sceneIcon((r.data as any).scene.kind) }} {{ sceneLabel((r.data as any).scene.kind) }}</span>
              </button>
            </div>
          </div>

          <details v-if="s.summary" class="rounded-2xl border border-line px-4 py-3">
            <summary class="cursor-pointer text-[14px] font-black">For grown-ups</summary>
            <p class="mt-2 text-[14px] text-ink-2">{{ s.summary.for_adults }}</p>
          </details>
        </template>
      </section>
    </div>

    <StudentPickerModal :open="ui.pickerOpen" :current="state.student?.id" @pick="desk.pick" @close="desk.closePicker" />
  </AppShell>
</template>
