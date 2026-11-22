// One way to call models, locally or in the cloud.
//
// Each ROLE (ocr, tutor) has its own provider, so e.g. OCR can stay local while the tutor
// uses a cloud API:
//   provider "ollama" (default): local Ollama, http://127.0.0.1:11434
//   provider "openai": any OpenAI-compatible chat-completions API (OpenRouter, Groq,
//                      Cerebras, Together, Z.ai, Ollama's own /v1, ...)
//
// Environment (role = OCR or TUTOR; AI_* is the fallback for both):
//   <ROLE>_PROVIDER   ollama | openai          (default: openai if <ROLE>_BASE_URL/AI_BASE_URL is set)
//   <ROLE>_BASE_URL   e.g. https://openrouter.ai/api/v1
//   <ROLE>_API_KEY    the provider's key (never sent to the browser)
//   <ROLE>_MODEL      model id at that provider (defaults: glm-ocr / qwen3.5 for Ollama)
//   <ROLE>_EXTRA_BODY JSON merged into every request, e.g. {"provider":{"sort":"latency"}}
//   <ROLE>_THINK_OFF  JSON merged when reasoning should be off. Providers spell it
//                     differently: {"reasoning_effort":"none"} (OpenAI-style, Groq, Ollama /v1),
//                     {"reasoning":{"enabled":false}} (OpenRouter). Default: nothing sent.
//   <ROLE>_TIMEOUT_MS how long one model call may take (default 120000; 45000 on Vercel,
//                     whose function stops at 60 s), then the child gets the "try again" message.
// A role with its own <ROLE>_BASE_URL (another provider) doesn't get AI_API_KEY, AI_EXTRA_BODY
// or AI_THINK_OFF: those belong to the AI_BASE_URL provider.
import { chat as ollamaChat, chatStream as ollamaStream, OLLAMA_URL } from './ollama.js'

const DEFAULT_MODEL = { ocr: 'glm-ocr', tutor: 'qwen3.5' }
const PROVIDERS = ['ollama', 'openai']
const trimUrl = (u) => u?.replace(/\/+$/, '')

export function roleConfig(role) {
  const R = role.toUpperCase()
  const env = (k) => process.env[`${R}_${k}`] ?? process.env[`AI_${k}`]
  const baseUrl = env('BASE_URL')
  const ownUrl = process.env[`${R}_BASE_URL`]
  const sameProvider = ownUrl === undefined || trimUrl(ownUrl) === trimUrl(process.env.AI_BASE_URL)
  const shared = (k) => (sameProvider ? env(k) : process.env[`${R}_${k}`])
  const provider = String(env('PROVIDER') || '').trim().toLowerCase() || (baseUrl ? 'openai' : 'ollama')
  if (!PROVIDERS.includes(provider)) throw new Error(`${R}_PROVIDER / AI_PROVIDER is "${env('PROVIDER')}": it must be ollama or openai`)
  const json = (k) => {
    const v = shared(k)
    if (!v) return undefined
    try {
      return JSON.parse(v)
    } catch {
      throw new Error(`${R}_${k} / AI_${k} must be JSON`)
    }
  }
  return {
    role,
    provider,
    baseUrl: trimUrl(baseUrl),
    apiKey: shared('API_KEY'),
    extraBody: json('EXTRA_BODY'),
    thinkOff: json('THINK_OFF'),
    model: process.env[`${R}_MODEL`] || (provider === 'ollama' ? DEFAULT_MODEL[role] : process.env.AI_MODEL) || DEFAULT_MODEL[role],
    timeoutMs: Number(env('TIMEOUT_MS')) || (process.env.VERCEL ? 45000 : 120000),
  }
}

// The JSON object in a model's text: strict JSON, else a ```json fence, else the first {...}
// in the prose that parses (LaTeX braces like \frac{1}{2}, <think> notes and remarks after
// the JSON are skipped). Prefers an object with the schema's keys. null when there is none.
function closingBrace(s, start) {
  let depth = 0
  let inString = false
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (inString) {
      if (c === '\\') i++
      else if (c === '"') inString = false
    } else if (c === '"') inString = true
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) return i
  }
  return -1
}
function extractJson(text, schema) {
  try {
    return JSON.parse(text)
  } catch {
    // some providers wrap JSON in prose or ```
  }
  const body = String(text).replace(/<think>[\s\S]*?<\/think>/g, '')
  const fence = body.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) {
    try {
      return JSON.parse(fence[1])
    } catch {
      // not JSON inside the fence: look further
    }
  }
  const keys = Object.keys(schema?.properties || {})
  let other = null
  for (let i = body.indexOf('{'), tries = 0; i >= 0 && tries < 50; i = body.indexOf('{', i + 1), tries++) {
    const end = closingBrace(body, i)
    if (end < 0) continue
    try {
      const v = JSON.parse(body.slice(i, end + 1))
      if (!v || typeof v !== 'object' || Array.isArray(v) || !Object.keys(v).length) continue
      if (!keys.length || keys.some((k) => k in v)) return v
      other ??= v
    } catch {
      // LaTeX or prose in braces
    }
  }
  return other
}

// GLM-OCR in the cloud: Z.ai's layout parsing (POST <base>/layout_parsing, model glm-ocr), the same
// model as Ollama's glm-ocr locally. Its answer is the page as Markdown (md_results).
// OCR_BASE_URL=https://api.z.ai/api/paas/v4, OCR_API_KEY=<Z.ai key>, OCR_MODEL=glm-ocr.
export const isLayoutParsing = (cfg) => cfg.provider !== 'ollama' && /glm-ocr/i.test(cfg.model || '') && (/z\.ai|bigmodel\.cn/i.test(cfg.baseUrl || '') || process.env.OCR_LAYOUT_PARSING === '1')
export async function layoutParse(role, base64, { signal } = {}) {
  const cfg = roleConfig(role)
  const started = Date.now()
  const timeout = AbortSignal.timeout(cfg.timeoutMs)
  const where = `${cfg.baseUrl}/layout_parsing`
  const send = async (file) => {
    const r = await fetch(where, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model: cfg.model, file }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
    const raw = await r.text()
    let out = null
    try {
      out = JSON.parse(raw)
    } catch {
      // not JSON: reported below
    }
    return { ok: r.ok, status: r.status, out, raw }
  }
  try {
    // the docs say "URL and base64": a data URL first, the bare base64 if that is refused
    let res = await send(`data:image/jpeg;base64,${base64}`)
    if (!res.ok && res.status >= 400 && res.status < 500) res = await send(base64)
    if (!res.ok) throw new Error(`${role} model error ${res.status}: ${res.raw.slice(0, 300)}`)
    const md = res.out?.md_results ?? res.out?.data?.md_results
    if (typeof md !== 'string') throw new Error(`${role} model at ${where} gave no md_results: ${res.raw.slice(0, 160)}`)
    return { text: md, model: cfg.model, provider: 'zai', ms: Date.now() - started }
  } catch (err) {
    if (timeout.aborted) throw new Error(`${role} model timed out after ${cfg.timeoutMs / 1000} s (${where})`, { cause: err })
    throw err
  }
}

// onText is the caller's: a mistake in it never breaks the answer
function tell(onText, text) {
  try {
    onText(text)
  } catch (err) {
    console.warn('[llm] onText:', err.message)
  }
}
// An OpenAI-style stream ("data: {choices: [{delta: {content}}]}" ... "data: [DONE]") -> the same
// shape as a whole answer: { choices: [{ message: { content }, finish_reason }] } (or { error }).
async function readEvents(r, onText) {
  const decoder = new TextDecoder()
  let buf = ''
  let text = ''
  let finish = null
  for await (const chunk of r.body) {
    buf += decoder.decode(chunk, { stream: true })
    let nl
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (data === '[DONE]') continue
      let ev
      try {
        ev = JSON.parse(data)
      } catch {
        continue
      }
      if (ev.error) return { error: ev.error }
      const c = ev.choices?.[0]
      if (c?.finish_reason) finish = c.finish_reason
      const piece = c?.delta?.content
      if (typeof piece === 'string' && piece) {
        text += piece
        tell(onText, text)
      }
    }
  }
  return { choices: [{ message: { content: text }, finish_reason: finish }] }
}

// messages: [{ role, content, images?: [base64 JPEG] }]
// schema:   optional JSON schema -> structured output; the result is parsed into `json`.
// think:    false = no reasoning (Ollama `think`; ignored by other providers unless they
//           understand it), true = allow reasoning.
// onText:   optional; the answer is streamed and onText(textSoFar) is called as it is written
//           (to show the start of a long answer early). The result is the same as without it.
// Throws (with the role and where it went wrong) when the model can't be reached, takes longer
// than <ROLE>_TIMEOUT_MS, answers with an error, or gives no answer: callers then tell the
// child to try again, and log the reason.
export async function complete(role, { messages, schema, maxTokens = 800, temperature = 0.3, think = false, model, signal, onText } = {}) {
  const cfg = roleConfig(role)
  const m = model || cfg.model
  const started = Date.now()
  const timeout = AbortSignal.timeout(cfg.timeoutMs)
  const sig = signal ? AbortSignal.any([signal, timeout]) : timeout
  const where = cfg.provider === 'ollama' ? `${OLLAMA_URL}/api/chat` : `${cfg.baseUrl}/chat/completions`
  const failed = (err) => {
    if (signal?.aborted) return err // the caller cancelled
    if (timeout.aborted) return new Error(`${role} model timed out after ${cfg.timeoutMs / 1000} s (${where})`, { cause: err })
    if (err instanceof TypeError && err.message === 'fetch failed') {
      return new Error(`${role} model unreachable at ${where}: ${err.cause?.code || err.cause?.message || err.message}`, { cause: err })
    }
    return err
  }
  let text
  if (cfg.provider === 'ollama') {
    const req = { model: m, messages, think, format: schema, signal: sig, options: { temperature, num_ctx: 8192, num_predict: maxTokens } }
    try {
      if (onText) {
        text = ''
        for await (const piece of ollamaStream(req)) {
          if (!piece.content) continue
          text += piece.content
          tell(onText, text)
        }
      } else text = (await ollamaChat(req)).content
    } catch (err) {
      throw failed(err)
    }
  } else {
    if (!cfg.baseUrl) throw new Error(`${role}: set ${role.toUpperCase()}_BASE_URL (or AI_BASE_URL) for provider "openai"`)
    const body = {
      model: m,
      max_tokens: maxTokens,
      temperature,
      messages: messages.map((msg) => ({
        role: msg.role,
        content: msg.images?.length
          ? [
              { type: 'text', text: msg.content },
              ...msg.images.map((b64) => ({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } })),
            ]
          : msg.content,
      })),
    }
    if (schema) body.response_format = { type: 'json_schema', json_schema: { name: 'output', schema, strict: false } }
    Object.assign(body, cfg.extraBody, think ? {} : cfg.thinkOff)
    if (onText) body.stream = true
    let out
    try {
      const r = await fetch(where, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}) },
        body: JSON.stringify(body),
        signal: sig,
      })
      // streamed (server-sent events): the pieces of the answer, put back together as one answer
      if (onText && r.ok && /event-stream/.test(r.headers.get('content-type') || '')) out = await readEvents(r, onText)
      const raw = out ? '' : await r.text()
      if (!r.ok) throw new Error(`${role} model error ${r.status}: ${raw.slice(0, 300)}`)
      if (!out) {
        try {
          out = JSON.parse(raw)
        } catch {
          throw new Error(`${role} model at ${where} didn't answer with JSON: ${raw.slice(0, 120)}`)
        }
      }
    } catch (err) {
      throw failed(err)
    }
    // Some providers answer 200 with an error, or with no content (e.g. reasoning used up max_tokens).
    if (out?.error) throw new Error(`${role} model error: ${out.error.message || JSON.stringify(out.error).slice(0, 300)}`)
    const choice = out?.choices?.[0]
    if (!choice) throw new Error(`${role} model gave no answer`)
    const content = choice.message?.content
    // content can also be a list of parts: [{ type: 'text', text }]
    text = Array.isArray(content) ? content.map((p) => (typeof p === 'string' ? p : p?.type === 'text' ? p.text || '' : '')).join('') : content ?? ''
    if (!String(text).trim() && /length|max_tokens|content_filter|error/.test(choice.finish_reason || '')) {
      throw new Error(`${role} model gave no answer (finish_reason ${choice.finish_reason})`)
    }
  }
  if (schema && !String(text || '').trim()) throw new Error(`${role} model gave an empty answer`)
  const json = schema ? extractJson(text, schema) : undefined
  return { text: String(text || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim(), json, model: m, provider: cfg.provider, ms: Date.now() - started }
}
