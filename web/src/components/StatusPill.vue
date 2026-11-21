<script setup lang="ts">
import { computed } from 'vue'
import type { Connection, EngineState } from '@/lib/types'

const props = defineProps<{ status: EngineState; connection: Connection }>()

const view = computed(() => {
  if (props.connection === 'offline') return { text: 'Tutor offline', cls: 'bg-mute text-ink-2', dot: 'bg-ink-2' }
  switch (props.status) {
    case 'reading':
      return { text: 'Reading your line', cls: 'bg-pen-soft text-pen-deep', dot: 'bg-pen' }
    case 'thinking':
    case 'answering':
      return { text: 'Thinking', cls: 'bg-pen-soft text-pen-deep', dot: 'bg-pen' }
    case 'listening':
      return { text: 'Listening', cls: 'bg-marker-soft text-marker-ink', dot: 'bg-marker' }
    case 'idle':
      return { text: 'Ready', cls: 'bg-mute text-ink', dot: 'bg-ink-2' }
    default:
      return { text: 'Watching your paper', cls: 'bg-pen-soft text-pen-deep', dot: 'bg-pen' }
  }
})
</script>

<template>
  <span role="status" class="inline-flex items-center gap-2 rounded-full px-3 py-[7px] text-[13px] font-bold" :class="view.cls">
    <span class="size-2 rounded-full" :class="view.dot" />{{ view.text }}
  </span>
</template>
