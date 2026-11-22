// Natural voice: Kokoro-82M (an open neural text-to-speech model), run in this worker so the
// camera and hand tracking stay smooth. The model (~90-330 MB) downloads once from Hugging
// Face and stays in the browser's cache; after that it works offline. WebGPU when the browser
// has it (fast), otherwise WebAssembly.
import { KokoroTTS } from 'kokoro-js'

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX'
let loading: Promise<KokoroTTS> | null = null

async function load() {
  loading ??= (async () => {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu
    const webgpu = !!(gpu && (await gpu.requestAdapter().catch(() => null)))
    const options = webgpu ? ({ dtype: 'fp32', device: 'webgpu' } as const) : ({ dtype: 'q8', device: 'wasm' } as const)
    const files: Record<string, { loaded: number; total: number }> = {}
    const tts = await KokoroTTS.from_pretrained(MODEL, {
      ...options,
      progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
        if (p.status !== 'progress' || !p.file) return
        files[p.file] = { loaded: p.loaded ?? 0, total: p.total ?? 0 }
        const all = Object.values(files)
        const total = all.reduce((s, f) => s + f.total, 0)
        if (total) postMessage({ type: 'progress', share: all.reduce((s, f) => s + f.loaded, 0) / total })
      },
    })
    await tts.generate('Hi.', { voice: 'af_heart' }) // warm up (the first run compiles the GPU code)
    postMessage({ type: 'ready', device: options.device })
    return tts
  })()
  loading.catch((err) => {
    loading = null
    postMessage({ type: 'failed', message: String(err?.message || err) })
  })
  return loading
}

self.onmessage = async (e: MessageEvent<{ type: 'load' } | { type: 'say'; id: number; text: string; voice: string; speed: number }>) => {
  const m = e.data
  if (m.type === 'load') return void load().catch(() => {})
  try {
    const tts = await load()
    const t = performance.now()
    const audio = await tts.generate(m.text, { voice: m.voice as never, speed: m.speed })
    const data = audio.audio as Float32Array
    postMessage({ type: 'audio', id: m.id, data, rate: audio.sampling_rate, ms: Math.round(performance.now() - t) }, { transfer: [data.buffer] })
  } catch (err) {
    postMessage({ type: 'error', id: m.id, message: String((err as Error)?.message || err) })
  }
}
