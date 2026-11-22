<script setup lang="ts">
// Choosing r out of n: the n things, then every group (when there are few), then the count.
// Without r: the number of orders, n! = n × (n−1) × ... as shrinking choices.
import { computed } from 'vue'
import type { Scene } from '@/lib/types'

const props = defineProps<{ scene: Scene; stage: number }>()
const s = computed(() => props.scene as Scene & { n: number; r: number | null; letters: string[]; value: number; groups: string[] })
const show = computed(() => String(s.value.stages[props.stage]?.show ?? 'items'))
const ink = computed(() => (s.value.skin === 'grown' ? '#fff' : '#18294a'))
const COLORS = ['#7c5ce8', '#f47a2a', '#14a096', '#1f5fd6', '#e0a21a', '#e5484d', '#22a06b', '#c2303a']
const lx = (i: number) => 320 + (i - (s.value.letters.length - 1) / 2) * Math.min(56, 560 / s.value.letters.length)
// every group the engine lists (up to 30): 5 columns, or 6 narrower ones for more than 20
const gcols = computed(() => (s.value.groups.length > 20 ? 6 : Math.min(5, Math.ceil(Math.sqrt(s.value.groups.length * 2)))))
const grows = computed(() => Math.ceil(s.value.groups.length / gcols.value))
const gstep = computed(() => (gcols.value > 5 ? 102 : 112))
const gpos = (k: number) => ({ x: 320 + ((k % gcols.value) - (gcols.value - 1) / 2) * gstep.value, y: (grows.value > 4 ? 140 : 150) + Math.floor(k / gcols.value) * (grows.value > 4 ? 40 : 44) })
const gw = computed(() => Math.min(96, gstep.value - 8))
// long groups (choosing 9 out of 10) get smaller letters, so they stay inside their pill
const glen = computed(() => Math.max(1, ...s.value.groups.map((g) => g.length)))
const gfont = computed(() => (glen.value <= 6 ? 18 : Math.min(18, (gw.value - 10) / (0.62 * glen.value))))
// the count, in a pill as wide as it needs
const valueText = computed(() => `${s.value.value} ${s.value.r === null ? 'orders' : 'groups'}`)
const pill = computed(() => {
  const w = valueText.value.length * 15.6 + 40
  return { w: Math.min(620, Math.max(190, w)), font: w > 620 ? (26 * 620) / w : 26 }
})
</script>

<template>
  <svg viewBox="0 0 640 400" class="absolute inset-0 size-full" role="img" aria-label="Choosing">
    <g v-for="(l, i) in s.letters" :key="l" class="scene-pop" :style="{ animationDelay: `${i * 0.06}s` }">
      <circle :cx="lx(i)" cy="70" r="22" :fill="COLORS[i % COLORS.length]" />
      <text :x="lx(i)" y="71" font-size="20" font-weight="900" fill="#fff" text-anchor="middle" dominant-baseline="central">{{ l }}</text>
    </g>
    <template v-if="s.r === null">
      <g v-if="show !== 'items'">
        <g v-for="i in Math.min(s.n, 8)" :key="i" class="scene-pop" :style="{ animationDelay: `${i * 0.15}s` }">
          <rect :x="320 + (i - 1 - (Math.min(s.n, 8) - 1) / 2) * 66 - 28" y="160" width="56" height="56" rx="10" fill="none" :stroke="ink" stroke-opacity="0.6" stroke-width="3" />
          <text :x="320 + (i - 1 - (Math.min(s.n, 8) - 1) / 2) * 66" y="190" font-size="22" font-weight="900" fill="#ffd34d" text-anchor="middle" dominant-baseline="central">{{ s.n - i + 1 }}</text>
        </g>
        <text x="320" y="250" font-size="16" font-weight="800" :fill="ink" fill-opacity="0.7" text-anchor="middle">choices for each place</text>
      </g>
    </template>
    <template v-else-if="show !== 'items'">
      <g v-for="(g, k) in s.groups" :key="g" class="scene-pop" :style="{ animationDelay: `${k * 0.08}s` }">
        <rect :x="gpos(k).x - gw / 2" :y="gpos(k).y - 16" :width="gw" height="34" rx="17" :fill="s.skin === 'grown' ? '#ffffff22' : '#ffffffcc'" />
        <text :x="gpos(k).x" :y="gpos(k).y + 1" :font-size="gfont" font-weight="900" :fill="ink" text-anchor="middle" dominant-baseline="central" :letter-spacing="glen <= 6 ? 3 : 0">{{ g }}</text>
      </g>
    </template>
    <g v-if="show === 'value'" class="scene-pop" style="animation-delay: 0.3s">
      <rect :x="320 - pill.w / 2" y="338" :width="pill.w" height="52" rx="26" fill="#0f7f76" />
      <text x="320" y="365" :font-size="pill.font" font-weight="900" fill="#fff" text-anchor="middle" dominant-baseline="central">{{ valueText }}</text>
    </g>
  </svg>
</template>
