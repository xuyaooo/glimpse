<script setup lang="ts">
import { titleTex } from '@/lib/latex'
import { sceneIcon, sceneLabel } from '@/lib/sceneKinds'
// An animation shown like a short video: a poster with a play button, a title card, the scene
// drifting gently like a camera, subtitles told by Glim, a progress bar with one segment per
// step, controls, and an end card with the answer. Used on the camera (dock) and full screen.
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import Confetti from '../Confetti.vue'
import Mascot from '../Mascot.vue'
import MathTex from '../MathTex.vue'
import SceneStage from './SceneStage.vue'
import { close, expand, go, player, shrink, start, stepMs, toggle, totalMs } from '@/lib/player'

const props = defineProps<{ size: 'dock' | 'full' }>()
const big = computed(() => props.size === 'full')
// the small card lives on the camera page: elsewhere, full screen only closes
const route = useRoute()
const onCamera = computed(() => route.name === 'scan')
const steps = computed(() => player.steps)
const scene = computed(() => steps.value?.scene ?? null)
const poster = computed(() => player.mode === 'poster')
const current = computed(() => scene.value?.stages[player.stage] ?? null)
const n = computed(() => scene.value?.stages.length ?? 0)
const duration = computed(() => {
  const s = Math.round(totalMs(steps.value) / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
})
// a slow drift, a different way at each step, like a camera
// the title card shows (1.5 s before step 1 is told) only when playing from the start, not on
// Back to step 1
const titled = ref(player.stage === 0)
watch(
  () => [player.run, player.stage] as const,
  ([run, stage], [oldRun]) => (titled.value = run !== oldRun && stage === 0),
)
const drift = computed(() => {
  const k = player.stage % 3
  return poster.value ? 'scale(1)' : ['scale(1.035) translate(-0.8%, -0.6%)', 'scale(1.02) translate(0.9%, 0.4%)', 'scale(1.045) translate(0, -0.9%)'][k]
})
</script>

<template>
  <div v-if="steps && scene" class="scene-video group/video relative isolate overflow-hidden bg-[#0b1d28] text-white shadow-[0_24px_60px_-20px_rgb(0_0_0/0.75)] ring-1 ring-white/15" :class="big ? 'rounded-[28px]' : 'rounded-[20px]'">
    <!-- the animation -->
    <div class="relative overflow-hidden">
    <div :style="{ transform: drift, transition: 'transform 7s ease-out' }">
      <SceneStage :key="`${steps.at}-${poster ? 'poster' : player.run}`" :scene="scene" :stage="poster ? n - 1 : player.stage" class="!rounded-none" />
    </div>
    <div class="pointer-events-none absolute inset-x-0 top-0 flex justify-center"><Confetti :burst="player.burst" /></div>

    <!-- poster: ready to play -->
    <button v-if="poster" type="button" class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-t from-[#0b1d28]/85 via-[#0b1d28]/35 to-[#0b1d28]/10 text-center" :aria-label="`Play: ${sceneLabel(scene.kind)}`" @click="start()">
      <span class="relative flex items-center justify-center" :class="big ? 'size-24' : 'size-16'">
        <span class="absolute inset-0 rounded-full bg-tangerine/60" style="animation: ping-soft 1.8s cubic-bezier(0, 0, 0.2, 1) infinite" />
        <span class="relative flex size-full items-center justify-center rounded-full bg-tangerine shadow-xl transition-transform duration-300 group-hover/video:scale-110">
          <svg :width="big ? 40 : 28" :height="big ? 40 : 28" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" /></svg>
        </span>
      </span>
      <span class="flex flex-col items-center gap-0.5 px-4">
        <span class="font-black leading-tight" :class="big ? 'text-[28px]' : 'text-[17px]'">{{ sceneIcon(scene.kind) }} {{ sceneLabel(scene.kind) }}</span>
        <span class="font-bold text-white/75" :class="big ? 'text-[16px]' : 'text-[12px]'">Glim shows you, step by step · {{ duration }}</span>
      </span>
    </button>

    <template v-else>
      <!-- title card -->
      <div :key="`title-${player.run}`" class="title-card pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#0b1d28]/80 backdrop-blur-sm">
        <span class="font-black uppercase tracking-[0.2em] text-[#3fe0d0]" :class="big ? 'text-[15px]' : 'text-[11px]'">{{ sceneIcon(scene.kind) }} {{ sceneLabel(scene.kind) }}</span>
        <MathTex v-if="steps.about" :latex="titleTex(steps.about)" class="max-w-[90%] overflow-hidden" :class="big ? 'text-[40px]' : 'text-[22px]'" />
      </div>

      <!-- end card -->
      <div v-if="player.finished" class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0b1d28]/70 backdrop-blur-[2px]" style="animation: rise 500ms both">
        <span class="font-black text-white/80" :class="big ? 'text-[16px]' : 'text-[12px]'">The answer</span>
        <span class="rounded-2xl bg-white text-ink shadow-xl" :class="big ? 'px-6 py-3' : 'px-4 py-2'" style="animation: pop 500ms cubic-bezier(0.3, 1.6, 0.5, 1) 0.2s both">
          <MathTex :latex="steps.result || scene.resultTex" :class="big ? 'text-[34px]' : 'text-[20px]'" />
        </span>
        <button type="button" class="flex items-center gap-2 rounded-full bg-tangerine font-black text-white shadow-lg transition hover:scale-105" :class="big ? 'px-6 py-3 text-[17px]' : 'px-4 py-2 text-[13px]'" @click="start()">
          <svg :width="big ? 20 : 15" :height="big ? 20 : 15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" /></svg>
          Watch again
        </button>
      </div>

    </template>

    <!-- top: what it is, full screen, close -->
    <div class="absolute inset-x-0 top-0 flex items-center gap-2 p-2.5 transition-opacity duration-300" :class="poster ? '' : 'opacity-0 group-hover/video:opacity-100 focus-within:opacity-100'">
      <span v-if="!poster" class="rounded-full bg-[#0b1d28]/70 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide backdrop-blur">{{ sceneLabel(scene.kind) }}</span>
      <span class="ml-auto flex gap-1.5">
        <button v-if="!big" type="button" aria-label="Watch it big" title="Watch it big" class="ctl" @click="poster ? start(undefined, 'full') : expand()"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg></button>
        <button v-else-if="onCamera" type="button" aria-label="Back to the camera" title="Back to the camera" class="ctl" @click="shrink()"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /></svg></button>
        <button type="button" aria-label="Close" title="Close" class="ctl" @click="close()"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
      </span>
    </div>
    </div>

    <!-- under the animation: progress, controls and Glim's subtitles -->
    <div v-if="!poster" class="relative bg-[#0b1d28]" :class="big ? 'px-5 pb-4 pt-3' : 'px-3 pb-2.5 pt-2'">
      <div class="mb-2 flex gap-1" aria-hidden="true">
        <span v-for="i in n" :key="i" class="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
          <span
            v-if="i - 1 <= player.stage"
            :key="`${player.run}-${player.stage}-${i}`"
            class="block h-full rounded-full bg-[#3fe0d0]"
            :style="i - 1 < player.stage || player.finished ? { width: '100%' } : { animation: `seg-fill ${stepMs(current?.caption ?? '') + (player.stage === 0 && titled ? 1500 : 0)}ms linear both`, animationPlayState: player.playing ? 'running' : 'paused' }"
          />
        </span>
      </div>
      <div class="flex items-center" :class="big ? 'gap-4' : 'gap-2.5'">
        <div class="flex shrink-0 items-center gap-1.5">
          <button type="button" aria-label="Back" class="ctl" :disabled="player.stage === 0" @click="go(player.stage - 1)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg></button>
          <button type="button" :aria-label="player.playing ? 'Pause' : player.finished ? 'Watch again' : 'Play'" class="ctl ctl-main" @click="toggle()">
            <svg v-if="player.playing" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            <svg v-else-if="player.finished" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" /></svg>
            <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
          </button>
          <button type="button" aria-label="Next" class="ctl" :disabled="player.stage >= n - 1" @click="go(player.stage + 1)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></button>
        </div>
        <Mascot v-if="big" :size="46" class="shrink-0" />
        <div class="min-w-0 flex-1" aria-live="polite" :class="big ? 'min-h-[56px]' : 'min-h-[38px]'">
          <p v-if="current" :key="`${player.run}-${player.stage}`" :lang="steps.lang" class="write-on font-black leading-snug text-white" :class="big ? 'text-[22px]' : 'text-[13.5px]'" style="--dur: 0.8s">{{ current.caption }}</p>
          <MathTex v-if="current?.math && big" :key="`m${player.stage}`" :latex="String(current.math)" class="mt-0.5 block overflow-x-auto text-[20px] text-[#bdf5ee]" style="animation: rise 500ms 300ms both" />
        </div>
        <span class="shrink-0 font-black tabular-nums text-white/55" :class="big ? 'text-[14px]' : 'text-[11px]'">{{ Math.min(player.stage + 1, n) }}/{{ n }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ctl {
  display: flex;
  height: 2.1rem;
  width: 2.1rem;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: rgb(11 29 40 / 0.65);
  color: #fff;
  backdrop-filter: blur(6px);
  transition: transform 200ms, background 200ms;
}
.ctl:hover:not(:disabled) {
  transform: scale(1.1);
  background: rgb(11 29 40 / 0.85);
}
.ctl:disabled {
  opacity: 0.35;
}
.ctl-main {
  height: 2.5rem;
  width: 2.5rem;
  background: #f47a2a;
}
.ctl-main:hover {
  background: #f47a2a !important;
}
.title-card {
  animation: title-card 1.6s ease both;
}
@keyframes title-card {
  0% {
    opacity: 0;
  }
  15%,
  70% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    visibility: hidden;
  }
}
</style>
