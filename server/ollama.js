// Thin client for the local Ollama API.
export const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434'

export async function listModels() {
  const r = await fetch(`${OLLAMA_URL}/api/tags`)
  if (!r.ok) throw new Error(`Ollama /api/tags ${r.status}`)
  return (await r.json()).models || []
}

// "qwen3.5" means "qwen3.5:latest" to Ollama.
export function isInstalled(models, name) {
  return models.some((m) => m.name === name || m.name === `${name}:latest`)
}

const capsCache = new Map()

// e.g. ["completion", "vision", "thinking", "tools"]; [] if the model isn't installed.
export async function capabilities(model) {
  if (capsCache.has(model)) return capsCache.get(model)
  try {
    const r = await fetch(`${OLLAMA_URL}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
    })
    if (!r.ok) return []
    const caps = (await r.json()).capabilities || ['completion']
    capsCache.set(model, caps)
    return caps
  } catch {
    return []
  }
}

function chatBody({ model, messages, options, think, stream, format }) {
  const body = { model, messages, stream, keep_alive: '30m', options }
  if (think !== undefined) body.think = think
  if (format !== undefined) body.format = format // JSON schema -> structured output
  return JSON.stringify(body)
}

async function post(path, body, signal) {
  const r = await fetch(`${OLLAMA_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal,
  })
  if (!r.ok) throw new Error(`Ollama error ${r.status}: ${await r.text()}`)
  return r
}

// One-shot chat. Returns { content, thinking, stats }. `format`: optional JSON schema.
export async function chat({ model, messages, options = {}, think, signal, format }) {
  const r = await post('/api/chat', chatBody({ model, messages, options, think, stream: false, format }), signal)
  const out = await r.json()
  return {
    content: out.message?.content || '',
    thinking: out.message?.thinking || '',
    stats: { evalCount: out.eval_count, totalMs: Math.round((out.total_duration || 0) / 1e6) },
  }
}

// Streaming chat. Yields { thinking } / { content } pieces, then { done, stats }.
export async function* chatStream({ model, messages, options = {}, think, signal, format }) {
  const r = await post('/api/chat', chatBody({ model, messages, options, think, stream: true, format }), signal)
  const decoder = new TextDecoder()
  let buf = ''
  for await (const chunk of r.body) {
    buf += decoder.decode(chunk, { stream: true })
    let nl
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line) continue
      const ev = JSON.parse(line)
      if (ev.error) throw new Error(ev.error)
      if (ev.message?.thinking) yield { thinking: ev.message.thinking }
      if (ev.message?.content) yield { content: ev.message.content }
      if (ev.done) yield { done: true, stats: { evalCount: ev.eval_count, totalMs: Math.round((ev.total_duration || 0) / 1e6) } }
    }
  }
}
