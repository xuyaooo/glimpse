<script setup lang="ts">
// The reasoning for the selected exercise, redrawn by hand: the line, the mistake circled,
// the picture that explains it, then a sticky note with the fix. Plays itself step by step.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import Confetti from './Confetti.vue'
import HandMath from './HandMath.vue'
import HandVisual from './HandVisual.vue'
import Mascot from './Mascot.vue'
import { STYLE_LABEL } from '@/lib/mock'
import { speak } from '@/lib/speech'
import { prefersReducedMotion } from '@/lib/ui'
import type { Hint, Teaching, WrittenPart } from '@/lib/types'

const props = defineProps<{ part: WrittenPart | null; teaching: Teaching | null; hint: Hint | null; step: number }>()
const emit = defineEmits<{ 'update:step': [n: number]; openCamera: [] }>()

const replayKey = ref(0)
const cheer = ref(0)
const last = computed(() => (props.teaching ? props.teaching.steps.length - 1 : 0))
let timers: number[] = []

function clear() {
  timers.forEach(clearTimeout)
  timers = []
}

function play() {
  clear()
  if (prefersReducedMotion()) return emit('update:step', last.value)
  emit('update:step', 0)
  for (let i = 1; i <= last.value; i++) timers.push(window.setTimeout(() => emit('update:step', i), 1900 * i))
}

function replay() {
  replayKey.value++
  play()
}

watch(
  () => `${props.part?.id}-${props.part?.verdict}-${props.teaching?.iteration}`,
  () => {
    play()
    if (props.part?.verdict === 'correct') timers.push(window.setTimeout(() => cheer.value++, 1300))
  },
  { immediate: true },
)
onBeforeUnmount(clear)

const sticky = computed(() => {
  const p = props.part
  if (!p) return ''
  if (p.verdict === 'correct') return 'Right! Nice work.'
  if (p.verdict === 'unsure') return 'Is this what you wrote? Check it in the camera window.'
  if (p.verdict === 'wrong' && props.teaching) return props.teaching.steps[last.value]
  if (p.verdict === 'wrong') return "Let's look at this one together."
  return ''
})
const showSticky = computed(() => !!sticky.value && (props.part?.verdict !== 'wrong' || !props.teaching || props.step >= last.value))
</script>

<template>
  <section aria-label="Whiteboard" class="relative flex min-w-0 flex-col gap-3 rounded-[22px] border border-line bg-white p-3 shadow-[0_12px_30px_-24px_rgb(24_41_74/0.5)]">
    <div role="toolbar" aria-label="Whiteboard controls" class="flex flex-wrap items-center gap-1 rounded-2xl bg-line-2 p-1.5">
      <button type="button" title="Draw it again" aria-label="Draw it again" class="flex size-10 items-center justify-center rounded-xl bg-white text-marker shadow-sm transition-transform hover:-translate-y-0.5 active:scale-95 disabled:opacity-40" :disabled="!part" @click="replay">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.9 3.3a2 2 0 0 1 2.8 0l1 1a2 2 0 0 1 0 2.8L9.4 18.4 4 20l1.6-5.4z" /></svg>
      </button>
      <button type="button" title="Step back" aria-label="Step back" class="flex size-10 items-center justify-center rounded-xl text-ink-2 transition hover:bg-white active:scale-95 disabled:opacity-35" :disabled="!teaching || step <= 0" @click="emit('update:step', step - 1)">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></svg>
      </button>
      <button type="button" title="Next step" aria-label="Next step" class="flex size-10 items-center justify-center rounded-xl text-ink-2 transition hover:bg-white active:scale-95 disabled:opacity-35" :disabled="!teaching || step >= last" @click="emit('update:step', step + 1)">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 14l5-5-5-5" /><path d="M20 9H9a5 5 0 0 0 0 10h3" /></svg>
      </button>
      <button type="button" title="Hear it" aria-label="Hear it" class="flex size-10 items-center justify-center rounded-xl text-ink-2 transition hover:bg-white active:scale-95 disabled:opacity-35" :disabled="!hint" @click="hint && speak(hint.text, hint.lang)">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5L6 9H3v6h3l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /></svg>
      </button>
      <span v-if="teaching && part?.verdict === 'wrong'" class="ml-auto rounded-full bg-white px-3 py-1 text-[13px] font-black text-lagoon">{{ STYLE_LABEL[teaching.style] }}, try {{ teaching.iteration }}</span>
    </div>

    <div class="bg-board relative flex min-h-[380px] flex-1 flex-col items-center justify-start gap-4 overflow-hidden rounded-2xl px-4 pb-6 pt-7">
      <template v-if="!part">
        <div class="m-auto flex max-w-[320px] flex-col items-center gap-3 text-center">
          <Mascot :size="96" />
          <p class="font-marker text-[30px] font-bold leading-tight text-marker">Your reasoning shows up here</p>
          <p class="text-[15px] font-semibold text-ink-2">Open the camera, write a line on your paper and lift your pencil.</p>
          <button type="button" class="btn-lagoon mt-1 rounded-2xl px-5 py-3 text-[15px] font-black" @click="emit('openCamera')">Open camera</button>
        </div>
      </template>

      <template v-else-if="part.verdict === 'reading'">
        <div class="m-auto flex w-full max-w-[360px] flex-col items-center gap-3">
          <span class="shimmer h-12 w-full rounded-xl" />
          <span class="shimmer h-5 w-2/3 rounded-lg" />
          <span class="font-marker text-2xl font-bold text-marker">Reading your line…</span>
        </div>
      </template>

      <div v-else :key="`${part.id}-${replayKey}-${teaching?.iteration ?? 0}`" class="flex w-full flex-col items-center gap-5">
        <div class="relative">
          <HandMath :latex="part.latex" :size="50" :mark="part.verdict === 'wrong' ? 'wrong' : part.verdict === 'correct' ? 'correct' : null" />
          <svg class="absolute -bottom-3 left-0 h-3 w-full overflow-visible" viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true">
            <path class="draw" pathLength="1" style="--dur: 0.6s; --delay: 0.85s" d="M2 6 C40 2 70 10 110 6 S170 3 198 7" fill="none" stroke="#1F5FD6" stroke-width="3" stroke-linecap="round" vector-effect="non-scaling-stroke" />
          </svg>
          <Confetti :burst="cheer" />
        </div>

        <Transition name="fade">
          <div v-if="teaching && part.verdict === 'wrong' && step >= 1" class="flex w-full justify-center">
            <HandVisual :visual="teaching.visual" />
          </div>
        </Transition>

        <p
          v-if="teaching && part.verdict === 'wrong' && step < last"
          :key="`cap${step}`"
          class="write-on max-w-[480px] text-center font-marker text-[26px] font-bold leading-snug text-ink"
          style="--dur: 1.1s; --delay: 0.3s"
        >{{ teaching.steps[step] }}</p>
      </div>

      <Transition name="fade">
        <div v-if="part && part.verdict !== 'reading' && showSticky" :key="`n${part.id}-${replayKey}`" class="pointer-events-none flex w-full justify-end md:absolute md:bottom-5 md:right-5 md:w-auto">
          <svg class="mr-2 hidden h-16 w-20 self-start md:block" viewBox="0 0 80 64" aria-hidden="true">
            <path class="draw" pathLength="1" style="--dur: 0.6s" d="M6 8 C20 40 40 50 70 46" fill="none" stroke="#1F5FD6" stroke-width="3" stroke-linecap="round" />
            <path class="draw" pathLength="1" style="--dur: 0.3s; --delay: 0.5s" d="M60 38 L71 46 L59 54" fill="none" stroke="#1F5FD6" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <p
            class="m-0 max-w-[220px] rounded-md px-4 py-3 font-marker text-[23px] font-bold leading-tight text-ink shadow-[0_12px_20px_-12px_rgb(120_90_0/0.55)]"
            :class="part.verdict === 'correct' ? 'bg-[#c9f2d9]' : 'bg-note'"
            style="animation: pop 500ms cubic-bezier(0.3, 1.6, 0.5, 1) both, wiggle 4s ease-in-out 600ms infinite"
          >{{ sticky }}</p>
        </div>
      </Transition>
    </div>

    <div class="flex items-start gap-3 rounded-2xl bg-marker-soft px-4 py-3">
      <svg class="mt-0.5 shrink-0" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" :style="hint ? { filter: 'drop-shadow(0 0 6px rgb(255 201 60 / 0.9))' } : undefined">
        <path d="M12 2a7 7 0 0 0-4 12.7V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.3A7 7 0 0 0 12 2z" fill="#FFC93C" />
        <path d="M9 20h6v1a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z" fill="#5b6b84" />
      </svg>
      <p class="min-w-0 text-[15px] leading-snug text-ink">
        <b class="text-marker">Tip:</b>
        <template v-if="hint"> <span :lang="hint.lang">{{ hint.text }}</span><span v-if="hint.translation" lang="en" class="block text-[13px] text-ink-2">{{ hint.translation }}</span></template>
        <template v-else> Lift your pencil after each line. Glimpse checks it and explains it here.</template>
      </p>
    </div>
  </section>
</template>
