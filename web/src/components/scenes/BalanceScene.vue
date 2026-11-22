<script setup lang="ts">
// An equation as a balance: both sides weigh the same, so whatever we do to one side we do to
// the other. Countable equations show mystery bags (x) and blocks; others show the algebra.
import { computed } from 'vue'
import type { Scene } from '@/lib/types'

interface Side {
  x: number
  n: number
}
const props = defineProps<{ scene: Scene; stage: number }>()
const s = computed(() => props.scene as Scene & { solution: number })
const st = computed(() => s.value.stages[props.stage] as unknown as { left: Side; right: Side; eq: string })
const blocks = computed(() => s.value.skin !== 'grown')
const last = computed(() => props.stage === s.value.stages.length - 1)
const ink = computed(() => (s.value.skin === 'grown' ? '#ffffff' : '#18294a'))
const fmt = (v: number) => (Number.isInteger(v) ? String(v) : String(+v.toFixed(3)))

// items stacked on a pan, centred on cx
function pile(side: Side, cx: number) {
  const items = [...Array.from({ length: Math.max(0, Math.round(side.x)) }, (_, i) => ({ key: `x${i}`, bag: true })), ...Array.from({ length: Math.max(0, Math.round(side.n)) }, (_, i) => ({ key: `n${i}`, bag: false }))]
  const per = 6
  const w = 30
  return items.map((it, i) => {
    const row = Math.floor(i / per)
    const inRow = Math.min(per, items.length - row * per)
    return { ...it, x: cx + ((i % per) - (inRow - 1) / 2) * (w + 4), y: 232 - row * (w + 4) }
  })
}
const sides = computed(() => {
  const [l, r] = (st.value.eq || '=').split('=').map((t) => t.trim())
  return [
    { cx: 170, side: st.value.left, text: l },
    { cx: 470, side: st.value.right, text: r },
  ]
})
</script>

<template>
  <svg viewBox="0 0 640 400" class="absolute inset-0 size-full" role="img" :aria-label="`Balance: ${st.eq}`">
    <!-- stand -->
    <path d="M320 262 L280 360 L360 360 Z" :fill="blocks ? '#7a5a3a' : '#3b6b7d'" />
    <rect x="250" y="356" width="140" height="14" rx="7" :fill="blocks ? '#5d4430' : '#2b5161'" />
    <g :key="stage" class="scene-wobble">
      <rect x="80" y="252" width="480" height="12" rx="6" :fill="blocks ? '#8b6a47' : '#9fd8e6'" />
      <circle cx="320" cy="258" r="12" :fill="blocks ? '#5d4430' : '#3fe0d0'" />
      <g v-for="(p, i) in sides" :key="i">
        <path :d="`M${p.cx - 110} 252 L${p.cx - 96} 236 L${p.cx + 96} 236 L${p.cx + 110} 252 Z`" :fill="blocks ? '#c9a77d' : '#1f4d60'" opacity="0.5" />
        <template v-if="blocks && !last">
          <TransitionGroup tag="g" name="poof">
            <g v-for="it in pile(p.side, p.cx)" :key="it.key">
              <template v-if="it.bag">
                <rect :x="it.x - 15" :y="it.y - 30" width="30" height="30" rx="10" fill="#7c5ce8" />
                <text :x="it.x" :y="it.y - 14" font-size="17" font-weight="900" fill="#fff" text-anchor="middle" dominant-baseline="central">{{ s.skin === 'kid' ? '?' : 'x' }}</text>
              </template>
              <rect v-else :x="it.x - 14" :y="it.y - 28" width="28" height="28" rx="5" fill="#f47a2a" stroke="#fff" stroke-width="2" />
            </g>
          </TransitionGroup>
        </template>
        <text v-else :key="`${stage}-${p.text}`" :x="p.cx" y="210" font-size="40" font-weight="900" :fill="ink" text-anchor="middle" class="scene-pop">{{ p.text }}</text>
      </g>
    </g>
    <text x="320" y="70" font-size="34" font-weight="900" :fill="ink" text-anchor="middle" :key="st.eq" class="scene-pop">{{ st.eq }}</text>
    <g v-if="last" class="scene-pop" style="animation-delay: 0.4s">
      <rect x="215" y="96" width="210" height="62" rx="31" fill="#7c5ce8" />
      <text x="320" y="128" font-size="34" font-weight="900" fill="#fff" text-anchor="middle" dominant-baseline="central">x = {{ fmt(s.solution) }}</text>
    </g>
  </svg>
</template>
