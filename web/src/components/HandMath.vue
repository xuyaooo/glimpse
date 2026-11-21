<script setup lang="ts">
// Maths in the tutor's blue marker. The line writes itself in; a mistake gets circled,
// a right answer gets a tick, both drawn after the writing.
import { computed } from 'vue'
import { tokens, type Token } from '@/lib/latex'

const props = withDefaults(defineProps<{ latex: string; size?: number | string; mark?: 'wrong' | 'correct' | null; color?: string; delay?: number }>(), {
  size: 44,
  mark: null,
  color: '#1F5FD6',
  delay: 0,
})

const split = computed(() => {
  const t = tokens(props.latex)
  const last = t.map((x) => x.kind).lastIndexOf('frac')
  return last < 0 ? { head: t, last: null as Token | null, tail: [] as Token[] } : { head: t.slice(0, last), last: t[last], tail: t.slice(last + 1) }
})
const spoken = computed(() =>
  tokens(props.latex)
    .map((t) => (t.kind === 'frac' ? `${t.n}/${t.d}` : t.v))
    .join(' '),
)
</script>

<template>
  <span class="relative inline-flex items-center font-marker font-bold leading-none" :style="{ fontSize: typeof size === 'number' ? `${size}px` : size, color }" role="img" :aria-label="spoken">
    <span class="write-on inline-flex items-center gap-[0.22em]" :style="{ '--dur': '0.9s', '--delay': `${delay}s` }" aria-hidden="true">
      <template v-for="(t, i) in split.head" :key="i">
        <span v-if="t.kind === 'frac'" class="inline-flex flex-col items-center"><span>{{ t.n }}</span><span class="border-t-[0.07em] border-current px-[0.12em] leading-[0.95]">{{ t.d }}</span></span>
        <span v-else>{{ t.v }}</span>
      </template>
      <span v-if="split.last && split.last.kind === 'frac'" class="relative inline-flex flex-col items-center">
        <span>{{ split.last.n }}</span><span class="border-t-[0.07em] border-current px-[0.12em] leading-[0.95]">{{ split.last.d }}</span>
      </span>
      <template v-for="(t, i) in split.tail" :key="`t${i}`"><span v-if="t.kind === 'text'">{{ t.v }}</span></template>
    </span>
    <!-- circle around the answer -->
    <svg v-if="mark === 'wrong'" class="pointer-events-none absolute -right-[0.35em] -top-[0.3em] h-[1.9em] w-[1.6em] -rotate-12 overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <path class="draw" pathLength="1" :style="{ '--dur': '0.7s', '--delay': `${delay + 0.95}s` }" d="M62 6 C88 8 98 40 92 64 C85 92 40 98 18 84 C-2 70 2 30 22 14 C36 4 58 2 78 12" fill="none" stroke="#E8620F" stroke-width="5" stroke-linecap="round" vector-effect="non-scaling-stroke" />
    </svg>
    <svg v-else-if="mark === 'correct'" class="ml-[0.3em] h-[0.9em] w-[1.1em] overflow-visible" viewBox="0 0 44 36" aria-hidden="true">
      <path class="draw" pathLength="1" :style="{ '--dur': '0.5s', '--delay': `${delay + 0.95}s` }" d="M4 19 L16 31 L40 4" fill="none" stroke="#22A06B" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  </span>
</template>
