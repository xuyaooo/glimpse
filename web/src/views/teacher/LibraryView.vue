<script setup lang="ts">
import { computed, ref } from 'vue'
import { library, type LibraryEntry } from '@/lib/mock'

type Filter = 'all' | LibraryEntry['topic'] | 'ai'
const filter = ref<Filter>('all')
const query = ref('')

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'Fractions', label: 'Fractions' },
  { id: 'Equations', label: 'Equations' },
  { id: 'Powers', label: 'Powers' },
  { id: 'ai', label: 'Found by the AI' },
]

const matches = (e: LibraryEntry, f: Filter) => f === 'all' || (f === 'ai' ? e.origin === 'ai' : e.topic === f)
const count = (f: Filter) => library.filter((e) => matches(e, f)).length

const shown = computed(() => {
  const q = query.value.trim().toLowerCase()
  return library.filter((e) => matches(e, filter.value) && (!q || `${e.name} ${e.example} ${e.wrong}`.toLowerCase().includes(q)))
})
</script>

<template>
  <main class="mx-auto flex w-full max-w-[1280px] flex-1 flex-col gap-6 px-4 pb-12 pt-9 sm:px-8">
    <div class="flex max-w-[820px] flex-col gap-2.5">
      <h1 class="text-4xl font-bold leading-tight tracking-[-0.01em]">Misconception library</h1>
      <p class="text-[19px] leading-normal">Each entry is a small program that reproduces a child's exact wrong answer. If the program can't reproduce it, it doesn't go in.</p>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <div role="group" aria-label="Filter" class="flex flex-wrap gap-2">
        <button
          v-for="f in FILTERS"
          :key="f.id"
          type="button"
          :aria-pressed="filter === f.id"
          class="min-h-10 rounded-full px-3.5 text-[15px]"
          :class="filter === f.id ? 'bg-ink font-bold text-white' : 'border border-line bg-paper text-ink'"
          @click="filter = f.id"
        >{{ f.label }} {{ count(f.id) }}</button>
      </div>
      <label class="flex min-h-10 items-center gap-2 rounded-[10px] border border-line bg-paper px-3 text-[15px] text-ink-2">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
        <span class="sr-only">Search misconceptions</span>
        <input v-model="query" type="search" placeholder="Search, e.g. 4/6" class="w-[180px] border-0 bg-transparent text-ink outline-none" />
      </label>
    </div>

    <p v-if="!shown.length" class="text-lg text-ink-2">Nothing matches. Clear the search or pick another filter.</p>

    <div class="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-[18px]">
      <article
        v-for="e in shown"
        :key="e.id"
        class="flex flex-col gap-3 rounded-md bg-paper px-[22px] py-5"
        :class="e.pending ? 'border-2 border-dashed border-marker' : 'border border-line'"
      >
        <div class="flex items-start justify-between gap-2.5">
          <h2 class="text-[19px] font-bold leading-snug">{{ e.name }}</h2>
          <span class="shrink-0 rounded-full bg-desk px-2.5 py-[3px] text-[13px]">{{ e.topic }}</span>
        </div>
        <p class="text-base">{{ e.example }} gives <b class="text-marker-ink">{{ e.wrong }}</b></p>
        <pre class="m-0 overflow-x-auto rounded bg-[#f7f9fc] px-3.5 py-3 font-mono text-[13px] leading-relaxed">{{ e.code }}</pre>
        <template v-if="e.pending">
          <p class="text-[15px] font-bold text-marker-ink">New today. Reproduces the answer on {{ e.checkedOn }} of {{ e.checkedOn }} problems; waiting for your review before the hint goes live.</p>
          <div class="flex flex-wrap gap-2.5 border-t border-line-soft pt-2.5">
            <button type="button" class="min-h-10 rounded-[10px] bg-pen px-3.5 text-[15px] font-bold text-white">Approve</button>
            <button type="button" class="min-h-10 rounded-[10px] border border-line bg-paper px-3.5 text-[15px] text-ink">Reject</button>
          </div>
        </template>
        <template v-else>
          <p :lang="e.hintLang" class="text-[15px] text-ink-2">Hint: {{ e.hint }}</p>
          <div class="flex flex-wrap justify-between gap-2 border-t border-line-soft pt-2.5 text-sm">
            <span>Seen in {{ e.seenIn }} {{ e.seenIn === 1 ? 'child' : 'children' }}</span>
            <span v-if="e.origin === 'ai'" class="font-bold text-pen-deep">Found by the AI, checked on {{ e.checkedOn }} problems</span>
            <span v-else class="text-ink-2">Written by the team</span>
          </div>
        </template>
      </article>
    </div>
  </main>
</template>
