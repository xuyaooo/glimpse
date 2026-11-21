<script setup lang="ts">
import { computed, ref } from 'vue'
import { activity, type ActivityKind } from '@/lib/activity'

const props = withDefaults(defineProps<{ limit?: number }>(), { limit: 3 })
const all = ref(false)
const shown = computed(() => activity.items.slice(0, all.value ? 20 : props.limit))

const ICON: Record<ActivityKind, { bg: string; path: string }> = {
  camera: { bg: '#0F7F76', path: 'M4 8h3l2-3h6l2 3h3v11H4zm8 9a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' },
  read: { bg: '#14A096', path: 'M16.9 3.3a2 2 0 0 1 2.8 0l1 1a2 2 0 0 1 0 2.8L9.4 18.4 4 20l1.6-5.4z' },
  right: { bg: '#22A06B', path: 'M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6L20.1 8.4 18.7 7z' },
  wrong: { bg: '#E5484D', path: 'M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6z' },
  unsure: { bg: '#E0A21A', path: 'M11 17h2v2h-2zm1-14a6 6 0 0 0-6 6h2a4 4 0 1 1 4 4h-1v3h2v-1.1A6 6 0 0 0 12 3z' },
  teach: { bg: '#F47A2A', path: 'M12 3v9h9A9 9 0 1 1 12 3zm2-1a8 8 0 0 1 8 8h-8z' },
  practice: { bg: '#7C5CE8', path: 'M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z' },
  ask: { bg: '#1F5FD6', path: 'M4 4h16v12H8l-4 4zm7 3v2h2V7zm0 4v3h2v-3z' },
  answer: { bg: '#1F5FD6', path: 'M4 4h16v12H8l-4 4zm3 4v2h10V8zm0 4v2h7v-2z' },
  learned: { bg: '#FFC93C', path: 'M12 2a7 7 0 0 0-4 12.7V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.3A7 7 0 0 0 12 2zM9 20h6v1a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z' },
}

const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
</script>

<template>
  <section aria-label="What's going on" class="flex flex-col gap-3 rounded-[24px] bg-white p-5 shadow-[0_14px_30px_-22px_rgb(24_41_74/0.5)]">
    <div class="flex items-center justify-between gap-2">
      <h3 class="flex items-center gap-2 text-lg font-black">
        <span class="relative flex size-2.5"><span class="absolute inline-flex size-full animate-ping rounded-full bg-lagoon-bright opacity-60" /><span class="relative size-2.5 rounded-full bg-lagoon-bright" /></span>
        What's going on
      </h3>
      <button v-if="activity.items.length > limit" type="button" class="text-[13px] font-black text-marker underline decoration-2 underline-offset-4" @click="all = !all">{{ all ? 'Show less' : `Show all ${Math.min(activity.items.length, 20)}` }}</button>
    </div>
    <p v-if="!activity.items.length" class="text-[14px] font-semibold text-ink-2">Each step Glimpse takes shows up here, in plain words.</p>
    <TransitionGroup tag="ol" name="list" class="relative m-0 flex list-none flex-col p-0" aria-live="polite">
      <li v-for="(a, i) in shown" :key="a.id" class="relative flex gap-3 pb-3">
        <span v-if="i < shown.length - 1" class="absolute left-[15px] top-8 h-[calc(100%-26px)] w-0.5 bg-line" aria-hidden="true" />
        <span class="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full shadow-sm" :style="{ background: ICON[a.kind].bg }">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path :d="ICON[a.kind].path" /></svg>
        </span>
        <span class="flex min-w-0 flex-col pt-0.5">
          <span class="flex flex-wrap items-baseline gap-x-2">
            <b class="text-[15px] leading-snug">{{ a.text }}</b>
            <span class="text-[12px] font-semibold tabular-nums text-ink-3">{{ clock(a.at) }}</span>
          </span>
          <span v-if="a.detail" class="text-[13px] font-semibold leading-snug text-ink-2">{{ a.detail }}</span>
        </span>
      </li>
    </TransitionGroup>
  </section>
</template>
