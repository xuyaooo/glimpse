<script setup lang="ts">
// Maths · Reading · Science · All: each subject's records kept apart (My work, History).
import { SUBJECTS } from '@/lib/subjects'

defineProps<{ modelValue: string; counts?: Record<string, number> }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const tabs = [...SUBJECTS.map((s) => ({ id: s.id as string, name: s.name, bg: s.bg, icon: s.icon })), { id: 'all', name: 'All', bg: 'linear-gradient(160deg,#5b6b84,#18294a)', icon: 'M4 6h16M4 12h16M4 18h16' }]
</script>

<template>
  <div role="tablist" aria-label="Subject" class="flex flex-wrap gap-2">
    <button
      v-for="t in tabs"
      :key="t.id"
      type="button"
      role="tab"
      :aria-selected="modelValue === t.id"
      class="flex min-h-10 items-center gap-2 rounded-full border-2 py-1 pl-1 pr-3.5 text-[14px] font-black transition"
      :class="modelValue === t.id ? 'border-ink bg-ink text-white shadow-md' : 'border-line bg-white text-ink hover:border-lagoon-soft'"
      @click="emit('update:modelValue', t.id)"
    >
      <span class="flex size-7 items-center justify-center rounded-full" :style="{ background: t.bg }">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="t.icon" /></svg>
      </span>
      {{ t.name }}
      <span v-if="counts && t.id !== 'all'" class="rounded-full px-1.5 text-[12px] tabular-nums" :class="modelValue === t.id ? 'bg-white/20' : 'bg-line-2 text-ink-2'">{{ counts[t.id] ?? 0 }}</span>
    </button>
  </div>
</template>
