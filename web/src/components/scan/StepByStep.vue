<script setup lang="ts">
import { titleTex, wordsOnly } from '@/lib/latex'
import { sceneIcon, sceneLabel } from '@/lib/sceneKinds'
// The solution beside the camera, made for learning, not copying. It opens on "Try it yourself":
// hints one at a time (a nudge first, almost the next step last), then the steps one by one if
// the student wants them. The answer stays hidden until they ask for it or have seen every step;
// "Show the whole solution" opens everything at once: the whole process, with the animation's
// steps in time with the video on the camera.
import { computed, ref, watch } from 'vue'
import MathTex from '../MathTex.vue'
import SceneStage from '../scenes/SceneStage.vue'
import { go, player, start } from '@/lib/player'
import { speak, speakAuto } from '@/lib/speech'
import type { WorkedSteps } from '@/lib/types'

const props = defineProps<{ steps: WorkedSteps }>()

const hintsShown = ref(0)
const stepsShown = ref(0)
const answerShown = ref(false)
const whole = ref(false)
watch(
  () => props.steps.at,
  () => {
    hintsShown.value = 0
    stepsShown.value = 0
    answerShown.value = false
    whole.value = false
  },
)
const total = computed(() => props.steps.items.length)
// the tutor's hints, or (an older solution without any) what the first step says to do
const hints = computed(() => (props.steps.hints?.length ? props.steps.hints : props.steps.items[0]?.say ? [props.steps.items[0].say] : []))
// every step seen (and no more coming): the answer opens
const allSteps = computed(() => total.value > 0 && stepsShown.value >= total.value && !props.steps.writing)
// the steps on show: all of them, as they arrive, once the whole solution is asked for
const visible = computed(() => (whole.value ? total.value : Math.min(stepsShown.value, total.value)))
const answerTex = computed(() => props.steps.result || props.steps.scene?.resultTex || '')
const answerVisible = computed(() => answerShown.value || whole.value || allSteps.value)
// the whole process is out: every step (or the animation, for a solution without written steps)
const finished = computed(() => whole.value || allSteps.value)

// the video on the camera is this solution's animation
const linked = computed(() => player.steps?.at === props.steps.at && (player.mode === 'dock' || player.mode === 'full'))
// while it is on the camera, the animation as the player shows it (it keeps its steps until played again)
const scene = computed(() => (linked.value ? player.steps?.scene : undefined) ?? props.steps.scene)
// its steps (they end with the answer) show while the student watches it, or once everything is open
const timeline = computed(() => linked.value || finished.value)

function hint() {
  if (hintsShown.value >= hints.value.length) return
  hintsShown.value++
  speakAuto(hints.value[hintsShown.value - 1], props.steps.lang)
}
function nextStep() {
  if (stepsShown.value >= total.value) return
  stepsShown.value++
  speakAuto(props.steps.items[stepsShown.value - 1].say, props.steps.lang)
}
function showWhole() {
  whole.value = true
  stepsShown.value = total.value
  hintsShown.value = hints.value.length
}
// the hints that came in while the whole solution was open are shown too
watch(
  () => hints.value.length,
  (n) => whole.value && (hintsShown.value = n),
)
function playFrom(i: number) {
  if (player.steps?.at !== props.steps.at || !player.mode || player.mode === 'poster') {
    player.steps = props.steps
    player.mode = 'dock'
  }
  if (i === 0) start(props.steps, player.mode === 'full' ? 'full' : 'dock')
  else go(i)
}
</script>

<template>
  <section aria-label="Let's solve it" class="flex flex-col gap-4 rounded-[24px] bg-white p-5 shadow-[0_14px_30px_-22px_rgb(24_41_74/0.5)]" style="animation: rise 500ms both">
    <div>
      <p class="text-[12px] font-black uppercase tracking-[0.16em] text-lagoon">Let's solve it</p>
      <p v-if="wordsOnly(steps.about)" class="mt-0.5 text-[19px] font-black leading-snug">{{ wordsOnly(steps.about) }}</p>
      <MathTex v-else-if="steps.about" :latex="titleTex(steps.about)" class="mt-0.5 block overflow-x-auto text-[24px]" />
    </div>

    <!-- 1. try it yourself: hints first, then a step at a time -->
    <div v-if="!finished" class="flex flex-col gap-3 rounded-2xl bg-lagoon-mist p-4">
      <div class="flex items-start gap-2.5">
        <span class="text-[22px]" aria-hidden="true">🧠</span>
        <div>
          <p class="text-[16px] font-black text-lagoon-deep">Try it yourself first</p>
          <p class="text-[13px] font-semibold text-ink-2">Stuck? Take a hint, then a step. The answer stays hidden until you want it.</p>
        </div>
      </div>
      <TransitionGroup v-if="hintsShown" tag="ol" name="list" class="m-0 flex list-none flex-col gap-2 p-0">
        <li v-for="(h, i) in hints.slice(0, hintsShown)" :key="`${steps.at}-h${i}`" class="flex items-start gap-2.5 rounded-xl bg-white px-3 py-2.5 shadow-sm">
          <span class="flex size-7 shrink-0 items-center justify-center rounded-full bg-sun text-[13px]" aria-hidden="true">💡</span>
          <p :lang="steps.lang" class="min-w-0 flex-1 text-[15px] font-semibold leading-snug"><span class="font-black text-[#8a5a00]">Hint {{ i + 1 }}: </span>{{ h }}</p>
          <button type="button" aria-label="Hear this hint" title="Hear this hint" class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-lagoon-mist text-lagoon" @click="speak(h, steps.lang)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5L6 9H3v6h3l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /></svg>
          </button>
        </li>
      </TransitionGroup>
      <div class="flex flex-wrap items-center gap-2">
        <button v-if="hintsShown < hints.length" type="button" class="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-sun px-3.5 text-[14px] font-black text-ink shadow-sm transition hover:-translate-y-0.5" @click="hint">
          💡 {{ hintsShown ? 'Another hint' : 'Give me a hint' }}
          <span class="rounded-full bg-white/60 px-1.5 text-[12px] tabular-nums">{{ hints.length - hintsShown }} left</span>
        </button>
        <button v-if="total && stepsShown < total" type="button" class="min-h-10 rounded-xl border-2 border-lagoon-soft bg-white px-3.5 text-[14px] font-black text-lagoon-deep transition hover:-translate-y-0.5" @click="nextStep">
          {{ stepsShown ? 'Show the next step' : 'Show the first step' }}
        </button>
        <span v-else-if="steps.writing && hints.length" class="inline-flex min-h-10 items-center gap-2 px-1 text-[13px] font-bold text-ink-2"><span class="size-3.5 animate-spin rounded-full border-2 border-lagoon-soft border-t-lagoon" aria-hidden="true" /> {{ total ? 'Writing the next step…' : 'Writing the steps…' }}</span>
        <button type="button" class="min-h-10 rounded-xl px-3 text-[13px] font-bold text-ink-2 underline-offset-4 hover:underline" @click="showWhole">Show the whole solution</button>
      </div>
    </div>

    <!-- 2. the steps the student opened: all of them, the whole process, at the end -->
    <div v-if="visible" class="flex flex-col gap-2">
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-[15px] font-black">{{ finished ? 'The whole process' : 'Steps so far' }}</h3>
        <span class="rounded-full bg-line-2 px-2.5 py-0.5 text-[12px] font-black tabular-nums text-ink-2">{{ visible }} / {{ total }}{{ steps.writing ? '…' : '' }}</span>
      </div>
      <TransitionGroup tag="ol" name="list" class="m-0 flex list-none flex-col gap-2 p-0">
        <li v-for="(st, i) in steps.items.slice(0, visible)" :key="`${steps.at}-${i}`" class="flex items-start gap-3 rounded-2xl bg-lagoon-mist/70 px-3 py-2.5">
          <span class="flex size-7 shrink-0 items-center justify-center rounded-full bg-lagoon text-[12px] font-black text-white">{{ i + 1 }}</span>
          <div class="min-w-0 flex-1">
            <p :lang="steps.lang" class="text-[14px] font-semibold leading-snug">{{ st.say }}</p>
            <MathTex v-if="st.math" :latex="st.math" class="mt-1 block overflow-x-auto text-[19px]" />
          </div>
          <button type="button" aria-label="Hear this step" title="Hear this step" class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white text-lagoon shadow-sm" @click="speak(st.say, steps.lang)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5L6 9H3v6h3l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /></svg>
          </button>
        </li>
      </TransitionGroup>
    </div>
    <p v-if="steps.writing && !hints.length && !total" class="flex items-center gap-2 text-[13px] font-bold text-ink-2"><span class="size-4 animate-spin rounded-full border-2 border-lagoon-soft border-t-lagoon" aria-hidden="true" /> Glim is thinking of a first hint…</p>
    <p v-else-if="whole && steps.writing" class="flex items-center gap-2 text-[13px] font-bold text-ink-2"><span class="size-4 animate-spin rounded-full border-2 border-lagoon-soft border-t-lagoon" aria-hidden="true" /> Glim is still writing the steps…</p>

    <!-- 3. the answer: hidden until asked for, or once every step is out -->
    <template v-if="answerTex">
      <div v-if="answerVisible" class="flex flex-wrap items-center gap-3 rounded-2xl bg-right-bg px-4 py-3" style="animation: pop 450ms cubic-bezier(0.3, 1.6, 0.5, 1) both">
        <span class="text-[14px] font-black text-lagoon-deep">Answer</span>
        <MathTex :latex="answerTex" class="text-[24px]" />
      </div>
      <button v-else type="button" class="flex items-center gap-3 rounded-2xl border-2 border-dashed border-line px-4 py-3 text-left transition hover:border-lagoon-soft hover:bg-lagoon-mist/40" @click="answerShown = true">
        <span class="text-[18px]" aria-hidden="true">🔒</span>
        <span class="min-w-0 flex-1"><span class="block text-[14px] font-black">The answer is hidden</span><span class="text-[12px] font-semibold text-ink-2">Work yours out first, then tap to check it.</span></span>
        <span class="shrink-0 rounded-lg bg-line-2 px-2.5 py-1 text-[12px] font-black text-ink-2">Show the answer</span>
      </button>
    </template>

    <!-- 4. the animation: plays on the camera (its first frame here, so it gives nothing away) -->
    <template v-if="scene">
      <button type="button" class="group relative block w-full overflow-hidden rounded-[20px] text-left ring-1 ring-line transition hover:shadow-lg" :aria-label="`Watch how it's solved: ${sceneLabel(scene.kind)}`" @click="playFrom(0)">
        <SceneStage :scene="scene" :stage="linked ? player.stage : 0" />
        <span v-if="!linked || !player.playing" class="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-[#0b1d28]/60 to-transparent transition group-hover:from-[#0b1d28]/40">
          <span class="flex items-center gap-2 rounded-full bg-tangerine py-2 pl-2 pr-4 text-[15px] font-black text-white shadow-xl transition group-hover:scale-105">
            <span class="flex size-8 items-center justify-center rounded-full bg-white text-tangerine"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg></span>
            Watch how · {{ sceneIcon(scene.kind) }} {{ sceneLabel(scene.kind) }}
          </span>
        </span>
        <span v-else class="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-[#0b1d28]/70 px-2.5 py-1 text-[12px] font-black text-white backdrop-blur"><span class="size-2 animate-pulse rounded-full bg-[#ff4d4d]" /> Playing on the camera</span>
      </button>

      <!-- its steps, in time with the video -->
      <ol v-if="timeline" class="m-0 flex list-none flex-col p-0">
        <li v-for="(st, i) in scene.stages" :key="i" class="relative">
          <span v-if="i < scene.stages.length - 1" class="absolute left-[15px] top-9 bottom-0 w-[3px] rounded-full transition-colors duration-500" :class="linked && i < player.stage ? 'bg-lagoon' : 'bg-line'" aria-hidden="true" />
          <button type="button" class="group flex w-full items-start gap-3 rounded-2xl p-1.5 pb-3 text-left transition-all duration-500" :class="linked && i === player.stage ? 'bg-lagoon-mist' : 'hover:bg-line-2/70'" :aria-current="linked && i === player.stage ? 'step' : undefined" title="Play from here" @click="playFrom(i)">
            <span class="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full text-[13px] font-black transition-all duration-500" :class="linked && (i < player.stage || player.finished) ? 'bg-lagoon text-white' : linked && i === player.stage ? 'scale-110 bg-tangerine text-white shadow-md' : 'bg-line-2 text-ink-2 group-hover:bg-tangerine group-hover:text-white'">{{ i + 1 }}</span>
            <span class="min-w-0 pt-1">
              <span class="block text-[14px] font-bold leading-snug">{{ st.caption }}</span>
              <MathTex v-if="st.math" :latex="String(st.math)" class="mt-1 block overflow-x-auto text-[19px]" />
            </span>
          </button>
        </li>
      </ol>
    </template>

    <!-- 5. everything out: what to do next -->
    <p v-if="finished" class="flex items-center gap-2 rounded-2xl bg-[#fff8e6] px-4 py-3 text-[14px] font-bold" style="animation: rise 400ms both">
      <span aria-hidden="true">🌟</span> Now try a similar one on your paper, without looking, and let Glim check it.
    </p>
  </section>
</template>
