<script setup lang="ts">
// Settings: Glim's voice (natural or the computer's own, which one, how fast), reading aloud
// on or off, and listening for a question after pointing.
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import FocusTrap from './FocusTrap.vue'
import { NATURAL_VOICES, settings } from '@/lib/settings'
import { preloadVoice, speak, stopSpeaking, voiceStatus } from '@/lib/speech'
import { listenStatus, preloadListener } from '@/lib/listen'
import { state } from '@/lib/engine'
import { ui } from '@/lib/ui'

const SAMPLE = 'Hi, I am Glim! Point at your paper and ask me anything. For example: what is 1/2 + 1/4?'

const naturalNote = computed(() => {
  if (settings.voice !== 'natural') return ''
  if (voiceStatus.natural === 'ready') return `Ready, running on this computer (${voiceStatus.device === 'webgpu' ? 'graphics card' : 'processor'}).`
  if (voiceStatus.natural === 'loading') return `Getting the voice ready, the first time only: ${Math.round(voiceStatus.progress * 100)}%. Until then, the computer's voice speaks.`
  if (voiceStatus.natural === 'failed') return 'This browser can’t run the natural voice, so the computer’s voice speaks.'
  return ''
})

watch(
  () => [ui.settingsOpen, settings.voice],
  () => ui.settingsOpen && preloadVoice(),
  { immediate: true },
)
watch(
  () => [ui.settingsOpen, settings.listenAfterPointing],
  () => ui.settingsOpen && settings.listenAfterPointing && preloadListener(state.lang),
  { immediate: true },
)
const listenNote = computed(() => {
  if (listenStatus.model === 'ready') return `Speech is understood on this computer (Whisper, ${listenStatus.device === 'webgpu' ? 'graphics card' : 'processor'}).`
  if (listenStatus.model === 'loading') return `Getting the speech model ready, the first time only: ${Math.round(listenStatus.progress * 100)}%.`
  if (listenStatus.model === 'failed') return 'The speech model can’t run in this browser. Type your question instead.'
  return 'Speech is understood on this computer (Whisper).'
})

function close() {
  ui.settingsOpen = false
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && ui.settingsOpen) {
    e.stopPropagation()
    close()
  }
}
onMounted(() => window.addEventListener('keydown', onKey, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <Transition name="fade">
    <div v-if="ui.settingsOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-[#0b1d28]/45 p-4 backdrop-blur-sm" @click.self="close">
      <FocusTrap>
      <section role="dialog" aria-modal="true" aria-labelledby="settings-title" tabindex="-1" class="flex max-h-full w-full max-w-[520px] flex-col gap-5 overflow-y-auto rounded-[28px] bg-white p-6 shadow-2xl outline-none">
        <div class="flex items-center justify-between gap-3">
          <h2 id="settings-title" class="text-[24px] font-black">Settings</h2>
          <button type="button" aria-label="Close" class="flex size-10 items-center justify-center rounded-full bg-line-2 transition hover:scale-105" @click="close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <!-- reading aloud on / off -->
        <label class="flex cursor-pointer items-center justify-between gap-4 rounded-2xl bg-lagoon-mist px-4 py-3.5">
          <span>
            <span class="block text-[16px] font-black">Glim talks</span>
            <span class="block text-[13px] font-semibold text-ink-2">Reads hints, answers and steps aloud. Off: only when you press “Hear it”.</span>
          </span>
          <input v-model="settings.speakAloud" type="checkbox" role="switch" class="peer sr-only" />
          <span class="relative h-7 w-12 shrink-0 rounded-full bg-line transition-colors peer-checked:bg-lagoon peer-focus-visible:ring-4 peer-focus-visible:ring-lagoon-soft">
            <span class="absolute left-0.5 top-0.5 size-6 rounded-full bg-white shadow transition-transform" :class="settings.speakAloud ? 'translate-x-5' : ''" />
          </span>
        </label>

        <!-- which voice -->
        <fieldset class="m-0 flex flex-col gap-2.5 border-0 p-0">
          <legend class="mb-2 text-[16px] font-black">Voice</legend>
          <div class="grid grid-cols-2 gap-2">
            <label v-for="v in [{ id: 'natural', name: 'Natural', note: 'A neural voice, on this computer' }, { id: 'system', name: 'Basic', note: 'The computer’s own voice' }]" :key="v.id" class="flex cursor-pointer flex-col rounded-2xl border-2 px-3.5 py-2.5 transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-lagoon-soft" :class="settings.voice === v.id ? 'border-lagoon bg-lagoon-mist' : 'border-line'">
              <input v-model="settings.voice" type="radio" name="voice" :value="v.id" class="sr-only" />
              <span class="text-[15px] font-black">{{ v.name }}</span>
              <span class="text-[12px] font-semibold text-ink-2">{{ v.note }}</span>
            </label>
          </div>
          <p v-if="naturalNote" class="text-[13px] font-semibold text-ink-2" aria-live="polite">{{ naturalNote }}</p>
          <div v-if="settings.voice === 'natural'" class="flex flex-wrap gap-2">
            <button
              v-for="v in NATURAL_VOICES"
              :key="v.id"
              type="button"
              :aria-pressed="settings.naturalVoice === v.id"
              class="rounded-full border-2 px-3.5 py-1.5 text-[14px] font-black transition-colors"
              :class="settings.naturalVoice === v.id ? 'border-lagoon bg-lagoon text-white' : 'border-line bg-white'"
              :title="v.note"
              @click="settings.naturalVoice = v.id"
            >
              {{ v.label }} <span class="font-semibold opacity-75">· {{ v.note }}</span>
            </button>
          </div>
        </fieldset>

        <!-- age -->
        <label class="flex flex-col gap-1.5">
          <span class="text-[16px] font-black">Age</span>
          <span class="text-[13px] font-semibold text-ink-2">Little ones get apples, pizzas and a hopping frog; older learners get bars, balances and graphs.</span>
          <select v-model.number="settings.age" class="min-h-11 rounded-xl border-2 border-line bg-white px-3 text-[15px] font-bold">
            <option :value="0">{{ state.student ? `${state.student.name}'s age (${state.student.age})` : 'The student’s age' }}</option>
            <option v-for="a in [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]" :key="a" :value="a">{{ a }} years</option>
            <option :value="18">Grown-up</option>
          </select>
        </label>

        <!-- speed -->
        <label class="flex flex-col gap-1.5">
          <span class="flex justify-between text-[16px] font-black">Speed <span class="text-[14px] font-bold text-ink-2">{{ settings.rate === 1 ? 'normal' : settings.rate < 1 ? 'slower' : 'faster' }}</span></span>
          <input v-model.number="settings.rate" type="range" min="0.8" max="1.2" step="0.05" class="accent-[#14A096]" />
        </label>

        <div class="flex gap-2">
          <button type="button" class="btn-lagoon min-h-11 flex-1 rounded-xl px-4 text-[15px] font-black" @click="speak(SAMPLE, 'en')">Hear the voice</button>
          <button type="button" class="min-h-11 rounded-xl border-2 border-line bg-white px-4 text-[15px] font-black" @click="stopSpeaking">Stop</button>
        </div>

        <!-- listening -->
        <label class="flex cursor-pointer items-center justify-between gap-4 rounded-2xl bg-[#fff4e8] px-4 py-3.5">
          <span>
            <span class="block text-[16px] font-black">Listen after I point</span>
            <span class="block text-[13px] font-semibold text-ink-2">When you point at your paper, the microphone listens for your question.</span>
            <span class="mt-1 block text-[12px] font-bold text-[#9a4a10]" aria-live="polite">{{ listenNote }}</span>
          </span>
          <input v-model="settings.listenAfterPointing" type="checkbox" role="switch" class="peer sr-only" />
          <span class="relative h-7 w-12 shrink-0 rounded-full bg-line transition-colors peer-checked:bg-tangerine peer-focus-visible:ring-4 peer-focus-visible:ring-[#ffd9b8]">
            <span class="absolute left-0.5 top-0.5 size-6 rounded-full bg-white shadow transition-transform" :class="settings.listenAfterPointing ? 'translate-x-5' : ''" />
          </span>
        </label>
      </section>
      </FocusTrap>
    </div>
  </Transition>
</template>
