<script setup lang="ts">
import { titleTex } from '@/lib/latex'
import { sceneIcon, sceneLabel } from '@/lib/sceneKinds'
// The solution, step by step, beside the camera. With an animation: its steps as a timeline
// that lights up with the video on the camera, each one playable from there. The tutor's
// written working is revealed one step at a time ("Next step") and read out.
import { computed, ref, watch } from 'vue'
import MathTex from '../MathTex.vue'
import SceneStage from '../scenes/SceneStage.vue'
import { go, player, start } from '@/lib/player'
import { speak, speakAuto } from '@/lib/speech'
import type { WorkedSteps } from '@/lib/types'

const props = defineProps<{ steps: WorkedSteps }>()

const shown = ref(1)
watch(
  () => props.steps.at,
  () => (shown.value = 1),
)
const total = computed(() => props.steps.items.length)
const done = computed(() => shown.value >= total.value)
// the video on the camera is this solution's animation
const linked = computed(() => player.steps?.at === props.steps.at && (player.mode === 'dock' || player.mode === 'full'))
// while it is on the camera, the animation as the player shows it (it keeps its steps until played again)
const scene = computed(() => (linked.value ? player.steps?.scene : undefined) ?? props.steps.scene)

function next() {
  if (done.value) return
  shown.value++
  speakAuto(props.steps.items[shown.value - 1].say, props.steps.lang)
}
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
  <section aria-label="Step by step" class="flex flex-col gap-4 rounded-[24px] bg-white p-5 shadow-[0_14px_30px_-22px_rgb(24_41_74/0.5)]" style="animation: rise 500ms both">
    <div>
      <p class="text-[12px] font-black uppercase tracking-[0.16em] text-lagoon">Let's solve it</p>
      <MathTex v-if="steps.about" :latex="titleTex(steps.about)" class="mt-0.5 block overflow-x-auto text-[24px]" />
    </div>

    <template v-if="scene">
      <!-- the animation: plays on the camera -->
      <button type="button" class="group relative block w-full overflow-hidden rounded-[20px] text-left ring-1 ring-line transition hover:shadow-lg" :aria-label="`Play the animation: ${sceneLabel(scene.kind)}`" @click="playFrom(0)">
        <SceneStage :scene="scene" :stage="linked ? player.stage : scene.stages.length - 1" />
        <span v-if="!linked || !player.playing" class="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-[#0b1d28]/60 to-transparent transition group-hover:from-[#0b1d28]/40">
          <span class="flex items-center gap-2 rounded-full bg-tangerine py-2 pl-2 pr-4 text-[15px] font-black text-white shadow-xl transition group-hover:scale-105">
            <span class="flex size-8 items-center justify-center rounded-full bg-white text-tangerine"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg></span>
            {{ sceneIcon(scene.kind) }} {{ sceneLabel(scene.kind) }}
          </span>
        </span>
        <span v-else class="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-[#0b1d28]/70 px-2.5 py-1 text-[12px] font-black text-white backdrop-blur"><span class="size-2 animate-pulse rounded-full bg-[#ff4d4d]" /> Playing on the camera</span>
      </button>

      <!-- its steps, as a timeline in step with the video -->
      <ol class="m-0 flex list-none flex-col p-0">
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
      <div v-if="steps.result" class="flex flex-wrap items-center gap-3 rounded-2xl bg-right-bg px-4 py-3">
        <span class="text-[14px] font-black text-lagoon-deep">Answer</span>
        <MathTex :latex="steps.result" class="text-[24px]" />
      </div>
    </template>

    <!-- the tutor's written working -->
    <div v-if="total" class="flex flex-col gap-2" :class="steps.scene ? 'border-t border-line pt-3' : ''">
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-[15px] font-black">{{ steps.scene ? 'The full working' : steps.title }}</h3>
        <span class="rounded-full bg-line-2 px-2.5 py-0.5 text-[12px] font-black tabular-nums text-ink-2">{{ Math.min(shown, total) }} / {{ total }}</span>
      </div>
      <TransitionGroup tag="ol" name="list" class="m-0 flex list-none flex-col gap-2 p-0">
        <li v-for="(st, i) in steps.items.slice(0, shown)" :key="`${steps.at}-${i}`" class="flex items-start gap-3 rounded-2xl bg-lagoon-mist/70 px-3 py-2.5">
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
      <div v-if="!done" class="flex flex-wrap gap-2">
        <button type="button" class="btn-lagoon min-h-10 rounded-xl px-4 text-[14px] font-black" @click="next">Next step</button>
        <button type="button" class="min-h-10 rounded-xl border-2 border-line bg-white px-4 text-[14px] font-black" @click="shown = total">Show all</button>
      </div>
      <div v-else-if="!steps.scene && steps.result" class="flex flex-wrap items-center gap-3 rounded-2xl bg-right-bg px-4 py-3" style="animation: pop 450ms both">
        <span class="text-[14px] font-black text-lagoon-deep">Answer</span>
        <MathTex :latex="steps.result" class="text-[24px]" />
      </div>
    </div>
    <p v-else class="flex items-center gap-2 text-[13px] font-bold text-ink-2"><span class="size-4 animate-spin rounded-full border-2 border-lagoon-soft border-t-lagoon" aria-hidden="true" /> Glim is writing out the full working…</p>
  </section>
</template>
