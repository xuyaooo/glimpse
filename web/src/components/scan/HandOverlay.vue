<script setup lang="ts">
// The hands the camera sees, drawn over the video: a light skeleton for each hand and, when a
// finger points, a ring at the fingertip that fills up while it's held still. Full = asked.
// While the microphone listens the ring stays full; while Glim thinks, pointing does nothing.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { HAND_BONES, type Pt } from '@/lib/hands'

const props = defineProps<{ vw: number; vh: number; hands: Pt[][]; tip: Pt | null; dwell: number; asking: boolean; listening?: boolean }>()

const unit = computed(() => Math.min(props.vw, props.vh) / 100)
const ring = computed(() => unit.value * 4.2)
const circumference = computed(() => 2 * Math.PI * ring.value)
// "Got it!" for a moment when the ring closes (the question is taken), before "Say your
// question…". A finger still on the same spot after the answer asks nothing more: it has to move.
const gotIt = ref(false)
let timer = 0
watch(
  () => props.dwell >= 1,
  (full) => {
    window.clearTimeout(timer)
    gotIt.value = full
    if (full) timer = window.setTimeout(() => (gotIt.value = false), 900)
  },
)
onBeforeUnmount(() => window.clearTimeout(timer))
const label = computed(() => (gotIt.value ? 'Got it!' : props.listening ? 'Say your question…' : props.asking ? 'Thinking…' : props.dwell >= 1 ? 'Move to ask again' : 'Hold still to ask'))
const filled = computed(() => (gotIt.value || props.listening ? 1 : props.asking || props.dwell >= 1 ? 0 : props.dwell))
// keep the label on the picture
const labelX = computed(() => (props.tip ? Math.min(props.vw - unit.value * 16, Math.max(unit.value * 16, props.tip.x * props.vw)) : 0))
const labelY = computed(() => (props.tip ? Math.max(unit.value * 12, props.tip.y * props.vh - ring.value - unit.value * 3) : 0))
</script>

<template>
  <svg class="pointer-events-none absolute inset-0 z-10 size-full" :viewBox="`0 0 ${vw} ${vh}`" preserveAspectRatio="none" aria-hidden="true">
    <g v-for="(lm, h) in hands" :key="h">
      <line
        v-for="([a, b], i) in HAND_BONES"
        :key="i"
        :x1="lm[a].x * vw"
        :y1="lm[a].y * vh"
        :x2="lm[b].x * vw"
        :y2="lm[b].y * vh"
        stroke="#3fe0d0"
        stroke-opacity="0.85"
        :stroke-width="unit * 0.55"
        stroke-linecap="round"
      />
      <circle v-for="(p, i) in lm" :key="`p${i}`" :cx="p.x * vw" :cy="p.y * vh" :r="unit * (i === 8 ? 0.9 : 0.6)" fill="#ffffff" stroke="#0b1d28" :stroke-width="unit * 0.2" />
    </g>

    <g v-if="tip">
      <circle :cx="tip.x * vw" :cy="tip.y * vh" :r="ring" fill="rgb(255 210 63 / 0.18)" stroke="#ffffff" stroke-opacity="0.7" :stroke-width="unit * 0.7" />
      <circle
        :cx="tip.x * vw"
        :cy="tip.y * vh"
        :r="ring"
        fill="none"
        :stroke="filled >= 1 ? '#3fe0a0' : '#ffd23f'"
        :stroke-width="unit * 1.1"
        stroke-linecap="round"
        :stroke-dasharray="`${circumference * filled} ${circumference}`"
        :transform="`rotate(-90 ${tip.x * vw} ${tip.y * vh})`"
      />
      <g :transform="`translate(${labelX} ${labelY})`">
        <rect :x="-unit * 14" :y="-unit * 3.6" :width="unit * 28" :height="unit * 5.6" :rx="unit * 2.8" fill="#0b1d28" fill-opacity="0.82" />
        <text x="0" :y="unit * 0.35" text-anchor="middle" dominant-baseline="middle" fill="#ffffff" :font-size="unit * 2.6" font-weight="900">{{ label }}</text>
      </g>
    </g>
  </svg>
</template>
