<script setup lang="ts">
const CLOUDS = [
  { top: '2%', left: '18%', w: 150, dur: '52s', delay: '0s', o: 0.95 },
  { top: '7%', left: '58%', w: 210, dur: '64s', delay: '-20s', o: 0.85 },
  { top: '1%', left: '86%', w: 130, dur: '48s', delay: '-8s', o: 0.9 },
  { top: '44%', left: '96%', w: 170, dur: '70s', delay: '-30s', o: 0.6 },
]
</script>

<template>
  <div class="pointer-events-none absolute inset-x-0 top-0 h-[620px] overflow-hidden" aria-hidden="true">
    <svg
      v-for="(c, i) in CLOUDS"
      :key="i"
      :width="c.w"
      :height="c.w * 0.5"
      viewBox="0 0 120 60"
      class="absolute"
      :style="{ top: c.top, left: c.left, opacity: c.o, animation: `drift ${c.dur} ease-in-out ${c.delay} infinite alternate` }"
    >
      <path d="M22 50 a14 14 0 0 1 4 -27 a19 19 0 0 1 35 -9 a16 16 0 0 1 28 8 a13 13 0 0 1 9 28 z" fill="#fff" />
    </svg>
  </div>
</template>
