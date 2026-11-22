<script setup lang="ts">
import { titleTex } from '@/lib/latex'
// Full screen: the animation big, with the solution beside it. Each step of the solution
// lights up while Glim says it; pressing a step plays the animation from there. The tutor's
// complete written working is underneath. Keyboard: ← → steps, space pause, Esc back.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import FocusTrap from '../FocusTrap.vue'
import MathTex from '../MathTex.vue'
import SceneVideo from './SceneVideo.vue'
import { close, go, player, shrink, toggle } from '@/lib/player'
import { useRoute } from 'vue-router'

const route = useRoute()
const open = computed(() => player.mode === 'full' && !!player.steps?.scene)
const scene = computed(() => player.steps?.scene ?? null)
const working = ref(false)
const list = ref<HTMLElement | null>(null)

// keep the step being told in view
watch(
  () => player.stage,
  async () => {
    await nextTick()
    list.value?.querySelector('[aria-current="step"]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  },
)

// leaving full screen: back to the camera card on the camera page, otherwise close
function back() {
  if (route.name === 'scan') shrink()
  else close()
}

function onKey(e: KeyboardEvent) {
  if (!open.value) return
  // Space on a button of the player presses that button (a step, "The full working")
  if (e.key === ' ' && e.target instanceof HTMLButtonElement && e.target.closest('[role="dialog"]')) return
  if (e.key === 'Escape') back()
  else if (e.key === 'ArrowRight') go(player.stage + 1)
  else if (e.key === 'ArrowLeft') go(player.stage - 1)
  else if (e.key === ' ') toggle()
  else return
  e.preventDefault()
  e.stopPropagation()
}
onMounted(() => window.addEventListener('keydown', onKey, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <Teleport to="body">
    <Transition name="theatre">
      <div v-if="open && scene && player.steps" class="fixed inset-0 z-[60] flex items-center justify-center bg-[#06121a]/85 p-3 outline-none backdrop-blur-md sm:p-6" role="dialog" aria-modal="true" aria-label="Animation, step by step" tabindex="-1" @click.self="back">
        <FocusTrap>
        <div class="grid size-full max-h-[880px] max-w-[1400px] gap-4 lg:grid-cols-[minmax(0,1.9fr)_minmax(320px,1fr)]">
          <!-- the video -->
          <div class="flex min-h-0 flex-col justify-center">
            <SceneVideo size="full" />
          </div>

          <!-- the solution, in step with the video -->
          <aside class="flex min-h-0 flex-col gap-3 overflow-hidden rounded-[28px] bg-white p-5 text-ink shadow-2xl" style="animation: slide-in-right 500ms cubic-bezier(0.2, 0.8, 0.2, 1) both">
            <div>
              <p class="text-[12px] font-black uppercase tracking-[0.18em] text-lagoon">The solution</p>
              <MathTex v-if="player.steps.about" :latex="titleTex(player.steps.about)" class="mt-1 block overflow-x-auto text-[24px]" />
            </div>
            <ol ref="list" class="relative m-0 flex min-h-0 flex-1 list-none flex-col gap-1 overflow-y-auto p-0 pr-1">
              <li v-for="(st, i) in scene.stages" :key="i" class="relative">
                <span v-if="i < scene.stages.length - 1" class="absolute left-[19px] top-10 bottom-[-6px] w-[3px] rounded-full transition-colors duration-500" :class="i < player.stage ? 'bg-lagoon' : 'bg-line'" aria-hidden="true" />
                <button
                  type="button"
                  :aria-current="i === player.stage ? 'step' : undefined"
                  class="flex w-full items-start gap-3 rounded-2xl p-2 text-left transition-all duration-500"
                  :class="i === player.stage ? 'bg-lagoon-mist shadow-[inset_0_0_0_2px_var(--color-lagoon-soft)]' : i < player.stage ? 'opacity-100 hover:bg-line-2' : 'opacity-45 hover:opacity-80'"
                  @click="go(i)"
                >
                  <span class="relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full text-[15px] font-black transition-all duration-500" :class="i < player.stage || player.finished ? 'bg-lagoon text-white' : i === player.stage ? 'scale-110 bg-tangerine text-white shadow-lg' : 'bg-line-2 text-ink-2'">
                    <svg v-if="i < player.stage || player.finished" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5" /></svg>
                    <template v-else>{{ i + 1 }}</template>
                  </span>
                  <span class="min-w-0 pt-1.5">
                    <span class="block text-[15px] font-bold leading-snug">{{ st.caption }}</span>
                    <MathTex v-if="st.math" :latex="String(st.math)" class="mt-1 block overflow-x-auto text-[21px]" />
                  </span>
                </button>
              </li>
            </ol>
            <div v-if="player.finished && (player.steps.result || scene.resultTex)" class="flex items-center gap-3 rounded-2xl bg-right-bg px-4 py-3" style="animation: pop 500ms cubic-bezier(0.3, 1.6, 0.5, 1) both">
              <span class="text-[14px] font-black text-lagoon-deep">Answer</span>
              <MathTex :latex="player.steps.result || scene.resultTex" class="text-[26px]" />
            </div>
            <div v-if="player.steps.items.length" class="border-t border-line pt-3">
              <button type="button" class="flex w-full items-center justify-between text-[14px] font-black text-ink-2" :aria-expanded="working" @click="working = !working">
                The full working, written out ({{ player.steps.items.length }} steps)
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true" class="transition-transform" :class="working ? 'rotate-180' : ''"><path d="M6 9l6 6 6-6" /></svg>
              </button>
              <ol v-if="working" class="m-0 mt-2 flex max-h-[28vh] list-none flex-col gap-2 overflow-y-auto p-0">
                <li v-for="(w, i) in player.steps.items" :key="i" class="rounded-xl bg-line-2/60 p-2.5">
                  <p class="text-[14px] font-semibold">{{ i + 1 }}. {{ w.say }}</p>
                  <MathTex v-if="w.math" :latex="w.math" class="block overflow-x-auto text-[18px]" />
                </li>
              </ol>
            </div>
          </aside>
        </div>
        </FocusTrap>
      </div>
    </Transition>
  </Teleport>
</template>
