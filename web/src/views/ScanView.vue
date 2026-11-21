<script setup lang="ts">
// Open camera: a whole window. Left, the live camera with the tutor drawing on it.
// Right, the digital side: what was read, whether it's right, why, and what's going on.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Mascot from '@/components/Mascot.vue'
import CameraView from '@/components/scan/CameraView.vue'
import DigitalPanel from '@/components/scan/DigitalPanel.vue'
import { log } from '@/lib/activity'
import { grab, useCamera } from '@/lib/camera'
import { askEnd, askStart, cutPart, startSession, state } from '@/lib/engine'
import { sheetRect, slotRect } from '@/lib/geometry'
import { useManualTriggers } from '@/lib/keys'
import { usePencilLift } from '@/lib/pencilLift'
import { speak } from '@/lib/speech'
import { subjectById } from '@/lib/subjects'
import { ui } from '@/lib/ui'
import { useStepPlayer } from '@/lib/useStepPlayer'

const router = useRouter()
const route = useRoute()
const cam = useCamera()
const video = ref<HTMLVideoElement | null>(null)
const paper = ref('paper' in route.query)
const rotated = ref(false)
const autoRead = ref(false)
const flash = ref(0)
const fullscreen = ref(false)

// With a real engine, reading on pencil-lift is on by default. The demo script stays manual
// so a stray hand movement can't skip ahead.
watch(
  () => state.connection,
  (c) => c === 'live' && (autoRead.value = true),
  { immediate: true },
)

const subject = computed(() => subjectById(state.subject))
const live = computed(() => !paper.value && cam.status.value === 'live')
const selected = computed(() => state.parts.find((p) => p.id === ui.selectedPartId) ?? state.parts[state.parts.length - 1] ?? null)
const teaching = computed(() => (selected.value ? (state.teachings.filter((t) => t.partId === selected.value!.id).pop() ?? null) : null))
const hint = computed(() => (selected.value ? (state.hintsByPart[selected.value.id] ?? null) : null))
const player = useStepPlayer(
  () => `${selected.value?.id}-${selected.value?.verdict}-${teaching.value?.iteration ?? 0}`,
  () => (teaching.value ? teaching.value.steps.length - 1 : 0),
)

// ------------------------------------------------------------------ capturing a line

function capture() {
  if (!state.student || state.asking || state.confirm) return
  flash.value++
  const v = video.value
  let image: string | undefined
  if (live.value && v?.videoWidth) {
    // A crop of just this line, to show next to what was read...
    ui.pendingCrop = grab(v, slotRect(sheetRect(v.videoWidth, v.videoHeight), state.parts.length + 1), rotated.value, 900, 0.9)
    // ...and, for a real engine, the whole frame to read from.
    if (state.connection === 'live') image = grab(v, null, rotated.value) ?? undefined
  }
  cutPart(image)
}

const { moving } = usePencilLift(video, () => live.value && autoRead.value && state.status === 'watching' && !state.asking && !state.confirm, capture)
useManualTriggers({ cut: capture, askStart, askEnd })

// ------------------------------------------------------------------ reacting to the engine

watch(
  () => state.parts.length,
  (n, old) => {
    if (n <= (old ?? 0)) return
    const p = state.parts[n - 1]
    ui.selectedPartId = p.id
    if (ui.pendingCrop) {
      ui.crops[p.id] = ui.pendingCrop
      ui.pendingCrop = null
    }
  },
)
watch(
  () => state.teaching,
  (t) => t && (ui.selectedPartId = t.partId),
)
watch(
  () => state.hint,
  (h) => h && speak(h.text, h.lang),
)
watch(
  () => state.answer,
  (a) => a && speak(a.text, a.lang),
)

// ------------------------------------------------------------------ window

function back() {
  router.push({ name: 'home' })
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && !document.fullscreenElement) back()
}
function onFullscreen() {
  fullscreen.value = !!document.fullscreenElement
}
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen()
  else document.documentElement.requestFullscreen?.().catch(() => {})
}
async function switchCamera(id: string) {
  paper.value = false
  await cam.start(id)
}

onMounted(async () => {
  window.addEventListener('keydown', onKey)
  document.addEventListener('fullscreenchange', onFullscreen)
  if (!state.student && typeof route.query.student === 'string') startSession(route.query.student)
  if (!state.student) return void router.replace({ name: 'home' })
  if (!paper.value) {
    await cam.start()
    if (cam.status.value === 'live') log('camera', `Camera on: ${cam.label.value}.`, 'The video stays in this browser. Only a line you finish is read.')
  }
  // `?autoplay`: hands-free demo, a line every few seconds.
  if ('autoplay' in route.query) {
    let lines = 0
    const tick = () => {
      if (lines++ >= 5 || state.confirm) return
      capture()
      window.setTimeout(tick, 4200)
    }
    window.setTimeout(tick, 1800)
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  document.removeEventListener('fullscreenchange', onFullscreen)
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
})

const STATUS: Record<string, string> = {
  idle: 'Ready',
  watching: 'Watching your paper',
  reading: 'Reading your line',
  thinking: 'Checking it',
  listening: 'Listening to your question',
  answering: 'Thinking about your question',
}
</script>

<template>
  <div class="flex min-h-screen flex-col lg:h-screen lg:overflow-hidden" style="background: linear-gradient(180deg, #d6ecf9 0%, #eaf4fb 60%, #f4f9fd 100%)">
    <header class="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
      <button type="button" class="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-[15px] font-black shadow-[0_8px_20px_-14px_rgb(24_41_74/0.5)] transition-transform hover:-translate-x-0.5" @click="back">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        Home
      </button>
      <div class="flex items-center gap-3">
        <Mascot :size="46" />
        <div>
          <h1 class="flex flex-wrap items-center gap-2 text-[22px] font-black leading-tight">
            Scan your paper
            <span class="inline-flex items-center gap-1.5 rounded-full bg-white py-0.5 pl-0.5 pr-3 text-[13px] font-black shadow-sm">
              <span class="flex size-6 items-center justify-center rounded-full" :style="{ background: subject.bg }">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="subject.icon" /></svg>
              </span>
              {{ subject.name }}, {{ subject.topic.toLowerCase() }}
            </span>
          </h1>
          <p class="text-[14px] font-semibold text-ink-2">{{ state.student?.name }}, write a line, then lift your pencil.</p>
        </div>
      </div>

      <div class="ml-auto flex flex-wrap items-center gap-2">
        <label v-if="cam.devices.value.length > 1 && !paper" class="flex min-h-10 items-center gap-2 rounded-full bg-white px-3 text-[14px] font-bold shadow-sm">
          <span class="sr-only">Camera</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#0F7F76" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4zm8 9a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" /></svg>
          <select :value="cam.deviceId.value" class="max-w-[180px] bg-transparent outline-none" @change="switchCamera(($event.target as HTMLSelectElement).value)">
            <option v-for="d in cam.devices.value" :key="d.id" :value="d.id">{{ d.label }}</option>
          </select>
        </label>
        <button
          type="button"
          role="switch"
          :aria-checked="autoRead"
          :disabled="!live"
          class="flex min-h-10 items-center gap-2.5 rounded-full bg-white px-3.5 text-[14px] font-bold shadow-sm disabled:opacity-50"
          title="Reads a line by itself when you stop writing"
          @click="autoRead = !autoRead"
        >
          <span class="relative h-5 w-9 rounded-full transition-colors" :class="autoRead ? 'bg-lagoon' : 'bg-line'">
            <span class="absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform duration-300" :class="autoRead ? 'translate-x-[18px]' : 'translate-x-0.5'" />
          </span>
          Read when I lift my pencil
          <span v-if="autoRead && live" class="size-2 rounded-full transition-colors" :class="moving ? 'bg-tangerine' : 'bg-right-mark'" :title="moving ? 'Writing' : 'Still'" />
        </button>
        <button type="button" :aria-pressed="rotated" :disabled="!live" title="Turn the picture upside down" aria-label="Turn the picture upside down" class="flex size-10 items-center justify-center rounded-full bg-white shadow-sm transition-transform hover:rotate-180 disabled:opacity-50" :class="rotated ? 'text-lagoon ring-2 ring-lagoon' : ''" @click="rotated = !rotated">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4" /></svg>
        </button>
        <a href="/worksheet" target="_blank" class="inline-flex min-h-10 items-center gap-2 rounded-full bg-white px-3.5 text-[14px] font-bold text-ink no-underline shadow-sm">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V3h12v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M6 14h12v7H6z" /></svg>
          Print the sheet
        </a>
        <button type="button" :aria-label="fullscreen ? 'Leave full screen' : 'Full screen'" :title="fullscreen ? 'Leave full screen' : 'Full screen'" class="flex size-10 items-center justify-center rounded-full bg-white shadow-sm transition-transform hover:scale-110" @click="toggleFullscreen">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path v-if="!fullscreen" d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
            <path v-else d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
          </svg>
        </button>
      </div>
    </header>

    <main class="grid min-h-0 flex-1 gap-4 px-4 pb-3 sm:px-6 lg:grid-cols-[minmax(0,1.75fr)_minmax(360px,1fr)]">
      <CameraView
        :stream="cam.stream.value"
        :camera="cam.status.value"
        :message="cam.message.value"
        :paper="paper"
        :rotated="rotated"
        :parts="state.parts"
        :selected-id="selected?.id ?? null"
        :teaching="selected?.verdict === 'wrong' ? teaching : null"
        :step="player.step.value"
        :question="state.question"
        :answer="state.answer"
        :asking="state.asking"
        :status="state.status"
        :flash="flash"
        :moving="moving"
        :auto-read="autoRead"
        :name="state.student?.name ?? ''"
        :crops="ui.crops"
        @select="(id) => (ui.selectedPartId = id)"
        @video="(el) => (video = el)"
        @retry="cam.start()"
        @use-paper="paper = true"
      />
      <DigitalPanel
        :selected="selected"
        :teaching="teaching"
        :step="player.step.value"
        :crop="selected ? (ui.crops[selected.id] ?? null) : null"
        :hint="hint"
        @step="player.go"
        @replay="player.play"
        @select="(id) => (ui.selectedPartId = id)"
      />
    </main>

    <footer class="flex flex-wrap items-center gap-3 border-t border-white/70 bg-white/75 px-4 py-3 backdrop-blur sm:px-6">
      <span role="status" class="flex items-center gap-2.5 text-[15px] font-black">
        <span class="relative flex size-3">
          <span class="absolute inline-flex size-full animate-ping rounded-full opacity-60" :class="state.asking ? 'bg-tangerine' : 'bg-lagoon-bright'" />
          <span class="relative size-3 rounded-full" :class="state.asking ? 'bg-tangerine' : 'bg-lagoon-bright'" />
        </span>
        {{ state.connection === 'offline' ? 'The tutor stopped. Restart the engine.' : STATUS[state.status] }}
      </span>
      <span v-if="state.connection === 'demo'" class="rounded-full bg-line-2 px-2.5 py-0.5 text-[12px] font-black text-ink-2">Demo tutor</span>
      <span class="hidden text-[13px] font-semibold text-ink-3 md:inline">Keyboard: W reads a line, hold A to ask, Esc goes home</span>
      <div class="ml-auto flex flex-wrap gap-2">
        <button type="button" class="btn-lagoon min-h-11 rounded-xl px-4 text-[14px] font-black transition-transform hover:-translate-y-0.5 active:scale-95" @click="capture">Read my line now</button>
        <button
          type="button"
          class="min-h-11 select-none rounded-xl px-4 text-[14px] font-black transition-colors"
          :class="state.asking ? 'bg-tangerine text-white' : 'border-2 border-line bg-white'"
          @pointerdown.prevent="askStart"
          @pointerup="askEnd"
          @pointerleave="state.asking && askEnd()"
        >{{ state.status === 'answering' ? 'Thinking…' : state.asking ? 'Listening, let go to send' : 'Hold to ask' }}</button>
      </div>
    </footer>
  </div>
</template>
