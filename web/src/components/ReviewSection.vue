<script setup lang="ts">
// Practise again: after each finished session, Glim suggests a few exercises like the ones done
// that day (the ones that went wrong first). Do one on paper, then show the answer or watch how
// it's solved. "I did it" is saved with the session.
import { computed, ref, watch } from 'vue'
import MathTex from './MathTex.vue'
import { state } from '@/lib/engine'
import { titleTex } from '@/lib/latex'
import { start } from '@/lib/player'
import { sceneIcon, sceneLabel } from '@/lib/sceneKinds'
import type { ReviewItem, SessionReview } from '@/lib/types'

const props = defineProps<{ reviews: SessionReview[]; loading: boolean; error: string }>()
const emit = defineEmits<{ done: [ref: string, id: string, done: boolean]; camera: [] }>()

// the session shown: the newest one, until another is picked
const chosen = ref<string | null>(null)
const session = computed(() => props.reviews.find((r) => r.ref === chosen.value) ?? props.reviews[0] ?? null)
// answers shown, per exercise (they start hidden: try it first)
const open = ref(new Set<string>())
watch(
  () => session.value?.ref,
  () => (open.value = new Set()),
)
function reveal(item: ReviewItem) {
  const next = new Set(open.value)
  if (next.has(item.id)) next.delete(item.id)
  else next.add(item.id)
  open.value = next
}

const total = computed(() => props.reviews.reduce((t, r) => t + r.items.length, 0))
const doneCount = computed(() => props.reviews.reduce((t, r) => t + r.items.filter((i) => i.done).length, 0))
const left = (r: SessionReview) => r.items.filter((i) => !i.done).length

const LEVEL: Record<ReviewItem['level'], { label: string; cls: string }> = {
  again: { label: 'Try it again', cls: 'bg-tangerine-soft text-[#b4531a]' },
  same: { label: 'New numbers', cls: 'bg-lagoon-mist text-lagoon-deep' },
  harder: { label: 'A bit harder', cls: 'bg-violet-soft text-violet' },
  idea: { label: "Glim's idea", cls: 'bg-marker-soft text-marker' },
}

function when(at: number) {
  const d = new Date(at)
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(at).setHours(0, 0, 0, 0)) / 86400000)
  if (days === 0) return `Today, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  if (days === 1) return 'Yesterday'
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })
}

function watchIt(item: ReviewItem, i: number) {
  if (!item.scene || !session.value) return
  start({ about: item.exercise, title: 'Practise again', items: [], result: item.answer ?? '', lang: state.lang, at: session.value.at + i + 1, scene: item.scene }, 'full')
}
</script>

<template>
  <section id="review" aria-labelledby="review-title" class="card stagger flex min-w-0 flex-col gap-4 p-4 sm:p-5" style="--d: 200ms">
    <div class="flex flex-wrap items-center gap-3">
      <span class="flex size-11 items-center justify-center rounded-2xl bg-tangerine text-[22px] shadow-[0_8px_18px_-10px_var(--color-tangerine)]" aria-hidden="true">🎯</span>
      <div class="min-w-0 flex-1">
        <h2 id="review-title" class="text-[20px] font-black leading-tight">Practise again</h2>
        <p class="text-[14px] font-semibold text-ink-2">After each session, Glim picks exercises like yours. Do them on paper, then check.</p>
      </div>
      <div v-if="total" class="flex min-w-[150px] flex-col gap-1" aria-live="polite">
        <p class="text-right text-[13px] font-black text-ink-2"><span class="text-[#136e43]">{{ doneCount }}</span> of {{ total }} done</p>
        <div class="h-2.5 overflow-hidden rounded-full bg-line-2" role="progressbar" :aria-valuenow="doneCount" aria-valuemin="0" :aria-valuemax="total" aria-label="Exercises done">
          <div class="h-full rounded-full bg-[#22a06b] transition-all duration-700" :style="{ width: `${(doneCount / total) * 100}%` }" />
        </div>
      </div>
    </div>

    <p v-if="loading && !reviews.length" class="flex items-center gap-2 py-6 text-[14px] font-bold text-ink-2"><span class="size-4 animate-spin rounded-full border-2 border-lagoon-soft border-t-lagoon" aria-hidden="true" /> Finding your exercises…</p>
    <p v-else-if="error && !reviews.length" class="rounded-2xl bg-line-2 px-4 py-3 text-[14px] font-bold text-ink-2">{{ error }}</p>
    <div v-else-if="!reviews.length" class="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-dashed border-line px-4 py-5">
      <p class="min-w-0 flex-1 text-[15px] font-bold text-ink-2">When you finish a session (<span class="text-ink">End session</span>), Glim suggests exercises to practise here.</p>
      <button type="button" class="btn-lagoon min-h-10 rounded-full px-4 text-[14px] font-black" @click="emit('camera')">Open camera</button>
    </div>

    <template v-else-if="session">
      <!-- one chip per finished session, newest first -->
      <div class="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Sessions">
        <button
          v-for="(r, i) in reviews"
          :key="r.ref"
          type="button"
          class="flex shrink-0 items-center gap-2 rounded-full border-2 py-1.5 pl-3 pr-2 text-[13px] font-black transition"
          :class="r.ref === session.ref ? 'border-lagoon bg-lagoon text-white' : 'border-line bg-white text-ink hover:border-lagoon-soft'"
          :aria-pressed="r.ref === session.ref"
          :style="{ animation: `rise 400ms ${i * 0.04}s both` }"
          @click="chosen = r.ref"
        >
          <span>{{ when(r.at) }}</span>
          <span class="max-w-[160px] truncate font-bold opacity-80">{{ r.title }}</span>
          <span class="rounded-full px-2 py-0.5 text-[12px] tabular-nums" :class="r.ref === session.ref ? 'bg-white/20' : left(r) ? 'bg-tangerine-soft text-[#b4531a]' : 'bg-right-bg text-[#136e43]'">{{ r.items.length ? (left(r) ? `${left(r)} to do` : '✓ all done') : '–' }}</span>
        </button>
      </div>

      <p v-if="!session.items.length" class="rounded-2xl bg-line-2 px-4 py-4 text-[15px] font-bold text-ink-2">Nothing to practise from this session: no maths was written. Write a line next time, and Glim will pick exercises for you.</p>

      <TransitionGroup v-else tag="ol" name="list" class="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 2xl:grid-cols-3">
        <li
          v-for="(item, i) in session.items"
          :key="`${session.ref}-${item.id}`"
          class="relative flex flex-col gap-3 rounded-[22px] border-2 bg-white p-4 transition-all duration-500"
          :class="item.done ? 'border-[#bfe8cf] bg-[#f6fcf8]' : 'border-line hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-22px_rgb(24_41_74/0.5)]'"
          :style="{ animation: `rise 450ms ${i * 0.07}s both` }"
        >
          <div class="flex flex-wrap items-center gap-2">
            <span class="flex size-7 items-center justify-center rounded-full text-[13px] font-black" :class="item.done ? 'bg-[#22a06b] text-white' : 'bg-line-2 text-ink-2'">
              <svg v-if="item.done" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5" /></svg>
              <template v-else>{{ i + 1 }}</template>
            </span>
            <span class="rounded-full px-2.5 py-0.5 text-[12px] font-black" :class="LEVEL[item.level].cls">{{ LEVEL[item.level].label }}</span>
            <span v-if="item.kind" class="ml-auto text-[12px] font-bold text-ink-3">{{ sceneIcon(item.kind) }} {{ sceneLabel(item.kind) }}</span>
          </div>

          <!-- the exercise, on a bit of squared paper -->
          <div class="review-paper flex min-h-[76px] items-center justify-center overflow-x-auto rounded-2xl px-3 py-4">
            <MathTex :latex="titleTex(item.exercise)" :class="/\\text\{/.test(titleTex(item.exercise)) && item.exercise.length > 24 ? 'text-[18px]' : 'text-[26px]'" />
          </div>
          <p class="text-[14px] font-semibold leading-snug text-ink-2">{{ item.why }}</p>

          <div v-if="open.has(item.id)" class="flex flex-wrap items-center gap-2 rounded-2xl bg-right-bg px-3 py-2" style="animation: pop 400ms cubic-bezier(0.3, 1.6, 0.5, 1) both">
            <span class="text-[13px] font-black text-[#136e43]">Answer</span>
            <MathTex v-if="item.answer" :latex="item.answer" class="text-[22px]" />
            <span v-else class="text-[13px] font-bold text-ink-2">Write it on paper and lift your pencil: Glim will check it.</span>
          </div>

          <div class="mt-auto flex flex-wrap gap-2">
            <button type="button" class="min-h-10 rounded-xl border-2 border-line bg-white px-3 text-[13px] font-black transition hover:border-lagoon-soft" :aria-expanded="open.has(item.id)" @click="reveal(item)">
              {{ open.has(item.id) ? 'Hide the answer' : 'Show the answer' }}
            </button>
            <button v-if="item.scene" type="button" class="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-tangerine px-3 text-[13px] font-black text-white shadow transition hover:scale-[1.03]" @click="watchIt(item, i)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
              Watch how
            </button>
            <button
              type="button"
              class="ml-auto inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-[13px] font-black transition"
              :class="item.done ? 'bg-[#22a06b] text-white' : 'bg-right-bg text-[#136e43] hover:bg-[#d3efdf]'"
              :aria-pressed="!!item.done"
              @click="emit('done', session.ref, item.id, !item.done)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5" /></svg>
              {{ item.done ? 'Done' : 'I did it' }}
            </button>
          </div>
        </li>
      </TransitionGroup>

      <div v-if="session.items.length" class="flex flex-wrap items-center gap-3 rounded-2xl bg-lagoon-mist px-4 py-3">
        <p class="min-w-0 flex-1 text-[14px] font-bold text-lagoon-deep">Want Glim to check your work? Write the exercise under the camera and lift your pencil.</p>
        <button type="button" class="btn-lagoon min-h-10 rounded-full px-4 text-[14px] font-black" @click="emit('camera')">Open camera</button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.review-paper {
  background-color: #fffdf7;
  background-image:
    linear-gradient(rgb(31 95 214 / 0.07) 1px, transparent 1px),
    linear-gradient(90deg, rgb(31 95 214 / 0.07) 1px, transparent 1px);
  background-size: 18px 18px;
  box-shadow: inset 0 0 0 1px rgb(24 41 74 / 0.06);
}
</style>
