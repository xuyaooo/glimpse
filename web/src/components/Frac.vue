<script setup lang="ts">
// A stacked fraction in the child's pencil (what the camera sees, in demo mode). Size follows the parent.
withDefaults(defineProps<{ n: number | string; d: number | string; outlineDen?: boolean }>(), { outlineDen: false })
</script>

<template>
  <span class="inline-flex flex-col items-center align-middle font-pencil leading-none text-[#2a2d33]" :aria-label="`${n}/${d}`" role="img">
    <span aria-hidden="true">{{ n }}</span>
    <span
      aria-hidden="true"
      class="border-t-[2.5px] border-t-current px-[5px]"
      :class="outlineDen ? 'rounded-[3px] outline-[3px] outline-offset-[3px] outline-marker' : ''"
      :style="outlineDen ? { outlineStyle: 'solid' } : undefined"
    >{{ d }}</span>
  </span>
</template>
