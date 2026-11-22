// The backend as an Express app (no listen): used by server/index.js locally and by
// api/index.js as a Vercel Function. API reference: docs/api.md.
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { OLLAMA_URL, listModels, isInstalled, capabilities, chat, chatStream } from './ollama.js'
import { OCR_MODEL, readImage } from './ocr.js'
import { locateExercise, readPointedExercise } from './exercise.js'
import { makeAnimation } from './animate.js'
import { TUTOR_MODEL, TUTOR_MODELS, SEND_IMAGE, ACTIONS, MAX_TOKENS, buildMessages, thinkFor, thinkValue, profileOf } from './tutor.js'
import { parseDataUrl, BadRequest } from './images.js'
import { handle, newState, ENGINE_VERSION, previewScene } from './engine/session.js'
import { historyRecord, listHistory, loadSession, saveHistory, saveSession, sessionHistory, storeKindNow } from './store.js'
import { REVIEW_VERSION, suggestReview } from './engine/review.js'
import { studentSummaries } from './engine/students.js'

// EXERCISE_READER: "vision" (default; the tutor model reads the pointed exercise) or "ocr"
const EXERCISE_READER = (process.env.EXERCISE_READER || 'vision').toLowerCase()

const app = express()
app.use(express.json({ limit: '5mb' })) // Vercel Functions accept request bodies up to 4.5 MB

const fail = (res, err) => {
  if (err instanceof BadRequest) return res.status(400).json({ error: err.message })
  return res.status(502).json({ error: err.message })
}

// GET /api/health -> which models are installed and what they can do
app.get('/api/health', async (_req, res) => {
  try {
    const models = await listModels()
    const ocrReady = isInstalled(models, OCR_MODEL)
    const tutorModels = await Promise.all(
      TUTOR_MODELS.map(async (name) => {
        const ready = isInstalled(models, name)
        return { name, ready, capabilities: ready ? await capabilities(name) : [] }
      }),
    )
    const def = tutorModels[0]
    res.json({
      ok: ocrReady,
      ollama: true,
      // kept flat for the current page:
      model: OCR_MODEL,
      hasModel: ocrReady,
      ocr: { model: OCR_MODEL, ready: ocrReady },
      tutor: { model: def.name, ready: def.ready, capabilities: def.capabilities, sendImage: SEND_IMAGE, models: tutorModels },
    })
  } catch {
    res.json({
      ok: false,
      ollama: false,
      model: OCR_MODEL,
      hasModel: false,
      ocr: { model: OCR_MODEL, ready: false },
      tutor: { model: TUTOR_MODEL, ready: false, capabilities: [], sendImage: SEND_IMAGE, models: [] },
    })
  }
})

// POST /api/ocr { image, mode? } -> { text, ms, mode }
app.post('/api/ocr', async (req, res) => {
  try {
    const { base64 } = parseDataUrl(req.body?.image)
    res.json(await readImage(base64, req.body?.mode))
  } catch (err) {
    fail(res, err)
  }
})

// POST /api/exercise { page, point: {x, y}, read? } -> { box, blocks, found, image, text, ms }
// `page` is a JPEG of the flattened page; `point` is where the finger points (0-1).
app.post('/api/exercise', async (req, res) => {
  const started = Date.now()
  try {
    const { buffer } = parseDataUrl(req.body?.page, 'page')
    const point = req.body?.point
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      throw new BadRequest('"point" must be { x, y } with values between 0 and 1')
    }
    // method "vision" (default): the tutor's vision model reads the pointed exercise itself.
    // method "ocr": layout analysis finds the block, GLM-OCR reads it.
    const method = (req.body?.method || EXERCISE_READER) === 'ocr' ? 'ocr' : 'vision'
    const model = req.body?.model || TUTOR_MODEL
    if (!TUTOR_MODELS.includes(model)) throw new BadRequest(`"model" must be one of ${TUTOR_MODELS.join(', ')}`)
    if (method === 'vision' && (await capabilities(model)).includes('vision') && req.body?.read !== false) {
      const r = await readPointedExercise(buffer, point, model)
      return res.json({
        box: r.box,
        boxFrom: r.boxFrom,
        blocks: r.blocks,
        found: r.found,
        image: r.crop.dataUrl,
        text: r.text,
        method: 'vision',
        model,
        ms: Date.now() - started,
      })
    }
    const located = locateExercise(buffer, point)
    const result = {
      box: located.box,
      boxFrom: 'layout',
      blocks: located.blocks,
      found: located.found,
      image: located.crop.dataUrl,
      text: null,
      method: 'ocr',
      model: OCR_MODEL,
    }
    if (req.body?.read !== false) {
      const { base64 } = parseDataUrl(located.crop.dataUrl)
      result.text = (await readImage(base64, 'auto')).text
    }
    res.json({ ...result, ms: Date.now() - started })
  } catch (err) {
    fail(res, err)
  }
})

// POST /api/tutor { action, exercise: { text, image? }, work?, question?, history?, stream? }
// Streams NDJSON events (meta, thinking, delta, done, error), or JSON when stream is false.
app.post('/api/tutor', async (req, res) => {
  const body = req.body || {}
  const action = body.action
  if (!ACTIONS.includes(action)) return res.status(400).json({ error: `"action" must be one of ${ACTIONS.join(', ')}` })
  if (action === 'ask' && !body.question?.trim()) return res.status(400).json({ error: '"question" is required for ask' })

  // Which tutor model: body.model if it is one of TUTOR_MODELS, else the default.
  if (body.model && !TUTOR_MODELS.includes(body.model)) {
    return res.status(400).json({ error: `"model" must be one of ${TUTOR_MODELS.join(', ')}` })
  }
  const model = body.model || TUTOR_MODEL
  const caps = await capabilities(model)
  if (!caps.length) {
    return res.status(503).json({ error: `Tutor model "${model}" is not installed. Run: ollama pull ${model}` })
  }
  // Send the exercise photo too? Server default (TUTOR_IMAGE), overridable per request
  // with { sendImage: false } to give the model only the GLM-OCR text.
  const sendImage = typeof body.sendImage === 'boolean' ? body.sendImage : SEND_IMAGE

  let imageBase64 = null
  try {
    if (sendImage && body.exercise?.image && caps.includes('vision')) imageBase64 = parseDataUrl(body.exercise.image, 'exercise.image').base64
  } catch (err) {
    return fail(res, err)
  }

  const messages = buildMessages({
    action,
    exercise: body.exercise?.text || '',
    work: body.work || '',
    question: body.question || '',
    history: body.history,
    imageBase64,
  })
  // Reasoning: off by default (TUTOR_THINK); `think: true` in the body turns it on.
  const wantThink = typeof body.think === 'boolean' ? body.think : thinkFor(action)
  const think = caps.includes('thinking') ? thinkValue(model, wantThink) : undefined
  const options = {
    temperature: 0.6, // Qwen recommends ~0.6 (greedy can loop when thinking)
    num_ctx: 8192,
    num_predict: wantThink ? 8192 : MAX_TOKENS[action] + profileOf(model).hiddenTokens, // short answers
  }
  const started = Date.now()
  const meta = { model, action, think: wantThink, usedImage: Boolean(imageBase64) }

  if (body.stream === false) {
    try {
      const out = await chat({ model, messages, options, think })
      return res.json({ ...meta, text: out.content.trim(), thinking: out.thinking, ms: Date.now() - started })
    } catch (err) {
      return fail(res, err)
    }
  }

  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-cache',
    'X-Accel-Buffering': 'no',
  })
  const send = (ev) => res.write(`${JSON.stringify(ev)}\n`)
  const abort = new AbortController()
  res.on('close', () => abort.abort())

  send({ type: 'meta', ...meta })
  try {
    for await (const ev of chatStream({ model, messages, options, think, signal: abort.signal })) {
      if (ev.thinking) send({ type: 'thinking', text: ev.thinking })
      if (ev.content) send({ type: 'delta', text: ev.content })
      if (ev.done) send({ type: 'done', ms: Date.now() - started, ...ev.stats })
    }
  } catch (err) {
    if (!abort.signal.aborted) send({ type: 'error', error: err.message })
  }
  res.end()
})

// POST /api/animate { exercise: { text }, model? } -> { recipe, verified, ms, model }
// Kids animation recipe (chocolate / objects / number line). See server/animate.js.
app.post('/api/animate', async (req, res) => {
  const text = (req.body?.exercise?.text ?? req.body?.text ?? '').trim()
  if (!text) return res.status(400).json({ error: '"exercise.text" is required' })
  const model = req.body?.model || TUTOR_MODEL
  if (!TUTOR_MODELS.includes(model)) return res.status(400).json({ error: `"model" must be one of ${TUTOR_MODELS.join(', ')}` })
  try {
    const out = await makeAnimation(text, model)
    if (!out.recipe) return res.status(422).json({ error: out.error, ms: out.ms })
    res.json({ ...out, model })
  } catch (err) {
    fail(res, err)
  }
})

// POST /api/debug/frame { image, meta } -> saves a real camera frame + what the detector
// saw (paper outline, hand points) to debug-frames/<session>/, for tuning detection offline.
const DEBUG_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'debug-frames')
app.post('/api/debug/frame', async (req, res) => {
  if (process.env.VERCEL) return res.status(404).json({ error: 'not available on Vercel' })
  try {
    const { buffer } = parseDataUrl(req.body?.image)
    const session = String(req.body?.session || 'session').replace(/[^a-zA-Z0-9_-]/g, '')
    const name = String(req.body?.name || Date.now()).replace(/[^a-zA-Z0-9_-]/g, '')
    const dir = path.join(DEBUG_DIR, session)
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, `${name}.jpg`), buffer)
    await writeFile(path.join(dir, `${name}.json`), JSON.stringify(req.body?.meta ?? {}, null, 1))
    res.json({ saved: path.relative(process.cwd(), path.join(dir, `${name}.jpg`)) })
  } catch (err) {
    fail(res, err)
  }
})

// ---------------------------------------------------------------- Glimpse engine
// The Glimpse web app (web) talks to the engine through these routes. HTTP instead
// of a WebSocket, so it runs as a Vercel Function: each event is one request, the engine's
// replies are streamed back as NDJSON, and the session lives in the database in between.

// GET /api/engine/hello -> { type: 'hello', ... } (the web app checks this to go live)
// Answers at once: the web app waits only 1.5 s, and setting up the database on a cold start
// can take longer, so it is started here in the background, not waited for.
app.get('/api/engine/hello', (_req, res) => {
  res.json({ type: 'hello', version: ENGINE_VERSION, camera: false, store: storeKindNow() })
})

// Event fields the engine reads as text: strings of a sane length. NUL characters (which the
// database refuses) are dropped. A bad field is a 400, before anything is streamed or saved.
const TEXT_FIELDS = { type: 40, student: 100, name: 100, lang: 16, subject: 40, text: 1000, image: 6_000_000, id: 200 }
function checkEvent(event) {
  for (const [k, max] of Object.entries(TEXT_FIELDS)) {
    const v = event[k]
    if (v === undefined || v === null) continue
    if (typeof v !== 'string') return `"event.${k}" must be a string`
    if (v.length > max) return `"event.${k}" is too long (at most ${max} characters)`
    event[k] = v.replaceAll('\u0000', '').toWellFormed()
  }
  if (event.lang && !/^[a-z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(event.lang)) return '"event.lang" must be a language code, e.g. "en"'
  return null
}

// The events the web app sends (docs/protocol.md). Anything else is a 400.
const EVENTS = new Set(['session_start', 'subject', 'cut_part', 'check_sheet', 'explain', 'part_typed', 'confirm_reply', 'set_age', 'pick_exercise', 'ask_start', 'ask_end', 'question_typed', 'point', 'session_end'])
// Settings the web app keeps sending to the session on screen, also once it has ended (a new age
// in Settings): applied, they change nothing that was saved. Any other event after the end is
// refused: its work would not be in the session's summary and Practise again.
const SETTINGS = new Set(['set_age', 'subject', 'pick_exercise'])

// One event at a time per session: each one loads the session, changes it and saves it, so two
// at once (two tabs, another API client) would each save their own copy and one would be lost
// (and a part id given twice). In this process the events of a session wait for each other.
const queues = new Map()
function oneAtATime(sessionId, job) {
  const prev = queues.get(sessionId) ?? Promise.resolve()
  const run = prev.then(job, job)
  const tail = run.catch(() => {})
  queues.set(sessionId, tail)
  tail.then(() => queues.get(sessionId) === tail && queues.delete(sessionId))
  return run
}

// POST /api/engine { sessionId, event } -> NDJSON stream of engine events
app.post('/api/engine', async (req, res) => {
  const { sessionId, event } = req.body || {}
  if (typeof sessionId !== 'string' || !/^[\w-]{8,64}$/.test(sessionId)) return res.status(400).json({ error: '"sessionId" is required' })
  if (!event || typeof event !== 'object' || typeof event.type !== 'string') return res.status(400).json({ error: '"event" with a "type" is required' })
  const bad = checkEvent(event)
  if (bad) return res.status(400).json({ error: bad })
  if (!EVENTS.has(event.type)) return res.status(400).json({ error: `unknown event type "${event.type}"` })
  await oneAtATime(sessionId, async () => {
    const trouble = () => {
      res.write(`${JSON.stringify({ type: 'hint', hint: { text: "I'm having trouble thinking right now. Please try again in a moment.", lang: 'en' } })}\n`)
      res.end(`${JSON.stringify({ type: 'status', state: 'watching' })}\n`)
    }
    let state = null
    try {
      state = await loadSession(sessionId)
    } catch (err) {
      // the reason is logged, not shown (or read aloud) to the child
      console.warn('[engine] session not loaded:', err.message)
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache' })
      return trouble()
    }
    // A session is started once: session_start never replaces (wipes) a session that exists.
    if (event.type === 'session_start' && state) return res.status(409).json({ error: 'this session already exists: start a new one with a new "sessionId"' })
    // Every other event belongs to a session that was started (never one made up for "unknown").
    // Only a database in memory (on Vercel without DATABASE_URL) forgets sessions between
    // requests: there the event still gets a session of its own, as nothing is kept anyway.
    if (event.type !== 'session_start' && !state && storeKindNow() !== 'pglite-memory') return res.status(404).json({ error: 'no such session: start it with session_start' })
    if (state?.ended && event.type !== 'session_end' && !SETTINGS.has(event.type)) return res.status(409).json({ error: 'this session has ended: start a new one with a new "sessionId"' })
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' })
    const emit = (ev) => res.write(`${JSON.stringify(ev)}\n`)
    try {
      // Ending a session again: its summary as it was saved (with the "I did it" marks), not a new one
      if (event.type === 'session_end' && state.ended && state.summary) {
        const saved = await historyRecord(`${sessionId}:summary`).catch(() => null)
        emit({ type: 'summary', summary: saved?.kind === 'summary' && saved.data ? saved.data : state.summary })
        emit({ type: 'status', state: 'idle' })
        return res.end()
      }
      state ??= newState({ id: sessionId, student: event.student, name: event.name, lang: event.lang, subject: event.subject, age: Number(event.age) || null })
      state = await handle(state, event, emit)
      const records = state.history || []
      state.history = []
      await saveSession(state)
      await saveHistory(state.id, state.student, records).catch((err) => console.warn('[engine] history not saved:', err.message))
    } catch (err) {
      // the reason is logged, not shown (or read aloud) to the child
      console.warn(`[engine] ${event.type} failed:`, err.message)
      return trouble()
    }
    res.end()
  })
})

// GET /api/students -> dashboard summaries (StudentSummary[]) ; /api/students/:id -> one
app.get('/api/students', async (_req, res) => {
  try {
    res.json(await studentSummaries())
  } catch (err) {
    fail(res, err)
  }
})
app.get('/api/students/:id', async (req, res) => {
  try {
    const s = (await studentSummaries()).find((x) => x.id === req.params.id)
    return s ? res.json(s) : res.status(404).json({ error: 'no sessions for this student' })
  } catch (err) {
    fail(res, err)
  }
})

// GET /api/scene?text=3x%2B5%3D20&age=10 -> the animation Laya and the rules pick (for testing)
app.get('/api/scene', async (req, res) => {
  try {
    const text = String(req.query.text || '')
    if (text.length > 1000) return res.json({ kind: null }) // like the rules: too long to be one exercise
    res.json((await previewScene(text, req.query.age)) ?? { kind: null })
  } catch (err) {
    fail(res, err)
  }
})

// GET /api/history?student=amara&kinds=line,question&limit=100&before=<ms>&beforeRef=<ref> -> newest records first
app.get('/api/history', async (req, res) => {
  const { student, beforeRef } = req.query
  // one student (a repeated ?student= must not widen the answer to every student)
  if (student !== undefined && typeof student !== 'string') return res.status(400).json({ error: '"student" must be one student id' })
  if (beforeRef !== undefined && typeof beforeRef !== 'string') return res.status(400).json({ error: '"beforeRef" must be one ref' })
  try {
    const kinds = [req.query.kinds ?? []].flat().flatMap((k) => String(k).split(',')).filter(Boolean) // kinds=a,b or kinds=a&kinds=b
    const records = await listHistory({
      student: student || undefined,
      kinds: kinds.length ? kinds : undefined,
      limit: Number(req.query.limit) || 100, // clamped to 1-500 by listHistory
      before: Number(req.query.before) || undefined,
      beforeRef,
    })
    res.json(records)
  } catch (err) {
    fail(res, err)
  }
})
// GET /api/history/sessions/:id -> everything recorded in one session, in order
app.get('/api/history/sessions/:id', async (req, res) => {
  try {
    res.json(await sessionHistory(req.params.id))
  } catch (err) {
    fail(res, err)
  }
})

// ---------- practise again: the exercises suggested after each finished session ----------

// A session that ended before suggestions existed (or with older ones): made now from its saved
// lines and questions, its subject and the exercises Glim solved in it, as at the end of the
// session. The tutor's ideas can't be asked for again: the ones it gave then are kept.
async function reviewForSession(sessionId, old = []) {
  const records = await sessionHistory(sessionId)
  const lines = records.filter((r) => r.kind === 'line').map((r) => ({ latex: String(r.data?.latex ?? ''), verdict: r.data?.verdict, note: r.data?.note ?? null }))
  const questions = records.filter((r) => r.kind === 'question').map((r) => ({ about: r.data?.about ?? null }))
  const state = await loadSession(sessionId).catch(() => null)
  const ideas = (Array.isArray(old) ? old : []).filter((x) => x?.level === 'idea' && typeof x.exercise === 'string').map((x) => ({ exercise: x.exercise, why: String(x.why ?? '') }))
  return suggestReview({ seed: sessionId, lines, questions, ideas, solved: Array.isArray(state?.solved) ? state.solved : [], subject: state?.subject || 'maths', age: Number(state?.age) || null })
}

// GET /api/review?student=amara -> newest session first:
// [{ ref, sessionId, at, title, items: [{ id, exercise, level, why, kind, answer, scene, done? }] }]
app.get('/api/review', async (req, res) => {
  const { student } = req.query
  if (typeof student !== 'string' || !student) return res.status(400).json({ error: '"student" must be one student id' })
  try {
    const summaries = await listHistory({ student, kinds: ['summary'], limit: 100 })
    const out = []
    for (const r of summaries) {
      let items = Array.isArray(r.data?.review) ? r.data.review : null
      // none yet (the session ended before there were suggestions), or older ones nobody started on
      if (!items || (r.data.reviewVersion !== REVIEW_VERSION && !items.some((x) => x?.done))) {
        items = await reviewForSession(r.sessionId, items ?? [])
        await saveHistory(r.sessionId, r.studentId, [{ ref: r.ref, kind: 'summary', at: r.at, data: { ...r.data, review: items, reviewVersion: REVIEW_VERSION } }]) // kept: the same ones next time
      }
      out.push({ ref: r.ref, sessionId: r.sessionId, at: r.at, title: String(r.data?.title ?? ''), items, subject: r.data?.subject ?? 'maths' })
    }
    res.json(out)
  } catch (err) {
    fail(res, err)
  }
})

// POST /api/review/done { ref, id, done } -> "I did it" on one exercise, saved with its session
app.post('/api/review/done', async (req, res) => {
  const { ref, id, done } = req.body ?? {}
  if (typeof ref !== 'string' || typeof id !== 'string' || typeof done !== 'boolean') return res.status(400).json({ error: 'expected { ref, id, done: true or false }' })
  try {
    const r = await historyRecord(ref)
    const items = r?.kind === 'summary' && Array.isArray(r.data?.review) ? r.data.review : null
    if (!items?.some((x) => x?.id === id)) return res.status(404).json({ error: 'no such exercise' })
    const review = items.map((x) => (x?.id === id ? { ...x, done, doneAt: done ? Date.now() : null } : x))
    await saveHistory(r.sessionId, r.studentId, [{ ref, kind: 'summary', at: r.at, data: { ...r.data, review } }])
    res.json({ ok: true, done })
  } catch (err) {
    fail(res, err)
  }
})

// Bad JSON, or a body over the size limit: a JSON error like the routes' own (never Express's
// HTML page, which shows a stack trace with the server's paths).
app.use((err, _req, res, next) => {
  if (res.headersSent) return next(err)
  const status = err.status >= 400 && err.status < 500 ? err.status : 500
  if (status === 500) console.warn('[server]', err.message)
  const error = err.type === 'entity.too.large' ? 'request too large' : err.type === 'entity.parse.failed' ? 'the request body is not valid JSON' : status < 500 ? 'bad request' : 'server error'
  res.status(status).json({ error })
})

export default app
