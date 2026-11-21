<script setup lang="ts">
import type { Mark } from '@/lib/types'

defineProps<{ total: number; current: number; marks: Record<number, Mark> }>()
</script>

<template>
  <div class="flex items-center gap-3.5">
    <span class="text-sm font-bold">Problem {{ current }} of {{ total }}</span>
    <span aria-hidden="true" class="flex gap-1.5">
      <span
        v-for="i in total"
        :key="i"
        class="size-3 rounded-full"
        :class="
          marks[i]?.verdict === 'correct'
            ? 'bg-pen'
            : marks[i]?.verdict === 'wrong'
              ? 'border-[3px] border-marker'
              : i === current
                ? 'border-[3px] border-pen'
                : 'bg-[#d5dae2]'
        "
      />
    </span>
  </div>
</template>
