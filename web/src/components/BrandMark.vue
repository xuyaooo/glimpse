<script setup lang="ts">
withDefaults(defineProps<{ size?: number; wordmark?: boolean }>(), { size: 28, wordmark: true })
</script>

<template>
  <span class="inline-flex items-center gap-2.5">
    <svg :width="size" :height="size" viewBox="0 0 30 30" :role="wordmark ? undefined : 'img'" :aria-label="wordmark ? undefined : 'Glimpse'" :aria-hidden="wordmark ? 'true' : undefined">
      <circle cx="15" cy="15" r="11.5" fill="none" stroke="#12141A" stroke-width="2.5" />
      <circle cx="15" cy="15" r="4.5" fill="#2452CC" />
      <path d="M23 6 L26.5 2.5" stroke="#E8620F" stroke-width="2.5" stroke-linecap="round" />
    </svg>
    <span v-if="wordmark" class="text-[21px] font-bold">Glimpse</span>
  </span>
</template>
