<script setup lang="ts">
// Past exercises, newest first. Picking one puts its reasoning back on the whiteboard.
import MathTex from './MathTex.vue'
import type { Teaching, WrittenPart } from '@/lib/types'
import { youNote } from '@/lib/useWork'

defineProps<{ parts: WrittenPart[]; selectedId: number | null; teachings: Teaching[]; filtered: boolean; meta?: Record<number, { when: string; photo: string | null; animated: boolean }> }>()
defineEmits<{ select: [id: number] }>()

const BADGE = { correct: 'bg-right-mark', wrong: 'bg-wrong-mark', reading: 'bg-lagoon-bright', unsure: 'bg-[#e0a21a]' }
// a line saved from an earlier session (it has `meta`) shows its mark: its id is only internal
const MARK = { correct: '✓', wrong: '✗', reading: '…', unsure: '?' }
const fixFor = (teachings: Teaching[], id: number) => {
  const t = teachings.filter((x) => x.partId === id).pop()
  return t?.steps[t.steps.length - 1]
}
</script>

<template>
  <section aria-label="Past exercises" class="flex min-w-0 flex-col gap-2">
    <h3 class="px-1 text-[15px] font-black text-ink-2">Past exercises</h3>
    <p v-if="!parts.length" class="rounded-2xl border-2 border-dashed border-line px-4 py-8 text-center text-[15px] font-semibold text-ink-2">
      {{ filtered ? 'Nothing matches your search.' : 'Every line you write shows up here, newest first, and stays saved.' }}
    </p>
    <TransitionGroup tag="ol" name="list" class="relative m-0 flex max-h-[560px] list-none flex-col gap-2 overflow-y-auto p-0 pr-1">
      <li v-for="p in [...parts].reverse()" :key="p.id">
        <button
          type="button"
          :aria-pressed="p.id === selectedId"
          class="group w-full rounded-2xl p-3 text-left transition-all duration-300"
          :class="p.id === selectedId ? 'bg-lagoon-mist shadow-[inset_0_0_0_2px_var(--color-lagoon-soft)]' : 'hover:bg-line-2'"
          @click="$emit('select', p.id)"
        >
          <div class="flex items-start gap-3">
            <img v-if="meta?.[p.id]?.photo" :src="meta[p.id].photo!" alt="" class="mt-0.5 h-10 w-14 shrink-0 rounded-lg object-cover ring-2" :class="p.verdict === 'correct' ? 'ring-right-mark' : p.verdict === 'wrong' ? 'ring-wrong-mark' : 'ring-[#e0a21a]'" />
            <span v-else class="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-black text-white transition-transform group-hover:scale-110" :class="BADGE[p.verdict]">{{ meta?.[p.id] ? MARK[p.verdict] : p.id }}</span>
            <div class="flex min-w-0 flex-1 flex-col gap-1.5">
              <span class="flex items-center gap-2 text-[14px] font-bold text-ink-2">
                {{ meta?.[p.id] ? meta[p.id].when : p.exerciseId ? 'A similar exercise' : 'Today' }}
                <span v-if="meta?.[p.id]?.animated" class="rounded-full bg-tangerine-soft px-2 py-0.5 text-[11px] font-black text-tangerine" title="Has an animation">▶ animation</span>
              </span>
              <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <MathTex :latex="p.latex" class="text-[21px]" />
                <span v-if="p.verdict === 'correct'" class="inline-flex animate-pop items-center gap-1 rounded-full bg-right-bg px-2.5 py-0.5 text-[13px] font-black text-right">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5" /></svg>Right
                </span>
                <span v-else-if="p.verdict === 'wrong'" class="inline-flex animate-pop items-center gap-1 rounded-full bg-wrong-bg px-2.5 py-0.5 text-[13px] font-black text-wrong">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>Not yet
                </span>
                <span v-else-if="p.verdict === 'reading'" class="shimmer h-6 w-20 rounded-full" aria-label="Reading" />
                <span v-else class="rounded-full bg-[#fff4d6] px-2.5 py-0.5 text-[13px] font-black text-[#8a5a00]">Check it</span>
              </div>
              <p v-if="p.verdict === 'wrong' && p.note" class="text-[14px] font-semibold text-wrong">{{ youNote(p.note) }}</p>
              <Transition name="fade">
                <p v-if="p.id === selectedId && p.verdict === 'wrong' && fixFor(teachings, p.id)" class="mt-1 flex items-start gap-2.5 rounded-xl bg-right-bg px-3 py-2.5 text-[14px] font-semibold text-right">
                  <svg class="mt-px shrink-0" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#22A06B" /><path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
                  {{ fixFor(teachings, p.id) }}
                </p>
              </Transition>
            </div>
          </div>
        </button>
      </li>
    </TransitionGroup>
  </section>
</template>
