<script setup lang="ts">
// A fraction as a chocolate bar: d equal pieces, n of them left. Eaten pieces are dashed.
// Every bar has the same height, so bars with different pieces compare at a glance.
withDefaults(defineProps<{ n: number; d: number; delay?: number; height?: string }>(), { delay: 0, height: '9cqw' })
</script>

<template>
  <div
    role="img"
    :aria-label="`A chocolate bar of ${d} equal pieces, ${n} left`"
    class="grid gap-[2px] rounded-[6px] bg-white/12 p-[3px]"
    :style="{ gridTemplateColumns: `repeat(${d}, minmax(0, 1fr))`, height }"
  >
    <span
      v-for="i in d"
      :key="i"
      class="rounded-[3px]"
      :class="i <= n ? '' : 'border border-dashed border-white/50'"
      :style="
        i <= n
          ? {
              background: 'linear-gradient(145deg, #94603c, #5d331b)',
              boxShadow: 'inset 1.5px 1.5px 0 rgb(255 255 255 / 0.22), inset -1.5px -1.5px 0 rgb(0 0 0 / 0.25)',
              animation: `pop 420ms cubic-bezier(0.3, 1.5, 0.5, 1) ${delay + i * 0.06}s both`,
            }
          : undefined
      "
    />
  </div>
</template>
