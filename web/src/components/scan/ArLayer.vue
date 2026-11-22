<script setup lang="ts">
// Drawn on top of the live camera, in the video's own pixels: the frame for the paper, a mark
// on each line (reading, tick, orange circle), and the tutor's drawing on the desk beside it,
// joined to the line it explains by an arrow.
import { computed } from 'vue'
import ArTeaching from './ArTeaching.vue'
import { deskRect, pct, sheetRect, slotRect, SLOTS } from '@/lib/geometry'
import type { Answer, Question, Teaching, WrittenPart } from '@/lib/types'

const props = defineProps<{
  vw: number
  vh: number
  parts: WrittenPart[]
  selectedId: number | null
  teaching: Teaching | null
  step: number
  question: Question | null
  answer: Answer | null
  pointing: { partId: number; token: string } | null
  marks: boolean
  /** Place lines in the printed sheet's slots when the engine gives no box (demo). */
  slots?: boolean
}>()

const sheet = computed(() => sheetRect(props.vw, props.vh))
const desk = computed(() => deskRect(props.vw, props.vh, sheet.value))
const stroke = computed(() => props.vh * 0.006)

// Only the lines on the current sheet (line 7 starts a fresh sheet).
const onSheet = computed(() => {
  const last = props.parts[props.parts.length - 1]
  if (!last) return []
  const page = Math.floor((last.id - 1) / SLOTS)
  return props.parts
    .filter((p) => Math.floor((p.id - 1) / SLOTS) === page && (p.box || props.slots !== false))
    .map((p) => ({ p, r: p.box ? { x: p.box[0] * props.vw, y: p.box[1] * props.vh, w: p.box[2] * props.vw, h: p.box[3] * props.vh } : slotRect(sheet.value, p.id) }))
})

const panel = computed(() => {
  if (props.answer && props.question) {
    return props.answer.visual
      ? { key: `a${props.question.text}`, visual: props.answer.visual, title: `« ${props.question.text} »`, titleLang: props.question.lang, caption: props.answer.text, captionLang: props.answer.lang, step: 0, steps: 1, partId: props.question.pointedAt?.partId ?? null }
      : null
  }
  if (!props.teaching) return null
  return {
    key: `t${props.teaching.partId}-${props.teaching.iteration}`,
    visual: props.teaching.visual,
    title: props.teaching.title,
    titleLang: props.teaching.titleLang,
    caption: props.teaching.steps[props.step] ?? '',
    captionLang: undefined,
    step: props.step,
    steps: props.teaching.steps.length,
    partId: props.teaching.partId,
  }
})

const roomOnDesk = computed(() => desk.value.w > props.vw * 0.14)

const arrow = computed(() => {
  const target = onSheet.value.find((s) => s.p.id === panel.value?.partId)
  if (!panel.value || !target || !roomOnDesk.value) return null
  const sx = target.r.x + target.r.w + props.vw * 0.008
  const sy = target.r.y + target.r.h / 2
  const ex = desk.value.x - props.vw * 0.006
  const ey = desk.value.y + desk.value.h * 0.32
  const c = (ex - sx) * 0.6
  return { line: `M${sx} ${sy} C${sx + c} ${sy}, ${ex - c} ${ey}, ${ex} ${ey}`, head: `M${ex - props.vw * 0.012} ${ey - props.vh * 0.018} L${ex} ${ey} L${ex - props.vw * 0.012} ${ey + props.vh * 0.018}` }
})
</script>

<template>
  <svg class="pointer-events-none absolute inset-0 size-full" :viewBox="`0 0 ${vw} ${vh}`" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <filter id="ar-glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur :stdDeviation="vh * 0.004" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
    </defs>


    <!-- each line on the sheet -->
    <template v-if="marks">
      <g v-for="{ p, r } in onSheet" :key="p.id">
        <template v-if="p.verdict === 'reading'">
          <rect :x="r.x" :y="r.y" :width="r.w" :height="r.h" :rx="r.h * 0.18" fill="#3FE0D0" fill-opacity="0.14" stroke="#3FE0D0" :stroke-width="stroke" :stroke-dasharray="`${stroke * 4} ${stroke * 3}`" />
          <rect :x="r.x" :y="r.y" :width="r.w * 0.06" :height="r.h" fill="#3FE0D0" fill-opacity="0.55" filter="url(#ar-glow)" :style="{ animation: 'ar-sweep 1s ease-in-out infinite alternate', '--sweep': `${r.w * 0.94}px` }" />
        </template>
        <path
          v-else-if="p.verdict === 'correct'"
          class="draw"
          pathLength="1"
          :d="`M${r.x + r.w - r.h * 1.05} ${r.y + r.h * 0.55} l${r.h * 0.25} ${r.h * 0.25} l${r.h * 0.5} ${-r.h * 0.55}`"
          fill="none"
          stroke="#2BD47D"
          :stroke-width="stroke * 1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
          filter="url(#ar-glow)"
        />
        <ellipse
          v-else-if="p.verdict === 'wrong'"
          class="draw"
          pathLength="1"
          :cx="r.x + r.w * 0.45"
          :cy="r.y + r.h * 0.5"
          :rx="r.w * 0.52"
          :ry="r.h * 0.64"
          :transform="`rotate(-2 ${r.x + r.w * 0.45} ${r.y + r.h / 2})`"
          fill="none"
          stroke="#FF7A2F"
          :stroke-width="stroke * 1.4"
          filter="url(#ar-glow)"
        />
        <g v-else>
          <rect :x="r.x" :y="r.y" :width="r.w" :height="r.h" :rx="r.h * 0.18" fill="none" stroke="#FFC93C" :stroke-width="stroke" :stroke-dasharray="`${stroke * 4} ${stroke * 3}`" />
          <text :x="r.x + r.w - r.h * 0.5" :y="r.y + r.h * 0.75" fill="#FFC93C" :font-size="r.h * 0.8" font-weight="900" class="font-sans">?</text>
        </g>
        <circle v-if="p.id === selectedId && p.verdict !== 'reading'" :cx="r.x - sheet.w * 0.03" :cy="r.y + r.h / 2" :r="r.h * 0.12" fill="#ffffff" />
      </g>
    </template>

    <!-- the line the child is pointing at -->
    <template v-for="{ p, r } in onSheet" :key="`pt${p.id}`">
      <rect
        v-if="pointing?.partId === p.id"
        :x="r.x - r.h * 0.15"
        :y="r.y - r.h * 0.15"
        :width="r.w + r.h * 0.3"
        :height="r.h * 1.3"
        :rx="r.h * 0.3"
        fill="#1F5FD6"
        fill-opacity="0.12"
        stroke="#7EA6FF"
        :stroke-width="stroke * 1.2"
        :style="{ transformBox: 'fill-box', transformOrigin: 'center', animation: 'pop 500ms both' }"
      />
    </template>

    <!-- from the line to the drawing on the desk -->
    <g v-if="arrow" :key="panel?.key" fill="none" stroke="#ffffff" :stroke-width="stroke * 1.1" stroke-linecap="round" stroke-linejoin="round" filter="url(#ar-glow)">
      <path class="draw" pathLength="1" style="--dur: 0.7s" :d="arrow.line" />
      <path class="draw" pathLength="1" style="--dur: 0.25s; --delay: 0.6s" :d="arrow.head" />
    </g>
  </svg>

  <div
    v-if="panel && roomOnDesk"
    :key="panel.key"
    class="absolute"
    :style="{ left: pct(desk.x, vw), top: pct(desk.y, vh), width: pct(desk.w, vw), height: pct(desk.h, vh), containerType: 'inline-size' }"
  >
    <ArTeaching :visual="panel.visual" :title="panel.title" :title-lang="panel.titleLang" :caption="panel.caption" :caption-lang="panel.captionLang" :step="panel.step" :steps="panel.steps" />
  </div>
</template>

<style>
@keyframes ar-sweep {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(var(--sweep));
  }
}
</style>
