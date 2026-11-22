<script setup lang="ts">
// Adding or taking away with real things: 3 apples, 4 more come, count them all.
import { computed } from 'vue'
import type { Scene } from '@/lib/types'

const props = defineProps<{ scene: Scene; stage: number }>()
const s = computed(() => props.scene as Scene & { a: number; b: number; op: '+' | '-'; result: number; emoji: string })

// Items laid out in a grid, group A on the left, group B (or the ones that go) on the right.
const items = computed(() => {
  const { a, b, op } = s.value
  const total = op === '+' ? a + b : a
  const size = total > 12 ? 50 : total > 6 ? 62 : 78
  const place = (n: number, x0: number, w: number) => {
    const cols = Math.max(1, Math.min(n, Math.floor(w / (size * 1.05))))
    return Array.from({ length: n }, (_, i) => ({ x: x0 + (i % cols) * size * 1.05 + size / 2, y: 120 + Math.floor(i / cols) * size * 1.1 }))
  }
  if (op === '+') {
    return [...place(a, 40, 270).map((p, i) => ({ ...p, group: 'a', i })), ...place(b, 340, 270).map((p, i) => ({ ...p, group: 'b', i }))].map((it, k) => ({ ...it, k, size }))
  }
  return place(a, 60, 520).map((p, i) => ({ ...p, group: i >= a - b ? 'b' : 'a', i, k: i, size }))
})
const shown = (it: { group: string }) => props.stage >= 1 || it.group === 'a' || s.value.op === '-'
const gone = (it: { group: string }) => s.value.op === '-' && it.group === 'b' && props.stage >= 1
const counting = computed(() => props.stage >= 2)
const counted = computed(() => items.value.filter((it) => !gone(it)))
</script>

<template>
  <svg viewBox="0 0 640 400" class="absolute inset-0 size-full" role="img" :aria-label="`${s.a} ${s.op === '+' ? 'plus' : 'minus'} ${s.b}`">
    <!-- sun and clouds -->
    <circle cx="590" cy="48" r="26" fill="#ffd34d" style="animation: pulse-ring 3s ease-in-out infinite" />
    <g fill="#fff" opacity="0.9"><ellipse cx="90" cy="50" rx="34" ry="13" /><ellipse cx="112" cy="42" rx="22" ry="14" /></g>
    <g v-for="it in items" :key="it.k">
      <text
        v-if="shown(it)"
        :x="it.x"
        :y="it.y"
        :font-size="it.size * 0.82"
        text-anchor="middle"
        dominant-baseline="central"
        class="scene-pop"
        :class="gone(it) ? 'scene-gone' : ''"
        :style="{ animationDelay: `${(it.group === 'b' && s.op === '+' ? it.i : it.k) * 0.12}s` }"
      >{{ s.emoji }}</text>
      <g v-if="counting && !gone(it)" class="scene-pop" :style="{ animationDelay: `${counted.indexOf(it) * 0.35 + 0.2}s` }">
        <circle :cx="it.x + it.size * 0.32" :cy="it.y - it.size * 0.32" :r="it.size * 0.2" fill="#0f7f76" stroke="#fff" stroke-width="3" />
        <text :x="it.x + it.size * 0.32" :y="it.y - it.size * 0.31" :font-size="it.size * 0.22" fill="#fff" font-weight="900" text-anchor="middle" dominant-baseline="central">{{ counted.indexOf(it) + 1 }}</text>
      </g>
    </g>
    <text v-if="s.op === '+' && stage >= 1" x="320" y="190" font-size="64" font-weight="900" fill="#f47a2a" text-anchor="middle" class="scene-pop">+</text>
    <g v-if="counting" class="scene-pop" :style="{ animationDelay: `${counted.length * 0.35 + 0.4}s` }">
      <rect x="220" y="300" width="200" height="74" rx="37" fill="#fff" stroke="#0f7f76" stroke-width="5" />
      <text x="320" y="338" font-size="44" font-weight="900" fill="#0b6962" text-anchor="middle" dominant-baseline="central">{{ s.result }}</text>
    </g>
  </svg>
</template>
