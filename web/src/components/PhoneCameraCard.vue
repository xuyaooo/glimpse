<script setup lang="ts">
// Settings: use a phone (an iPhone...) as the camera. On a Mac, an iPhone nearby is already a
// camera (Continuity Camera). Anywhere: a QR code the phone scans; its camera then comes to this
// computer (WebRTC, same Wi-Fi) and the camera page uses it.
import { ref, watch } from 'vue'
import QRCode from 'qrcode'
import { connectPhone, disconnectPhone, phone } from '@/lib/phone'

const qr = ref('')
watch(
  () => phone.url,
  async (url) => {
    qr.value = url ? await QRCode.toDataURL(url, { margin: 1, width: 360, color: { dark: '#18294a', light: '#ffffff' } }).catch(() => '') : ''
  },
  { immediate: true },
)
const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent) && !/iPhone|iPad/i.test(navigator.userAgent)
const secure = typeof window === 'undefined' || window.isSecureContext && !/^(localhost|127\.|\[::1\])/.test(location.hostname)
</script>

<template>
  <section aria-labelledby="phone-camera-title" class="flex flex-col gap-3 rounded-2xl border-2 border-line p-4">
    <div class="flex items-start gap-3">
      <span class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-lagoon-mist text-[20px]" aria-hidden="true">📱</span>
      <div>
        <h3 id="phone-camera-title" class="text-[16px] font-black">Use your phone as the camera</h3>
        <p class="text-[13px] font-semibold text-ink-2">A phone held above the paper sees it better than a laptop camera.</p>
      </div>
    </div>

    <p v-if="isMac" class="rounded-xl bg-lagoon-mist px-3 py-2.5 text-[13px] font-semibold text-ink">
      <span class="font-black">iPhone and Mac:</span> with the same Apple ID, Wi-Fi and Bluetooth on, put the iPhone near the Mac: it appears in the camera list on the camera page (Continuity Camera). Nothing else to do.
    </p>

    <!-- any phone: a code to scan -->
    <template v-if="phone.status === 'idle' || phone.status === 'failed'">
      <p v-if="phone.message" class="rounded-xl bg-[#fff4d6] px-3 py-2 text-[13px] font-bold text-[#7a4f00]">{{ phone.message }}</p>
      <button type="button" class="btn-lagoon min-h-11 self-start rounded-xl px-4 text-[14px] font-black" @click="connectPhone">{{ phone.status === 'failed' ? 'Make a new code' : 'Connect a phone' }}</button>
      <p v-if="!secure" class="text-[12px] font-semibold text-ink-3">A phone opens its camera only on a secure (https) page: use this from the online Glimpse, or use Continuity Camera on a Mac.</p>
    </template>
    <p v-else-if="phone.status === 'making'" class="flex items-center gap-2 text-[14px] font-bold text-lagoon-deep"><span class="size-4 animate-spin rounded-full border-2 border-lagoon-soft border-t-lagoon" aria-hidden="true" /> Making a code…</p>
    <div v-else-if="phone.status === 'waiting' || phone.status === 'connecting'" class="flex flex-wrap items-center gap-4">
      <img v-if="qr" :src="qr" alt="QR code to open the phone camera page" class="size-40 rounded-xl border border-line" />
      <div class="flex min-w-0 flex-1 flex-col gap-1.5">
        <p class="text-[14px] font-black">Scan this with the phone’s camera</p>
        <p class="text-[13px] font-semibold text-ink-2">Or open <span class="break-all font-bold text-ink">{{ phone.url.replace(/\?.*$/, '') }}</span> on the phone and type</p>
        <p class="text-[26px] font-black tracking-[0.25em] text-lagoon-deep">{{ phone.code }}</p>
        <p class="flex items-center gap-2 text-[13px] font-bold text-ink-2"><span class="size-3.5 animate-spin rounded-full border-2 border-lagoon-soft border-t-lagoon" aria-hidden="true" /> {{ phone.status === 'connecting' ? 'Connecting…' : 'Waiting for the phone…' }}</p>
        <button type="button" class="self-start text-[13px] font-bold text-ink-2 underline-offset-2 hover:underline" @click="disconnectPhone">Cancel</button>
      </div>
    </div>
    <div v-else class="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-right-bg px-3 py-2.5">
      <p class="text-[14px] font-black text-[#136e43]">Phone connected ✓ <span class="font-semibold text-ink-2">The camera page uses it.</span></p>
      <button type="button" class="min-h-9 rounded-lg border-2 border-line bg-white px-3 text-[13px] font-black" @click="disconnectPhone">Disconnect</button>
    </div>
  </section>
</template>
