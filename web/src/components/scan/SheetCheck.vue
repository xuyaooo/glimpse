<script setup lang="ts">
// "Done writing?": when the student stops writing, nothing is read by itself; this asks what to
// check (the line just written, or the whole sheet). Then the whole-sheet report: every exercise,
// right / to fix / not finished, and how to fix each.
import { computed, onBeforeUnmount, onMounted } from 'vue'
import FocusTrap from '../FocusTrap.vue'
import MathTex from '../MathTex.vue'
import Mascot from '../Mascot.vue'
import { titleTex } from '@/lib/latex'
import { itemName, youNote } from '@/lib/sheet'
import type { SheetItem, SheetReport } from '@/lib/types'

const props = defineProps<{ prompt: boolean; checking: boolean; report: SheetReport | null; open: boolean }>()
const emit = defineEmits<{ line: []; check: []; later: []; close: []; explain: [partId: number] }>()

const BADGE: Record<SheetItem['verdict'], { label: string; cls: string; icon: string }> = {
  right: { label: 'Right', cls: 'bg-right-bg text-[#136e43]', icon: '✓' },
  wrong: { label: 'To fix', cls: 'bg-wrong-bg text-wrong', icon: '✗' },
  unfinished: { label: 'Not finished', cls: 'bg-tangerine-soft text-[#b4531a]', icon: '…' },
  unsure: { label: "Couldn't check", cls: 'bg-line-2 text-ink-2', icon: '?' },
}
const share = computed(() => (props.report && props.report.total ? props.report.right / props.report.total : 0))

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open) {
    e.stopPropagation()
    emit('close')
  }
}
onMounted(() => window.addEventListener('keydown', onKey, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <!-- "Done writing?": the pencil stopped; nothing is read until the student chooses -->
  <Transition name="fade">
    <div v-if="prompt && !open && !checking" role="dialog" aria-label="Done writing?" class="fixed inset-x-0 bottom-24 z-40 mx-auto flex w-[min(94%,600px)] flex-wrap items-center gap-3 rounded-[22px] bg-white/95 p-3 shadow-2xl ring-1 ring-line backdrop-blur" style="animation: rise 450ms cubic-bezier(0.2, 0.9, 0.3, 1.2) both">
      <Mascot :size="44" class="shrink-0" />
      <div class="min-w-[150px] flex-1">
        <p class="text-[15px] font-black leading-tight">Done writing?</p>
        <p class="text-[13px] font-semibold text-ink-2">Check the line you just wrote, or every exercise on the sheet.</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="btn-lagoon min-h-10 rounded-xl px-3.5 text-[14px] font-black" @click="emit('line')">Check my line</button>
        <button type="button" class="min-h-10 rounded-xl border-2 border-lagoon-soft bg-white px-3 text-[14px] font-black text-lagoon-deep hover:bg-lagoon-mist" @click="emit('check')">Check the whole sheet</button>
        <button type="button" class="min-h-10 rounded-xl px-2.5 text-[13px] font-bold text-ink-2 hover:bg-line-2" @click="emit('later')">Not yet</button>
      </div>
    </div>
  </Transition>

  <!-- the report -->
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-[#0b1d28]/55 p-4 backdrop-blur-sm" @click.self="emit('close')">
        <FocusTrap>
          <section role="dialog" aria-modal="true" aria-labelledby="sheet-title" tabindex="-1" class="flex max-h-full w-full max-w-[620px] flex-col gap-4 overflow-hidden rounded-[30px] bg-white p-5 shadow-2xl outline-none sm:p-7" style="animation: rise 450ms both">
            <div class="flex items-center gap-3">
              <span class="flex size-12 items-center justify-center rounded-2xl bg-lagoon text-[24px] text-white" aria-hidden="true">📋</span>
              <div class="min-w-0 flex-1">
                <h2 id="sheet-title" class="text-[22px] font-black leading-tight">Your whole sheet</h2>
                <p class="text-[13px] font-semibold text-ink-2">Every exercise Glim found on the paper.</p>
              </div>
              <button type="button" aria-label="Close" class="flex size-10 items-center justify-center rounded-full bg-line-2 text-ink-2 hover:bg-line" @click="emit('close')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>

            <div v-if="checking || !report" class="flex flex-col items-center gap-3 py-10 text-center" aria-live="polite">
              <span class="size-10 animate-spin rounded-full border-4 border-lagoon-soft border-t-lagoon" aria-hidden="true" />
              <p class="text-[16px] font-black">Glim is checking every exercise…</p>
            </div>

            <template v-else>
              <div class="grid grid-cols-3 gap-2 text-center" aria-live="polite">
                <div class="rounded-2xl bg-right-bg px-2 py-3" style="animation: pop 450ms 0.05s both"><p class="text-[30px] font-black leading-none text-[#136e43]">{{ report.right }}</p><p class="mt-1 text-[12px] font-bold text-ink-2">right</p></div>
                <div class="rounded-2xl bg-wrong-bg px-2 py-3" style="animation: pop 450ms 0.15s both"><p class="text-[30px] font-black leading-none text-wrong">{{ report.wrong }}</p><p class="mt-1 text-[12px] font-bold text-ink-2">to fix</p></div>
                <div class="rounded-2xl bg-tangerine-soft px-2 py-3" style="animation: pop 450ms 0.25s both"><p class="text-[30px] font-black leading-none text-[#b4531a]">{{ report.unfinished }}</p><p class="mt-1 text-[12px] font-bold text-ink-2">not finished</p></div>
              </div>
              <div v-if="report.total" class="h-3 overflow-hidden rounded-full bg-line-2" role="progressbar" :aria-valuenow="report.right" aria-valuemin="0" :aria-valuemax="report.total" :aria-label="`${report.right} of ${report.total} right`">
                <div class="h-full rounded-full bg-[#22a06b] transition-all duration-1000" :style="{ width: `${share * 100}%` }" />
              </div>
              <p class="rounded-2xl bg-[#fff8e6] px-4 py-3 text-[16px] font-bold leading-snug">{{ report.message }}</p>

              <ol v-if="report.items.length" class="m-0 flex min-h-0 list-none flex-col gap-2 overflow-y-auto p-0 pr-1">
                <li v-for="(it, i) in report.items" :key="it.partId" class="flex items-start gap-3 rounded-2xl border-2 p-3" :class="it.verdict === 'right' ? 'border-[#cdeedb]' : it.verdict === 'wrong' ? 'border-[#f6cdd1]' : 'border-line'" :style="{ animation: `rise 400ms ${0.1 + i * 0.05}s both` }">
                  <span class="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-full bg-line-2 px-1.5 text-[13px] font-black text-ink-2">{{ itemName(it) }}</span>
                  <div class="min-w-0 flex-1">
                    <MathTex :latex="titleTex(it.latex)" class="block overflow-x-auto text-[20px]" />
                    <p v-if="it.note" class="mt-1 text-[13px] font-semibold text-ink-2">{{ youNote(it.note) }}</p>
                  </div>
                  <div class="flex shrink-0 flex-col items-end gap-1.5">
                    <span class="rounded-full px-2.5 py-0.5 text-[12px] font-black" :class="BADGE[it.verdict].cls"><span aria-hidden="true">{{ BADGE[it.verdict].icon }}</span> {{ BADGE[it.verdict].label }}</span>
                    <button v-if="it.verdict === 'wrong' || it.verdict === 'unfinished'" type="button" class="rounded-lg bg-tangerine px-2.5 py-1 text-[12px] font-black text-white shadow hover:scale-105" @click="emit('explain', it.partId)">{{ it.verdict === 'wrong' ? 'Help me fix it' : 'Help me finish' }}</button>
                  </div>
                </li>
              </ol>
              <button type="button" class="btn-lagoon min-h-11 rounded-2xl px-5 text-[15px] font-black" @click="emit('close')">Back to my sheet</button>
            </template>
          </section>
        </FocusTrap>
      </div>
    </Transition>
  </Teleport>
</template>
