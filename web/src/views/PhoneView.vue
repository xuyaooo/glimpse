<script setup lang="ts">
// The phone's page (opened from the QR code in Settings): its back camera, sent to the computer.
// Nothing is read or saved here: the computer gets the video and does the rest.
import { onBeforeUnmount, ref } from 'vue'
import { useRoute } from 'vue-router'
import Mascot from '@/components/Mascot.vue'
import { answerWithCamera } from '@/lib/phone'

const route = useRoute()
const code = ref(String(route.query.c ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))
type Step = 'ready' | 'starting' | 'connecting' | 'live' | 'ended' | 'failed'
const step = ref<Step>('ready')
const message = ref('')
const video = ref<HTMLVideoElement | null>(null)
let camera: MediaStream | null = null
let pc: RTCPeerConnection | null = null
let lock: { release: () => Promise<void> } | null = null

async function keepAwake() {
  try {
    lock = (await (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen')) ?? null
  } catch {
    lock = null // not offered: the screen may sleep
  }
}

async function start() {
  if (code.value.length !== 6) return void ((step.value = 'failed'), (message.value = 'Type the 6-letter code shown on the computer.'))
  if (!navigator.mediaDevices?.getUserMedia) {
    step.value = 'failed'
    message.value = window.isSecureContext ? 'This browser can’t open the camera.' : 'The camera only opens on a secure (https) page. Use the online Glimpse link.'
    return
  }
  step.value = 'starting'
  try {
    camera = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
    if (video.value) video.value.srcObject = camera
    step.value = 'connecting'
    pc = await answerWithCamera(code.value, camera, (s) => {
      if (s === 'connected') {
        step.value = 'live'
        void keepAwake()
      } else if (s === 'failed') {
        step.value = 'failed'
        message.value = 'The computer couldn’t be reached. Put the phone on the same Wi-Fi as the computer, make a new code there, and scan it again.'
      } else if ((s === 'disconnected' || s === 'closed') && step.value === 'live') step.value = 'ended'
    })
  } catch (e) {
    stop(false)
    step.value = 'failed'
    const name = e instanceof Error ? e.name : ''
    message.value = name === 'NotAllowedError' ? 'The camera is blocked. Allow it for this page (Settings, Safari, Camera), then try again.' : e instanceof Error && e.message ? e.message : 'Something went wrong. Try again.'
  }
}

function stop(ended = true) {
  pc?.close()
  pc = null
  camera?.getTracks().forEach((t) => t.stop())
  camera = null
  void lock?.release().catch(() => {})
  lock = null
  if (ended) step.value = 'ended'
}
onBeforeUnmount(() => stop(false))
</script>

<template>
  <main class="flex min-h-dvh flex-col items-center gap-5 bg-[linear-gradient(180deg,#e6f6f4,#fdfbf6)] px-4 py-6 text-center">
    <div class="flex items-center gap-2.5">
      <Mascot :size="44" />
      <div class="text-left">
        <h1 class="text-[22px] font-black leading-tight">Glimpse camera</h1>
        <p class="text-[13px] font-semibold text-ink-2">This phone films the paper for the computer.</p>
      </div>
    </div>

    <div class="relative w-full max-w-[520px] overflow-hidden rounded-[24px] bg-[#0b1d28] shadow-xl" :class="step === 'live' || step === 'connecting' || step === 'starting' ? 'aspect-[3/4]' : 'hidden'">
      <video ref="video" autoplay muted playsinline class="size-full object-cover" />
      <span v-if="step === 'live'" class="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-[#0b1d28]/70 px-2.5 py-1 text-[12px] font-black text-white backdrop-blur"><span class="size-2 animate-pulse rounded-full bg-[#ff4d4d]" /> On the computer</span>
    </div>

    <section class="flex w-full max-w-[520px] flex-col gap-3 rounded-[24px] bg-white p-5 shadow-sm">
      <template v-if="step === 'ready' || step === 'failed'">
        <p v-if="step === 'failed'" class="rounded-2xl bg-wrong-bg px-4 py-3 text-[15px] font-bold text-wrong">{{ message }}</p>
        <label class="flex flex-col gap-1.5 text-left">
          <span class="text-[13px] font-black text-ink-2">Code shown on the computer</span>
          <input v-model="code" maxlength="6" autocapitalize="characters" autocomplete="off" class="rounded-xl border-2 border-line px-3 py-2.5 text-center text-[24px] font-black tracking-[0.3em] uppercase outline-none focus:border-lagoon" />
        </label>
        <button type="button" class="btn-lagoon min-h-12 rounded-2xl text-[17px] font-black" @click="start">Use this phone’s camera</button>
        <p class="text-[13px] font-semibold text-ink-2">Keep the phone on the same Wi-Fi as the computer. Hold it above the paper, or lean it on something.</p>
      </template>
      <template v-else-if="step === 'starting' || step === 'connecting'">
        <p class="flex items-center justify-center gap-2 text-[15px] font-bold text-lagoon-deep"><span class="size-4 animate-spin rounded-full border-2 border-lagoon-soft border-t-lagoon" aria-hidden="true" /> {{ step === 'starting' ? 'Opening the camera…' : 'Connecting to the computer…' }}</p>
      </template>
      <template v-else-if="step === 'live'">
        <p class="text-[16px] font-black text-right">Connected ✓</p>
        <p class="text-[14px] font-semibold text-ink-2">Point the phone at the paper. On the computer, press “Check my whole sheet”. Keep this page open.</p>
        <button type="button" class="min-h-11 rounded-xl border-2 border-line bg-white px-4 text-[15px] font-black" @click="stop()">Stop</button>
      </template>
      <template v-else>
        <p class="text-[16px] font-black">The camera is off.</p>
        <p class="text-[14px] font-semibold text-ink-2">To use it again, make a new code in Glimpse’s Settings on the computer.</p>
      </template>
    </section>
  </main>
</template>
