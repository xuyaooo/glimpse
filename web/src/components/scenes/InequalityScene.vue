<script setup lang="ts">
// An inequality: solved step by step (written above), then every number that works shaded on
// the number line: an empty dot for < and >, a filled dot for ≤ and ≥.
import { computed } from 'vue'
import MathTex from '../MathTex.vue'
import type { Scene } from '@/lib/types'

const props = defineProps<{ scene: Scene; stage: number }>()
const s = computed(() => props.scene as Scene & { value: number; rel: '<' | '>' | '<=' | '>=' })
const ray = computed(() => s.value.stages[props.stage]?.show === 'ray')
const math = computed(() => String(s.value.stages[props.stage]?.math ?? ''))
const lo = computed(() => Math.floor(s.value.value) - 5)
const hi = computed(() => Math.floor(s.value.value) + 5)
const X = (v: number) => 60 + ((v - lo.value) / (hi.value - lo.value)) * 520
const right = computed(() => s.value.rel === '>' || s.value.rel === '>=')
const filled = computed(() => s.value.rel === '<=' || s.value.rel === '>=')
const ink = computed(() => (s.value.skin === 'grown' ? '#ffffff' : '#18294a'))
const ticks = computed(() => Array.from({ length: hi.value - lo.value + 1 }, (_, i) => lo.value + i))
</script>

<template>
  <div class="absolute inset-0">
    <div class="absolute inset-x-0 top-[10%] flex justify-center" :class="s.skin === 'grown' ? 'text-white' : 'text-ink'">
      <MathTex :key="math" :latex="math" class="text-[34px]" style="animation: rise 500ms both" />
    </div>
    <svg viewBox="0 0 640 400" class="absolute inset-0 size-full" role="img" aria-label="Number line">
      <line x1="40" y1="270" x2="600" y2="270" :stroke="ink" stroke-width="4" />
      <g v-for="t in ticks" :key="t">
        <line :x1="X(t)" y1="260" :x2="X(t)" y2="280" :stroke="ink" stroke-width="2" />
        <text :x="X(t)" y="308" font-size="17" font-weight="800" fill="#9fb3c8" text-anchor="middle">{{ t }}</text>
      </g>
      <template v-if="ray">
        <rect :x="right ? X(s.value) : 40" y="262" :width="right ? 600 - X(s.value) : X(s.value) - 40" height="16" rx="8" fill="#3fe0d0" class="scene-pop" style="transform-origin: left" />
        <path :d="right ? 'M600 256 l22 14 l-22 14 z' : 'M40 256 l-22 14 l22 14 z'" fill="#3fe0d0" class="scene-pop" />
        <circle :cx="X(s.value)" cy="270" r="13" :fill="filled ? '#3fe0d0' : '#0b1d28'" stroke="#3fe0d0" stroke-width="5" class="scene-pop" />
      </template>
    </svg>
  </div>
</template>
