// Speech to text on this computer: Whisper (OpenAI's open model, base size), run in this worker
// with transformers.js. English uses whisper-base.en; other languages the multilingual base.
// The model (~80-200 MB) downloads once from Hugging Face and stays in the browser's cache.
import { pipeline } from '@huggingface/transformers'

type Asr = (audio: Float32Array, options?: Record<string, unknown>) => Promise<{ text: string } | { text: string }[]>
const loaded = new Map<string, Promise<Asr>>()

async function hasWebGpu() {
  const gpu = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu
  return !!(gpu && (await gpu.requestAdapter().catch(() => null)))
}

function load(model: string) {
  let p = loaded.get(model)
  if (p) return p
  p = (async () => {
    const webgpu = await hasWebGpu()
    const files: Record<string, { loaded: number; total: number }> = {}
    const progress_callback = (e: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (e.status !== 'progress' || !e.file) return
      files[e.file] = { loaded: e.loaded ?? 0, total: e.total ?? 0 }
      const all = Object.values(files)
      const total = all.reduce((s, f) => s + f.total, 0)
      if (total) postMessage({ type: 'progress', share: all.reduce((s, f) => s + f.loaded, 0) / total })
    }
    const options = webgpu
      ? { device: 'webgpu', dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' }, progress_callback }
      : { device: 'wasm', dtype: 'q8', progress_callback }
    const asr = (await pipeline('automatic-speech-recognition', model, options as never)) as unknown as Asr
    await asr(new Float32Array(16000)) // warm up (the first run compiles the GPU code)
    postMessage({ type: 'ready', device: webgpu ? 'webgpu' : 'wasm' })
    return asr
  })()
  p.catch((err) => {
    loaded.delete(model)
    postMessage({ type: 'failed', message: String(err?.message || err) })
  })
  loaded.set(model, p)
  return p
}

self.onmessage = async (e: MessageEvent<{ type: 'load'; model: string } | { type: 'hear'; id: number; model: string; audio: Float32Array; language?: string }>) => {
  const m = e.data
  if (m.type === 'load') return void load(m.model).catch(() => {})
  try {
    const asr = await load(m.model)
    const t = performance.now()
    const out = await asr(m.audio, m.language ? { language: m.language, task: 'transcribe' } : {})
    const text = Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text
    postMessage({ type: 'text', id: m.id, text, ms: Math.round(performance.now() - t) })
  } catch (err) {
    postMessage({ type: 'error', id: m.id, message: String((err as Error)?.message || err) })
  }
}
