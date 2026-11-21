<script setup lang="ts">
// A stacked fraction, printed (worksheet) or handwritten (the child's pen).
withDefaults(defineProps<{ n: number | string; d: number | string; hand?: boolean; outlineDen?: boolean }>(), {
  hand: false,
  outlineDen: false,
})
</script>

<template>
  <span class="inline-flex flex-col items-center leading-none align-middle" :class="hand ? 'font-hand text-[32px] text-[#1a1c22]' : ''" :aria-label="`${n}/${d}`" role="img">
    <span aria-hidden="true">{{ n }}</span>
    <span
      aria-hidden="true"
      class="border-t-current"
      :class="[hand ? 'border-t-[2.5px] px-[5px]' : 'border-t-2 px-[3px]', outlineDen ? 'rounded-[2px] outline-[3px] outline-offset-[3px] outline-pen' : '']"
      :style="outlineDen ? { outlineStyle: 'solid' } : undefined"
    >{{ d }}</span>
  </span>
</template>
