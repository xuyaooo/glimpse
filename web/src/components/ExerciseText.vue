<script setup lang="ts">
// An exercise as it should be read: a worded one ("How long does it take to drive 150 km at
// 60 km/h?") as text that wraps, maths as a formula that breaks after = + − when it is long.
// lines: at most that many lines (a long exercise in a list or on a card), with "Show all" to
// open it when it doesn't fit (more: false where a link can't go, e.g. inside a button: the
// whole exercise is then in its tooltip).
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import MathTex from './MathTex.vue'
import { titleTex, wordsOnly } from '@/lib/latex'

const props = withDefaults(
  defineProps<{
    latex: string | null | undefined
    /** Classes for a formula (its size). */
    math?: string
    /** Classes for words (their size, weight). */
    words?: string
    /** At most this many lines, then "Show all". */
    lines?: number
    more?: boolean
  }>(),
  { math: undefined, words: undefined, lines: undefined, more: true },
)
const text = computed(() => wordsOnly(props.latex))
const tex = computed(() => titleTex(props.latex))
const open = ref(false)
const box = ref<HTMLElement | null>(null)
const clipped = ref(false)
// only when it really goes past its lines does "Show all" appear: a fraction or an integral
// stands a few pixels above and below its line, so only a hidden line (half of one or more) counts
function measure() {
  const el = box.value
  if (!el || !props.lines || open.value) return void (clipped.value = false)
  const style = getComputedStyle(el)
  const line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.4 || 20
  clipped.value = el.scrollHeight - el.clientHeight > line / 2
}
let ro: ResizeObserver | undefined
onMounted(() => {
  measure()
  if (typeof ResizeObserver !== 'undefined' && box.value) {
    ro = new ResizeObserver(measure)
    ro.observe(box.value)
  }
})
onBeforeUnmount(() => ro?.disconnect())
// another exercise starts closed; either way, measured again once drawn
watch(
  () => props.latex,
  () => (open.value = false),
)
watch(
  () => [props.latex, open.value],
  () => nextTick(measure),
)
const clamp = computed(() => (props.lines && !open.value ? { display: '-webkit-box', WebkitBoxOrient: 'vertical' as const, WebkitLineClamp: String(props.lines), overflow: 'hidden' } : {}))
</script>

<template>
  <span class="block min-w-0">
    <span
      ref="box"
      class="block min-w-0 break-words"
      :class="[text ? `${words ?? 'text-[17px] font-bold'} leading-snug` : math, !lines || open ? 'overflow-x-auto' : '']"
      :style="clamp"
      :title="clipped && !more ? text || undefined : undefined"
    >
      <template v-if="text">{{ text }}</template>
      <MathTex v-else :latex="tex" wrap />
    </span>
    <button v-if="more && lines && (clipped || open)" type="button" class="mt-0.5 text-[12px] font-black text-lagoon-deep underline-offset-2 hover:underline" @click.stop="open = !open">{{ open ? 'Show less' : 'Show all' }}</button>
  </span>
</template>
