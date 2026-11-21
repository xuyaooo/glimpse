<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import BrandMark from '@/components/BrandMark.vue'
import FractionBar from '@/components/FractionBar.vue'
import { endSession, startSession, state } from '@/lib/engine'

const router = useRouter()

const minutes = computed(() => Math.max(1, Math.round((Date.now() - state.startedAt) / 60000)))
const done = computed(() => state.problems.filter((p) => state.marks[p.id]?.verdict === 'correct' || state.marks[p.id]?.verdict === 'wrong'))

function outcome(id: number) {
  const v = state.marks[id]?.verdict
  if (v === 'wrong') return { text: 'we looked at it together', cls: 'border-2 border-marker bg-[#fff7f0]', tone: 'text-marker-ink' }
  if (v === 'correct') return { text: 'right', cls: 'border border-line bg-paper', tone: 'text-pen-deep' }
  return { text: 'not done yet', cls: 'border border-dashed border-line bg-paper', tone: 'text-ink-2' }
}

function again() {
  startSession()
  router.push({ name: 'desk' })
}

function finish() {
  endSession()
  state.student = null
  router.push({ name: 'start' })
}
</script>

<template>
  <div class="flex min-h-screen flex-col bg-squared">
    <header class="px-4 py-6 sm:px-10"><BrandMark /></header>

    <main class="mx-auto flex w-full max-w-[1040px] flex-1 flex-col gap-7 px-4 pb-12 pt-2 sm:px-6">
      <div class="flex flex-col gap-2.5">
        <h1 class="text-[40px] font-bold leading-[1.05] tracking-[-0.02em] sm:text-[56px]">Nice work, {{ state.student?.name }}!</h1>
        <p class="text-[19px] text-ink-2">{{ done.length }} problems in {{ minutes }} minutes{{ state.insight ? ', and one big idea figured out' : '' }}.</p>
      </div>

      <section v-if="state.insight" aria-label="What clicked today" class="flex flex-wrap items-center gap-7 rounded-md border-[1.5px] border-ink bg-paper p-7">
        <div class="flex min-w-0 flex-[1_1_300px] flex-col gap-3 rounded-2xl bg-[#f7f9fc] p-5">
          <div class="flex items-center gap-3"><span class="w-10 text-right font-bold">1/2</span><FractionBar :n="1" :d="2" tone="marker" :height="36" /></div>
          <div class="flex items-center gap-3"><span class="w-10 text-right font-bold">2/4</span><FractionBar :n="2" :d="4" tone="marker" :height="36" /></div>
          <span class="pl-[52px] text-sm text-ink-2">same amount, smaller pieces</span>
        </div>
        <div class="flex min-w-0 flex-[999_1_380px] flex-col gap-3">
          <span class="text-base font-bold text-pen-deep">What clicked today</span>
          <p class="text-[32px] font-bold leading-tight">{{ state.insight.text }}</p>
          <p class="flex items-center gap-2.5 text-base">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2452CC" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5" /></svg>
            {{ state.insight.evidence }}
          </p>
        </div>
      </section>

      <section aria-label="Your problems today" class="flex flex-col gap-3.5">
        <h2 class="text-base font-bold">Your problems today</h2>
        <ol class="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3 p-0">
          <li v-for="p in state.problems" :key="p.id" class="flex flex-col gap-2 rounded-[14px] p-4" :class="outcome(p.id).cls">
            <span class="text-[13px] text-ink-2">Problem {{ p.id }}</span>
            <span class="text-lg font-bold">{{ p.a.n }}/{{ p.a.d }} + {{ p.b.n }}/{{ p.b.d }}</span>
            <span class="text-sm font-bold" :class="outcome(p.id).tone">{{ outcome(p.id).text }}</span>
          </li>
        </ol>
      </section>

      <div class="flex flex-wrap items-center gap-3.5">
        <button type="button" class="min-h-[60px] rounded-[14px] bg-pen px-7 text-xl font-bold text-white" @click="again">Another round</button>
        <button type="button" class="min-h-[60px] rounded-[14px] border border-line bg-paper px-7 text-lg font-bold text-ink" @click="finish">I'm done</button>
        <span class="text-sm text-ink-2">Your teacher will see what you practised today.</span>
      </div>
    </main>
  </div>
</template>
