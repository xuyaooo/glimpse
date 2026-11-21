<script setup lang="ts">
import type { Tone } from '@/lib/types'

withDefaults(defineProps<{ n: number; d: number; tone?: Tone; height?: number }>(), { tone: 'pen', height: 44 })
</script>

<template>
  <div
    role="img"
    :aria-label="`A bar cut into ${d} equal pieces, ${n} shaded`"
    class="grid flex-1 overflow-hidden rounded-md border-2 border-ink"
    :style="{ gridTemplateColumns: `repeat(${d}, minmax(0, 1fr))`, height: `${height}px` }"
  >
    <span
      v-for="i in d"
      :key="i"
      :class="[
        i <= n ? (tone === 'pen' ? 'bg-pen' : 'bg-marker') : tone === 'pen' ? 'bg-pen-pale' : 'bg-marker-pale',
        i < d ? (i === n ? 'border-r-2 border-ink' : i < n ? 'border-r-2 border-white' : 'border-r-2 border-ink') : '',
      ]"
    />
  </div>
</template>
