<script setup lang="ts">
import { MASTERED } from '@/lib/mock'

withDefaults(defineProps<{ value: number; size?: 'sm' | 'lg' }>(), { size: 'sm' })
</script>

<template>
  <span v-if="size === 'sm'" class="flex items-center gap-2">
    <span class="h-2 w-14 overflow-hidden rounded bg-mute"><span class="block h-full bg-pen" :style="{ width: `${value}%` }" /></span>
    <b v-if="value >= MASTERED" class="text-pen-deep">{{ value }}</b>
    <span v-else>{{ value }}</span>
  </span>
  <span v-else class="relative h-3.5 flex-1 basis-[200px] rounded-[7px] bg-mute">
    <span class="block h-full rounded-[7px] bg-pen" :style="{ width: `${value}%` }" />
    <span class="absolute -top-1 h-[22px] w-0.5 bg-ink" :style="{ left: `${MASTERED}%` }" aria-hidden="true" />
  </span>
</template>
