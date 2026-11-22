<script setup lang="ts">
// The "Whole sheet" tab of the scan window's right panel: every exercise on the paper. Before a
// whole-sheet check: the lines checked one by one so far. During one: Glim checking. After: the
// score, Glim's sentence, and every exercise with its verdict, what went wrong, "Show me how"
// (worked solution + animation) and "See it" (the line in the other tab).
import { computed, ref, watch } from 'vue'
import MathTex from '../MathTex.vue'
import { titleTex } from '@/lib/latex'
import { speak } from '@/lib/speech'
import type { SheetItem, SheetReport, WrittenPart } from '@/lib/types'

const props = defineProps<{ report: SheetReport | null; checking: boolean; parts: WrittenPart[]; selectedId: number | null }>()
const emit = defineEmits<{ check: []; explain: [partId: number]; select: [partId: number] }>()

type Filter = 'all' | SheetItem['verdict']
const filter = ref<Filter>('all')
watch(
  () => props.report?.at,
  () => (filter.value = 'all'),
)

const VERDICT: Record<SheetItem['verdict'], { label: string; cls: string; ring: string; icon: string }> = {
  right: { label: 'Right', cls: 'bg-right-bg text-[#136e43]', ring: 'border-[#cdeedb]', icon: 'M4 12.5l5 5L20 6.5' },
  wrong: { label: 'To fix', cls: 'bg-wrong-bg text-wrong', ring: 'border-[#f6cdd1]', icon: 'M6 6l12 12M18 6L6 18' },
  unfinished: { label: 'Not finished', cls: 'bg-tangerine-soft text-[#b4531a]', ring: 'border-[#ffd9bf]', icon: 'M5 12h.01M12 12h.01M19 12h.01' },
  unsure: { label: "Couldn't check", cls: 'bg-line-2 text-ink-2', ring: 'border-line', icon: 'M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5h.01' },
}
// before any whole-sheet check, the lines checked one by one, in the same shape
const asItems = (parts: WrittenPart[]): SheetItem[] =>
  parts
    .filter((p) => p.verdict !== 'reading')
    .map((p, i) => ({ n: i + 1, partId: p.id, latex: p.latex, verdict: p.verdict === 'correct' ? 'right' : p.verdict === 'wrong' ? 'wrong' : p.note === 'not finished yet' ? 'unfinished' : 'unsure', note: p.note && p.note !== 'not finished yet' ? p.note : null }))
const items = computed(() => props.report?.items ?? asItems(props.parts))
const shown = computed(() => (filter.value === 'all' ? items.value : items.value.filter((x) => x.verdict === filter.value)))
const count = (v: SheetItem['verdict']) => items.value.filter((x) => x.verdict === v).length
const filters = computed(() =>
  (
    [
      { id: 'all', label: 'All', n: items.value.length },
      { id: 'wrong', label: 'To fix', n: count('wrong') },
      { id: 'unfinished', label: 'Not finished', n: count('unfinished') },
      { id: 'right', label: 'Right', n: count('right') },
    ] as { id: Filter; label: string; n: number }[]
  ).filter((f) => f.id === 'all' || f.n),
)
// the score ring: the share that is right
const share = computed(() => (props.report && props.report.total ? props.report.right / props.report.total : 0))
const C = 2 * Math.PI * 34
const when = computed(() => (props.report ? new Date(props.report.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''))
const cheer = computed(() => (props.report && props.report.total && props.report.right === props.report.total ? '🌟' : ''))
</script>

<template>
  <section aria-label="Your whole sheet" class="flex flex-col gap-4 rounded-[24px] bg-white p-5 shadow-[0_14px_30px_-22px_rgb(24_41_74/0.5)]" style="animation: rise 400ms both">
    <div class="flex flex-wrap items-center gap-2">
      <div class="min-w-0 flex-1">
        <h3 class="text-lg font-black">Your whole sheet {{ cheer }}</h3>
        <p class="text-[13px] font-semibold text-ink-2">
          <template v-if="checking">Checking every exercise on the paper…</template>
          <template v-else-if="report">Checked at {{ when }} · {{ report.total }} {{ report.total === 1 ? 'exercise' : 'exercises' }}</template>
          <template v-else-if="parts.length">Your lines so far, checked one by one</template>
          <template v-else>Every exercise on the paper, checked at once</template>
        </p>
      </div>
      <button type="button" :disabled="checking" class="inline-flex min-h-10 items-center gap-2 rounded-xl px-3.5 text-[14px] font-black transition hover:-translate-y-0.5 disabled:opacity-60" :class="report ? 'border-2 border-lagoon-soft bg-white text-lagoon-deep hover:bg-lagoon-mist' : 'btn-lagoon'" @click="emit('check')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" :class="checking ? 'animate-spin' : ''"><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" /></svg>
        {{ checking ? 'Checking…' : report ? 'Check again' : 'Check my whole sheet' }}
      </button>
    </div>

    <!-- checking -->
    <div v-if="checking" class="flex flex-col gap-2" aria-live="polite" aria-busy="true">
      <div class="flex items-center gap-3 rounded-2xl bg-lagoon-mist px-4 py-3">
        <span class="size-6 shrink-0 animate-spin rounded-full border-[3px] border-lagoon-soft border-t-lagoon" aria-hidden="true" />
        <p class="text-[15px] font-black text-lagoon-deep">Glim is reading the paper and checking every exercise…</p>
      </div>
      <span v-for="i in 3" :key="i" class="shimmer h-14 w-full rounded-2xl" :style="{ animationDelay: `${i * 0.15}s` }" />
    </div>

    <!-- the score -->
    <template v-else-if="report">
      <div class="flex flex-wrap items-center gap-4">
        <svg width="92" height="92" viewBox="0 0 80 80" role="img" :aria-label="`${report.right} of ${report.total} right`" class="shrink-0">
          <circle cx="40" cy="40" r="34" fill="none" stroke="var(--color-line-2)" stroke-width="9" />
          <circle cx="40" cy="40" r="34" fill="none" stroke="#22a06b" stroke-width="9" stroke-linecap="round" :stroke-dasharray="`${C * share} ${C}`" transform="rotate(-90 40 40)" style="transition: stroke-dasharray 1s cubic-bezier(0.2, 0.8, 0.2, 1)" />
          <text x="40" y="38" text-anchor="middle" font-size="19" font-weight="900" fill="var(--color-ink)">{{ report.right }}/{{ report.total }}</text>
          <text x="40" y="52" text-anchor="middle" font-size="9" font-weight="800" fill="var(--color-ink-2)">right</text>
        </svg>
        <div class="grid min-w-0 flex-1 grid-cols-3 gap-2 text-center">
          <div class="rounded-2xl bg-right-bg px-1 py-2.5" style="animation: pop 450ms 0.05s both"><p class="text-[24px] font-black leading-none text-[#136e43]">{{ report.right }}</p><p class="mt-1 text-[12px] font-bold text-ink-2">right</p></div>
          <div class="rounded-2xl bg-wrong-bg px-1 py-2.5" style="animation: pop 450ms 0.15s both"><p class="text-[24px] font-black leading-none text-wrong">{{ report.wrong }}</p><p class="mt-1 text-[12px] font-bold text-ink-2">to fix</p></div>
          <div class="rounded-2xl bg-tangerine-soft px-1 py-2.5" style="animation: pop 450ms 0.25s both"><p class="text-[24px] font-black leading-none text-[#b4531a]">{{ report.unfinished }}</p><p class="mt-1 text-[12px] font-bold text-ink-2">not finished</p></div>
        </div>
      </div>
      <div class="flex items-start gap-3 rounded-2xl bg-[#fff8e6] px-4 py-3" aria-live="polite">
        <div class="flex-1">
          <p class="text-[12px] font-black text-[#8a5a00]">Glim says</p>
          <p class="text-[16px] font-bold leading-snug">{{ report.message }}</p>
        </div>
        <button type="button" aria-label="Hear it" title="Hear it" class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#8a5a00] shadow-sm" @click="speak(report.message, 'en')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5L6 9H3v6h3l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /></svg>
        </button>
      </div>
    </template>

    <!-- nothing yet -->
    <div v-else-if="!parts.length" class="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line px-4 py-7 text-center">
      <span class="text-[34px]" aria-hidden="true" style="animation: bob 1.6s ease-in-out infinite alternate">📋</span>
      <p class="text-[15px] font-bold text-ink-2">Write your exercises, then press <span class="text-ink">Check my whole sheet</span>: Glim checks them all and tells you how many are right, which to fix and which aren't finished.</p>
    </div>

    <!-- every exercise -->
    <template v-if="!checking && items.length">
      <div v-if="filters.length > 2" class="flex flex-wrap gap-1.5" role="group" aria-label="Show">
        <button v-for="f in filters" :key="f.id" type="button" :aria-pressed="filter === f.id" class="rounded-full border-2 px-3 py-1 text-[13px] font-black transition" :class="filter === f.id ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink-2 hover:border-lagoon-soft'" @click="filter = f.id">
          {{ f.label }} <span class="tabular-nums opacity-70">{{ f.n }}</span>
        </button>
      </div>
      <TransitionGroup tag="ol" name="list" class="m-0 flex list-none flex-col gap-2 p-0">
        <li v-for="(it, i) in shown" :key="`${report?.at ?? 'live'}-${it.partId}`" class="group flex items-start gap-3 rounded-2xl border-2 bg-white p-3 transition hover:shadow-md" :class="[VERDICT[it.verdict].ring, it.partId === selectedId ? 'ring-2 ring-lagoon-soft' : '']" :style="{ animation: `rise 380ms ${0.04 * i}s both` }">
          <span class="flex size-8 shrink-0 items-center justify-center rounded-full text-[13px] font-black" :class="VERDICT[it.verdict].cls">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="VERDICT[it.verdict].icon" /></svg>
          </span>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-[12px] font-black text-ink-3">#{{ it.n }}</span>
              <span class="rounded-full px-2 py-0.5 text-[11px] font-black" :class="VERDICT[it.verdict].cls">{{ VERDICT[it.verdict].label }}</span>
            </div>
            <MathTex :latex="titleTex(it.latex)" class="mt-0.5 block overflow-x-auto text-[20px]" />
            <p v-if="it.note" class="mt-1 text-[13px] font-semibold leading-snug text-ink-2">{{ it.note.charAt(0).toUpperCase() + it.note.slice(1) }}</p>
          </div>
          <div class="flex shrink-0 flex-col items-end gap-1.5">
            <button v-if="it.verdict === 'wrong' || it.verdict === 'unfinished'" type="button" class="inline-flex items-center gap-1 rounded-lg bg-tangerine px-2.5 py-1.5 text-[12px] font-black text-white shadow transition hover:scale-105" @click="emit('explain', it.partId)">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
              Show me how
            </button>
            <button type="button" class="rounded-lg px-2 py-1 text-[12px] font-black text-lagoon-deep hover:bg-lagoon-mist" @click="emit('select', it.partId)">See it</button>
          </div>
        </li>
      </TransitionGroup>
      <p v-if="!report && parts.length" class="text-[13px] font-semibold text-ink-3">These are the lines you checked one by one. <button type="button" class="font-black text-lagoon-deep underline" @click="emit('check')">Check the whole sheet</button> to have every exercise checked at once.</p>
    </template>
  </section>
</template>
