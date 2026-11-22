// The first real sentence through Whisper on the graphics card is slow (~10 s: its GPU code
// compiles then). Once both models are ready, one silent round trip warms it up: the natural
// voice makes a sentence (not played) and Whisper writes it down. After that, ~0.2-0.4 s.
import { watch } from 'vue'
import { state } from './engine'
import { listenStatus, transcribeAudio } from './listen'
import { synthesize, voiceStatus } from './speech'

let started = false

async function to16k({ data, rate }: { data: Float32Array; rate: number }) {
  const off = new OfflineAudioContext(1, Math.ceil((data.length / rate) * 16000), 16000)
  const buffer = off.createBuffer(1, data.length, rate)
  buffer.copyToChannel(data as Float32Array<ArrayBuffer>, 0)
  const src = off.createBufferSource()
  src.buffer = buffer
  src.connect(off.destination)
  src.start()
  return new Float32Array((await off.startRendering()).getChannelData(0))
}

/** `lang`: the language questions will be asked in (by default the session's, when it runs). */
export function warmUpListening(lang?: string) {
  if (started) return
  const stop = watch(
    () => [listenStatus.model, voiceStatus.natural] as const,
    async ([ears, voice]) => {
      if (started || ears !== 'ready' || voice !== 'ready') return
      started = true
      queueMicrotask(() => stop())
      try {
        const audio = await synthesize('Hello Glim, can you help me with this exercise, please?')
        if (audio) await transcribeAudio(await to16k(audio), lang ?? state.lang) // the model questions use
      } catch {
        // only a warm-up
      }
    },
    { immediate: true },
  )
}
