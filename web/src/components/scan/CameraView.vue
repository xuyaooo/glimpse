<script setup lang="ts">
import { titleTex } from '@/lib/latex'
// The left half of the scan window: the live camera, with the tutor drawing on top of it.
import { computed, ref, watch } from 'vue'
import ArLayer from './ArLayer.vue'
import HandOverlay from './HandOverlay.vue'
import Mascot from '../Mascot.vue'
import MathTex from '../MathTex.vue'
import PaperSheet from '../PaperSheet.vue'
import { dismissAnswer, state as engine } from '@/lib/engine'
import { listenStatus } from '@/lib/listen'
import { player } from '@/lib/player'
import SceneVideo from '../scenes/SceneVideo.vue'
import type { Pt } from '@/lib/hands'
import type { CameraStatus } from '@/lib/camera'
import { sheetRect } from '@/lib/geometry'
import { useElementWidth } from '@/lib/useElementWidth'
import type { Answer, EngineState, Question, Teaching, WrittenPart } from '@/lib/types'

const props = defineProps<{
  stream: MediaStream | null
  camera: CameraStatus
  message: string
  paper: boolean
  rotated: boolean
  parts: WrittenPart[]
  selectedId: number | null
  teaching: Teaching | null
  step: number
  question: Question | null
  answer: Answer | null
  asking: boolean
  status: EngineState
  flash: number
  moving: boolean
  autoRead: boolean
  name: string
  crops: Record<number, string>
  hands?: Pt[][]
  tip?: Pt | null
  dwell?: number
  handStatus?: 'off' | 'loading' | 'on' | 'error'
}>()
const emit = defineEmits<{ video: [el: HTMLVideoElement]; retry: []; usePaper: []; select: [id: number] }>()

// the animation's video card sits on the camera; the speech bubbles make room for it
const docked = computed(() => player.mode === 'poster' || player.mode === 'dock')

const captured = computed(() => props.parts.filter((p) => props.crops[p.id]))
const RING = { correct: 'ring-right-mark', wrong: 'ring-wrong-mark', reading: 'ring-lagoon-bright', unsure: 'ring-[#e0a21a]' }
const BADGE = { correct: 'bg-right-mark', wrong: 'bg-wrong-mark', reading: 'bg-lagoon-bright', unsure: 'bg-[#e0a21a]' }

const video = ref<HTMLVideoElement | null>(null)
const stage = ref<HTMLElement | null>(null)
const vw = ref(1920)
const vh = ref(1080)
const stageWidth = useElementWidth(stage)

watch(
  [() => props.stream, video],
  ([s, v]) => {
    if (!v || v.srcObject === s) return
    v.srcObject = s
    if (s) v.play().catch(() => {})
  },
  { immediate: true },
)

function onMeta() {
  const v = video.value
  if (!v?.videoWidth) return
  vw.value = v.videoWidth
  vh.value = v.videoHeight
  emit('video', v)
}

const live = computed(() => !props.paper && props.camera === 'live')
// a question on the go: being said (status listening), then thought about
const listening = computed(() => props.asking || props.status === 'answering')
// Beside the docked card (54% of the picture, at least 300 px) a bubble can be narrow: Glim's face
// makes room for the words then. The bubbles never get taller than the picture: they scroll.
const narrow = computed(() => docked.value && stageWidth.value - Math.max(stageWidth.value * 0.54, 300) - 36 < 300)
// Glim's answer stays on the picture until "Got it" (unless it's drawn there as a scene)
const answered = computed(() => !listening.value && !!props.answer && !!props.question && !props.answer.visual)
const pointing = computed(() => (listening.value || props.answer ? (props.question?.pointedAt ?? null) : null))
const readingLine = computed(() => props.parts.find((p) => p.verdict === 'reading')?.id)

// The drawn demo paper, scaled to sit in the paper frame.
const paperBox = computed(() => {
  const sheet = sheetRect(vw.value, vh.value)
  const scale = (stageWidth.value * (sheet.h / vw.value)) / 507
  return { scale, left: (stageWidth.value - 380 * scale) / 2, top: stageWidth.value * (sheet.y / vw.value) }
})

const hint = computed(() => {
  if (!props.parts.length) return 'Put your paper under the camera, then write line 1'
  if (props.status === 'listening') return 'Listening: say your question'
  if (props.tip) return 'Pointing: hold still, then say your question'
  if (props.autoRead && live.value) return props.moving ? 'Writing…' : 'Stop writing and Glim asks what to check, or point to ask'
  return 'Press W or “Check my whole sheet” when you are done'
})
</script>

<template>
  <section aria-label="Live camera" class="relative flex size-full min-h-[340px] flex-col items-center justify-center gap-3 overflow-hidden rounded-[28px] p-3" style="background: radial-gradient(120% 100% at 50% 30%, #1f4d60 0%, #0b1d28 75%)">
    <div
      ref="stage"
      class="relative w-full shrink-0 overflow-hidden rounded-[20px] bg-[#0b1d28] shadow-[0_30px_60px_-30px_rgb(0_0_0/0.8)]"
      :style="{ aspectRatio: `${vw} / ${vh}`, maxWidth: `calc((100vh - ${captured.length ? 300 : 200}px) * ${vw / vh})` }"
    >
      <video v-show="live" ref="video" muted playsinline autoplay class="absolute inset-0 size-full object-contain" :class="rotated ? 'rotate-180' : ''" @loadedmetadata="onMeta" />

      <div v-if="paper" class="absolute inset-0" style="background: radial-gradient(90% 80% at 50% 45%, #5d4936 0%, #3b2e22 100%)">
        <div class="absolute origin-top-left" :style="{ left: `${paperBox.left}px`, top: `${paperBox.top}px`, transform: `scale(${paperBox.scale})` }">
          <PaperSheet :parts="parts" :pointing="pointing" :name="name" />
        </div>
      </div>

      <ArLayer
        v-if="live || paper"
        :vw="vw"
        :vh="vh"
        :parts="parts"
        :selected-id="selectedId"
        :teaching="teaching"
        :step="step"
        :question="question"
        :answer="answer"
        :pointing="pointing"
        :marks="!paper"
        :slots="paper || engine.connection !== 'live'"
      />

      <HandOverlay v-if="live && hands" :vw="vw" :vh="vh" :hands="hands" :tip="tip ?? null" :dwell="dwell ?? 0" :asking="asking" :listening="status === 'listening'" />

      <!-- what's happening, on the picture -->
      <div class="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-start justify-between gap-2">
        <span class="inline-flex items-center gap-2 rounded-full bg-[#0b1d28]/70 px-3.5 py-2 text-[13px] font-black text-white backdrop-blur">
          <span class="relative flex size-2.5">
            <span class="absolute inline-flex size-full animate-ping rounded-full opacity-70" :class="live ? 'bg-[#ff4d4d]' : 'bg-[#3fe0a0]'" />
            <span class="relative size-2.5 rounded-full" :class="live ? 'bg-[#ff4d4d]' : 'bg-[#3fe0a0]'" />
          </span>
          {{ live ? 'Live' : 'Demo paper' }}
          <span class="font-semibold text-white/80">{{ hint }}</span>
          <span v-if="live && handStatus === 'loading'" class="font-semibold text-white/60">· hand tracking starting…</span>
          <span v-else-if="live && handStatus === 'on'" class="font-semibold text-[#3fe0d0]">· {{ hands?.length ? `${hands.length} hand${hands.length > 1 ? 's' : ''}` : 'no hand' }}</span>
        </span>
        <Transition name="fade" mode="out-in">
          <span v-if="readingLine" key="r" class="rounded-full bg-[#3fe0d0] px-3.5 py-2 text-[13px] font-black text-[#0b1d28]">Reading line {{ readingLine }}</span>
          <span v-else-if="status === 'listening'" key="l" class="rounded-full bg-sun px-3.5 py-2 text-[13px] font-black text-ink">Listening</span>
          <span v-else-if="listening" key="t" class="rounded-full bg-violet px-3.5 py-2 text-[13px] font-black text-white">Thinking</span>
        </Transition>
      </div>

      <!-- the animation, as a video card on the camera -->
      <Transition name="dock">
        <div v-if="docked" class="absolute bottom-3 right-3 z-30 w-[54%] min-w-[300px] max-w-[680px]">
          <SceneVideo size="dock" />
        </div>
      </Transition>

      <!-- shutter flash when a line is captured -->
      <span v-if="flash" :key="flash" class="pointer-events-none absolute inset-0 bg-white" style="animation: shutter 420ms ease-out both" aria-hidden="true" />

      <Transition name="fade">
        <div v-if="listening" class="pointer-events-none absolute inset-y-3 left-3 z-20 flex items-end gap-3 transition-all duration-500" :style="{ right: docked ? 'calc(54% + 24px)' : '12px' }">
          <Mascot v-if="!narrow" :size="58" class="shrink-0" />
          <div class="pointer-events-auto relative max-h-full min-w-0 flex-1 overflow-y-auto rounded-3xl rounded-bl-md bg-white/95 px-5 py-3 shadow-xl backdrop-blur" aria-live="polite">
            <p :lang="question?.lang" class="text-[19px] font-black leading-snug">{{ question?.text && question.text !== '…' ? `« ${question.text} »` : status !== 'listening' ? (status === 'answering' ? 'Reading your paper…' : 'Listening') : listenStatus.phase === 'speaking' ? 'I’m listening…' : listenStatus.phase === 'writing' ? 'Writing down your question…' : 'I’m listening: what’s your question?' }}</p>
            <p v-if="question?.about" class="mt-0.5 flex flex-wrap items-center gap-2 text-[14px] font-semibold text-ink-2">About <MathTex :latex="titleTex(question.about)" class="text-[18px] text-ink" /></p>
            <p v-else class="mt-0.5 text-[14px] font-semibold text-ink-2">{{ question?.pointedAt ? `About line ${question.pointedAt.partId}${question.pointedAt.token ? `, the ${question.pointedAt.token}` : ''}` : status === 'answering' ? 'Glim is looking at the photo' : status === 'listening' ? (listenStatus.model === 'loading' ? `Getting my ears ready, the first time only: ${Math.round(listenStatus.progress * 100)}%` : 'Say it out loud. Stop talking and I’ll send it with the photo') : 'Point at your paper while you ask' }}</p>
            <!-- the sound of the voice while listening; while Glim thinks, a spinner -->
            <span v-if="asking && status === 'listening'" class="absolute right-5 top-4 flex h-6 items-end gap-1" aria-hidden="true">
              <span v-for="(h, i) in [8, 18, 24, 12, 20, 9]" :key="i" class="w-1 rounded-sm bg-tangerine transition-[height] duration-100" :style="{ height: `${4 + h * Math.min(1, listenStatus.level * (0.6 + ((i * 7) % 5) / 6))}px` }" />
            </span>
            <span v-else class="absolute right-5 top-4 size-5 animate-spin rounded-full border-[3px] border-violet-soft border-t-violet" aria-hidden="true" />
          </div>
        </div>
      </Transition>

      <Transition name="fade">
        <div v-if="answered" class="pointer-events-none absolute inset-y-3 left-3 z-20 flex items-end gap-3 transition-all duration-500" :style="{ right: docked ? 'calc(54% + 24px)' : '12px' }">
          <Mascot v-if="!narrow" :size="58" class="shrink-0" />
          <div class="pointer-events-auto relative flex max-h-full min-w-0 flex-1 flex-col rounded-3xl rounded-bl-md bg-white/95 shadow-xl backdrop-blur" aria-live="polite">
            <div class="min-h-0 overflow-y-auto px-5 py-3">
              <p v-if="question?.about" class="flex flex-wrap items-center gap-2 text-[13px] font-black text-violet">About <MathTex :latex="titleTex(question.about)" class="max-w-full overflow-x-auto text-[16px] text-ink" /></p>
              <p :lang="answer?.lang" class="text-[17px] font-bold leading-snug">{{ answer?.text }}</p>
              <p v-if="answer?.translation" lang="en" class="mt-0.5 text-[13px] text-ink-2">{{ answer.translation }}</p>
            </div>
            <button type="button" class="absolute -top-3 right-4 rounded-full bg-violet px-3 py-1 text-[13px] font-black text-white shadow" @click="dismissAnswer">Got it</button>
          </div>
        </div>
      </Transition>
    </div>

    <!-- every line the camera captured; pick one to see it again -->
    <TransitionGroup v-if="captured.length" tag="div" name="list" class="relative flex w-full shrink-0 gap-2.5 overflow-x-auto px-1 pb-1" :style="{ maxWidth: `calc((100vh - 300px) * ${vw / vh})` }" aria-label="Lines the camera captured">
      <button
        v-for="p in captured"
        :key="p.id"
        type="button"
        :aria-pressed="p.id === selectedId"
        class="relative shrink-0 overflow-hidden rounded-xl bg-white ring-2 transition-transform duration-300 hover:-translate-y-1"
        :class="[RING[p.verdict], p.id === selectedId ? 'ring-4' : '']"
        @click="emit('select', p.id)"
      >
        <img :src="crops[p.id]" :alt="`Line ${p.id}, as the camera saw it`" class="h-14 w-auto max-w-[260px] object-cover object-left" />
        <span class="absolute left-1 top-1 flex size-5 items-center justify-center rounded-full text-[11px] font-black text-white" :class="BADGE[p.verdict]">{{ p.id }}</span>
      </button>
    </TransitionGroup>

    <!-- no camera: say why and offer a way forward -->
    <div v-if="!paper && camera !== 'live'" class="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center text-white">
      <template v-if="camera === 'starting' || camera === 'idle'">
        <span class="size-12 animate-spin rounded-full border-4 border-white/25 border-t-[#3fe0d0]" aria-hidden="true" />
        <p class="text-lg font-black">Opening the camera…</p>
      </template>
      <template v-else>
        <Mascot :size="90" />
        <p class="max-w-[420px] text-xl font-black leading-snug">{{ message }}</p>
        <div class="flex flex-wrap justify-center gap-3">
          <button type="button" class="btn-lagoon min-h-12 rounded-2xl px-5 font-black" @click="emit('retry')">Try again</button>
          <!-- the drawn paper only works with the scripted demo tutor: a real one needs the camera -->
          <button v-if="engine.connection === 'demo'" type="button" class="min-h-12 rounded-2xl bg-white/15 px-5 font-black text-white ring-1 ring-white/30 transition hover:bg-white/25" @click="emit('usePaper')">Use the demo paper</button>
        </div>
      </template>
    </div>
  </section>
</template>

<style>
@keyframes shutter {
  from {
    opacity: 0.75;
  }
  to {
    opacity: 0;
  }
}
</style>
