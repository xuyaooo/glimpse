// Regressions for the server / OCR text / models / database / dashboard fixes (QA group G3b).
// Self-contained: its own database (PGlite in a temp folder), mock model servers, no Ollama/Laya.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import katex from 'katex'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const TMP = mkdtempSync(path.join(os.tmpdir(), 'glimpse-qa-g3b-'))
process.env.PGLITE_DIR = path.join(TMP, 'pg')
process.env.ENGINE_DEBUG = '0'
process.env.DECIDE_URL = 'http://127.0.0.1:9'
process.env.OLLAMA_URL = 'http://127.0.0.1:9'
delete process.env.DATABASE_URL
delete process.env.POSTGRES_URL
delete process.env.VERCEL
for (const k of Object.keys(process.env)) if (/^(AI|OCR|TUTOR)_/.test(k)) delete process.env[k]

const { normalizeOcrMath, isBareMathLine } = await import('../server/ocrText.js')
const { toSegments, stripMath, cleanOcrLines } = await import('../server/engine/reader.js')
const { complete, roleConfig } = await import('../server/llm.js')
const store = await import('../server/store.js')
const { studentSummaries } = await import('../server/engine/students.js')
const { newState } = await import('../server/engine/session.js')
const { default: app } = await import('../server/app.js')

const server = await new Promise((r) => {
  const s = app.listen(0, '127.0.0.1', () => r(s))
})
const BASE = `http://127.0.0.1:${server.address().port}`
after(() => {
  server.close()
  rmSync(TMP, { recursive: true, force: true })
})

const renders = (tex) => {
  katex.renderToString(tex, { throwOnError: true, strict: 'ignore' })
  return true
}
const pipe = (t) => cleanOcrLines(normalizeOcrMath(t))
const engine = async (sessionId, event) => {
  const r = await fetch(`${BASE}/api/engine`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, event }) })
  const text = await r.text()
  return { status: r.status, text, events: r.ok ? text.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [] }
}
const uid = (p) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

// ---------------------------------------------------------------- OCR text

test('a whole-page $$ block (fenced by $$ or \\[ \\] lines) stays maths', () => {
  for (const t of ['$$\n\\frac{1}{2}+\\frac{1}{3}=\\frac{5}{6}\n$$', '\\[\n\\frac{1}{2}+\\frac{1}{3}=\\frac{5}{6}\n\\]']) {
    const lines = pipe(t)
    assert.equal(lines.length, 1)
    assert.deepEqual(toSegments(lines[0]), [{ t: 'math', v: '\\frac{1}{2}+\\frac{1}{3}=\\frac{5}{6}' }])
    assert.equal(stripMath(lines[0]), '\\frac{1}{2}+\\frac{1}{3}=\\frac{5}{6}')
  }
  // seen live (GLM-OCR): an integral in a display block
  const [line] = pipe('$$\n\\int_ {0} ^ {1} \\frac {1}{1+x} d x =\n$$')
  assert.ok(renders(stripMath(line)))
  assert.equal(toSegments(line)[0].t, 'math')
  // a multi-line environment stays one formula
  const arr = pipe('$$\n\\begin{array}{l}\nx=1 \\\\\ny=2\n\\end{array}\n$$')
  assert.deepEqual(arr, ['$$\\begin{array}{l} x=1 \\\\ y=2 \\end{array}$$'])
})

test('lines already in \\( \\) or \\[ \\] are not wrapped in $ again', () => {
  for (const t of ['\\(3x+4=10\\)', '\\[x^2=4\\]', '\\[\\frac{3}{4}+\\frac{1}{2}=\\frac{5}{4}\\]']) {
    assert.equal(isBareMathLine(t), false)
    assert.equal(normalizeOcrMath(t), t)
    assert.equal(toSegments(t)[0].t, 'math')
    assert.ok(!/\\[([]/.test(toSegments(t)[0].v))
  }
})

test('bare maths between two display blocks is still wrapped; one block is left alone', () => {
  assert.equal(normalizeOcrMath('$$\\int_0^1 x dx$$\ny^{2}=4\n$$= \\frac{1}{2}$$'), '$$\\int_0^1 x dx$$\n$y^{2}=4$\n$$= \\frac{1}{2}$$')
  assert.equal(normalizeOcrMath('$$\n\\begin{array}{l} x=1 \\end{array}\n$$'), '$$\n\\begin{array}{l} x=1 \\end{array}\n$$')
  assert.equal(normalizeOcrMath('$$\\begin{array}{l}\nx=1\\\\\ny=2\n\\end{array}$$'), '$$\\begin{array}{l}\nx=1\\\\\ny=2\n\\end{array}$$')
})

test('a short word before the maths stays text ("So x = 3" is not "Sox=3")', () => {
  assert.equal(normalizeOcrMath('So x = 3'), 'So $x = 3$')
  assert.equal(normalizeOcrMath('Let x = 2'), 'Let $x = 2$')
  assert.equal(normalizeOcrMath('x = 5'), '$x = 5$')
  assert.equal(normalizeOcrMath('a_1 + a_2'), '$a_1 + a_2$')
  assert.equal(normalizeOcrMath('Area = 50 cm'), 'Area = 50 cm')
})

test('stripMath escapes text so every learner line renders in KaTeX', () => {
  for (const t of ['∫₀^4 1/4 dx = _____', 'Find 20% of $60$', 'Q#3: $2+2=4$', 'PAPER & CO.', '50% of 20 = 10', 'x^2 = 4 is it', 'x_1 + x_2 = 5 yes', 'a ~ b', '√9 = 3 ≤ 4 ≠ 5 → ∑ ∞']) {
    assert.ok(renders(stripMath(t)), t)
  }
  assert.equal(stripMath('Find 20% of $60$'), '\\text{Find 20\\% of } 60')
  assert.ok(katex.renderToString(stripMath('50% of 20 = 10')).includes('%'))
})

test('escaped dollars are money, not maths', () => {
  assert.deepEqual(toSegments('Tom has \\$5 and gets \\$3 more: $5+3=8$'), [
    { t: 'text', v: 'Tom has $5 and gets $3 more: ' },
    { t: 'math', v: '5+3=8' },
  ])
  assert.ok(renders(stripMath('Tom has \\$5 and gets \\$3 more: $5+3=8$')))
})

test('toSegments keeps its old results and runs in linear time', () => {
  assert.deepEqual(toSegments('Solve: $2x+5=11$'), [
    { t: 'text', v: 'Solve: ' },
    { t: 'math', v: '2x+5=11' },
  ])
  assert.deepEqual(toSegments('a \\(x\\) b \\[y\\] c $$z$$').map((s) => s.v), ['a ', 'x', ' b ', 'y', ' c ', 'z'])
  assert.deepEqual(toSegments('cost $5 today'), [{ t: 'text', v: 'cost $5 today' }])
  const t0 = performance.now()
  stripMath('\\('.repeat(100000))
  toSegments('$$'.repeat(50000) + 'x')
  toSegments('\\['.repeat(100000))
  assert.ok(performance.now() - t0 < 1000, `${Math.round(performance.now() - t0)} ms`)
})

test('OCR loops are dropped without losing the lines read before them', () => {
  assert.deepEqual(cleanOcrLines('$2+2=4$\n$3+3=6$\n' + 'S\n'.repeat(40)), ['$2+2=4$', '$3+3=6$'])
  assert.deepEqual(cleanOcrLines('S\n'.repeat(300)), [])
  assert.deepEqual(cleanOcrLines('S'.repeat(300)), [])
  assert.deepEqual(cleanOcrLines(Array(100).fill('$S$').join(' ')), [])
  assert.deepEqual(cleanOcrLines('$1+1=2$\n$1+1=2$\n$22+22=44$'), ['$1+1=2$', '$22+22=44$'])
})

test("GLM-OCR's markdown fences are not page lines", () => {
  assert.deepEqual(cleanOcrLines('```markdown\n\n```'), [])
  assert.deepEqual(cleanOcrLines('```'), [])
  assert.deepEqual(cleanOcrLines('```markdown\n$1+1=2$\n```'), ['$1+1=2$'])
})

// ---------------------------------------------------------------- models (mock provider)

async function mockProvider() {
  const state = { reply: null, got: [] }
  const srv = http.createServer((req, res) => {
    let b = ''
    req.on('data', (c) => (b += c))
    req.on('end', () => {
      state.got.push({ auth: req.headers.authorization, body: JSON.parse(b || '{}') })
      if (state.reply === 'hang') return
      if (state.reply === 'html') return res.end('<html>hi</html>')
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(state.reply))
    })
  })
  await new Promise((r) => srv.listen(0, '127.0.0.1', r))
  state.url = `http://127.0.0.1:${srv.address().port}/v1`
  state.close = () => {
    srv.closeAllConnections()
    srv.close()
  }
  return state
}
function withEnv(vars, fn) {
  const old = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]))
  for (const [k, v] of Object.entries(vars)) v === undefined ? delete process.env[k] : (process.env[k] = v)
  const restore = () => {
    for (const [k, v] of Object.entries(old)) v === undefined ? delete process.env[k] : (process.env[k] = v)
  }
  return Promise.resolve().then(fn).finally(restore)
}
const ask = (role = 'tutor', extra = {}) => complete(role, { messages: [{ role: 'user', content: 'x' }], ...extra })
const SCHEMA = { type: 'object', properties: { text: { type: 'string' }, a: { type: 'number' } } }

test('model JSON is found in prose, fences and <think> notes, or is null (never a crash)', async () => {
  const m = await mockProvider()
  await withEnv({ AI_BASE_URL: m.url }, async () => {
    const cases = [
      ['Find a common denominator: \\frac{1}{2} is \\frac{3}{6}, so \\frac{5}{6}.', null],
      ['For \\frac{1}{2} + \\frac{1}{3}: {"text":"5/6"}', { text: '5/6' }],
      ['```json\n{"text":"3/6 + 2/6 = 5/6"}\n```\nHere \\frac{1}{2} became \\frac{3}{6}.', { text: '3/6 + 2/6 = 5/6' }],
      ['{"a":7}\nNote: {done}', { a: 7 }],
      ['<think>f(x) = {x+1}</think>{"a":6}', { a: 6 }],
      ['{"text": "cut off', null],
    ]
    for (const [content, json] of cases) {
      m.reply = { choices: [{ message: { content }, finish_reason: 'stop' }] }
      const out = await ask('tutor', { schema: SCHEMA })
      assert.deepEqual(out.json ?? null, json, content)
    }
    m.reply = { choices: [{ message: { content: '<think>hmm {x}</think>Five sixths.' }, finish_reason: 'stop' }] }
    assert.equal((await ask()).text, 'Five sixths.')
  }).finally(m.close)
})

test('a 200 answer with an error or with no content is an error; content parts are joined', async () => {
  const m = await mockProvider()
  await withEnv({ AI_BASE_URL: m.url }, async () => {
    m.reply = { error: { message: 'Provider returned error', code: 429 } }
    await assert.rejects(ask(), /Provider returned error/)
    m.reply = { choices: [{ message: { content: '', reasoning: '...' }, finish_reason: 'length' }] }
    await assert.rejects(ask(), /finish_reason length/)
    m.reply = { choices: [{ message: { content: '' }, finish_reason: 'stop' }] }
    await assert.rejects(ask('tutor', { schema: SCHEMA }), /empty/)
    assert.equal((await ask('ocr')).text, '') // a blank page read by OCR is not an error
    m.reply = { choices: [{ message: { content: [{ type: 'text', text: '{"text":"Make the bottoms the same: 5/6."}' }] }, finish_reason: 'stop' }] }
    const out = await ask('tutor', { schema: SCHEMA })
    assert.equal(out.json.text, 'Make the bottoms the same: 5/6.')
    assert.ok(!out.text.includes('[object'))
  }).finally(m.close)
})

test('a stalled model call times out with a clear message; the caller can still cancel', async () => {
  const m = await mockProvider()
  m.reply = 'hang'
  await withEnv({ AI_BASE_URL: m.url, AI_TIMEOUT_MS: '300' }, async () => {
    const t0 = Date.now()
    await assert.rejects(ask(), /tutor model timed out after 0\.3 s/)
    assert.ok(Date.now() - t0 < 3000)
    const ac = new AbortController()
    setTimeout(() => ac.abort(), 50)
    await assert.rejects(ask('tutor', { signal: ac.signal }), { name: 'AbortError' })
  }).finally(m.close)
  await withEnv({ TUTOR_TIMEOUT_MS: '200' }, () => assert.equal(roleConfig('tutor').timeoutMs, 200))
})

test("a role with its own provider URL doesn't get the main provider's key or fields", async () => {
  const m = await mockProvider()
  m.reply = { choices: [{ message: { content: 'x' }, finish_reason: 'stop' }] }
  const main = { AI_BASE_URL: m.url, AI_API_KEY: 'sk-MAIN', AI_EXTRA_BODY: '{"provider":{"sort":"latency"}}', AI_THINK_OFF: '{"reasoning":{"enabled":false}}', OCR_MODEL: 'vision' }
  await withEnv({ ...main, OCR_BASE_URL: m.url.replace('127.0.0.1', 'localhost') }, async () => {
    await ask('ocr')
    assert.equal(m.got.at(-1).auth, undefined)
    assert.equal(m.got.at(-1).body.provider, undefined)
    assert.equal(m.got.at(-1).body.reasoning, undefined)
  })
  await withEnv({ ...main, OCR_BASE_URL: `${m.url}/` }, async () => {
    await ask('ocr') // the same provider: same key
    assert.equal(m.got.at(-1).auth, 'Bearer sk-MAIN')
    assert.deepEqual(m.got.at(-1).body.provider, { sort: 'latency' })
  }).finally(m.close)
})

test('provider names are checked, and failures say which role and URL', async () => {
  await withEnv({ AI_PROVIDER: 'ollama ' }, () => assert.equal(roleConfig('tutor').provider, 'ollama'))
  await withEnv({ AI_PROVIDER: 'olama' }, () => assert.throws(() => roleConfig('tutor'), /"olama": it must be ollama or openai/))
  await withEnv({ AI_BASE_URL: 'http://127.0.0.1:1/v1' }, () => assert.rejects(ask(), /tutor model unreachable at http:\/\/127\.0\.0\.1:1\/v1\/chat\/completions/))
  const m = await mockProvider()
  m.reply = 'html'
  await withEnv({ AI_BASE_URL: m.url }, () => assert.rejects(ask(), /tutor model at .* didn't answer with JSON/)).finally(m.close)
})

// ---------------------------------------------------------------- database and dashboard

const H = 3600e3
const dayStart = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
const session = (student, id, startedAt, updatedAt, parts = [], extra = {}) => ({ ...newState({ id, student, name: student, lang: 'en' }), startedAt, updatedAt, parts, ...extra })
const part = (id, latex, verdict, at) => ({ id, latex, plain: latex, raw: latex, verdict, at })
const summaryOf = async (id) => (await studentSummaries()).find((s) => s.id === id)

test('NUL characters and lone surrogates are stored (cleaned), not lost', async () => {
  const id = uid('qa-g3b-nul')
  await store.saveSession({ ...newState({ id, student: 'qa-g3b-nul\u0000', name: 'Q\u0000A \ud83d' }), parts: [part(1, '1\u0000', 'unsure', Date.now())] })
  const s = await store.loadSession(id)
  assert.equal(s.name, 'QA \ufffd')
  assert.equal(s.parts[0].latex, '1')
  await store.saveHistory(id, 'qa-g3b-nul', [{ kind: 'line', ref: `${id}:line:1`, at: Date.now(), data: { text: 'a\u0000b', ['k\u0000']: 1 } }])
  const [rec] = await store.sessionHistory(id)
  assert.deepEqual(rec.data, { text: 'ab', k: 1 })
})

test('a student whose sessions are older than many others stays on the dashboard', async () => {
  const old = Date.now() - 2 * H
  await store.saveSession(session('qa-g3b-old', uid('qa-g3b-old'), old, old))
  const { query } = await store.db()
  await query(`update glimpse_sessions set updated_at = now() - interval '2 hours' where student_id = 'qa-g3b-old'`)
  for (let i = 0; i < 60; i++) await store.saveSession(session('qa-g3b-busy', uid('qa-g3b-busy'), Date.now(), Date.now()))
  const sessions = await store.listSessions({ perStudent: 50 })
  assert.ok(sessions.some((s) => s.student === 'qa-g3b-old'))
  assert.equal(sessions.filter((s) => s.student === 'qa-g3b-busy').length, 50)
  assert.ok(await summaryOf('qa-g3b-old'))
  assert.equal((await fetch(`${BASE}/api/students/qa-g3b-old`)).status, 200)
})

test('history: a record saved again takes its new student; bad limits are clamped; paging keeps ties', async () => {
  const sid = uid('qa-g3b-ref')
  await store.saveHistory(sid, 'qa-g3b-A', [{ kind: 'summary', ref: `${sid}:summary`, at: Date.now(), data: { n: 'A' } }])
  await store.saveHistory(sid, 'qa-g3b-B', [{ kind: 'summary', ref: `${sid}:summary`, at: Date.now(), data: { n: 'B' } }])
  assert.deepEqual((await store.listHistory({ student: 'qa-g3b-B' })).map((r) => r.data.n), ['B'])
  assert.deepEqual(await store.listHistory({ student: 'qa-g3b-A' }), [])

  for (const q of ['limit=-1', 'limit=1.5', 'limit=-Infinity', 'limit=abc', 'before=1e20', 'before=-1e20', 'before=abc']) {
    const r = await fetch(`${BASE}/api/history?student=qa-g3b-B&${q}`)
    assert.equal(r.status, 200, q)
    assert.ok(Array.isArray(await r.json()), q)
  }

  const at = Date.now() - 60e3
  await store.saveHistory('qa-g3b-ties', 'qa-g3b-ties', [0, 1, 2, 3, 4, 5].map((i) => ({ kind: 'line', ref: `qa-g3b-ties:${i}`, at: at + (i < 3 ? 0 : 1), data: { i } })))
  const seen = []
  let last = null
  for (let page = 0; page < 6; page++) {
    const q = `student=qa-g3b-ties&limit=2${last ? `&before=${last.at}&beforeRef=${encodeURIComponent(last.ref)}` : ''}`
    const rows = await (await fetch(`${BASE}/api/history?${q}`)).json()
    if (!rows.length) break
    seen.push(...rows.map((r) => r.data.i))
    last = rows.at(-1)
  }
  assert.deepEqual(seen, [5, 4, 3, 2, 1, 0])
})

test('history: repeated ?student= is refused, repeated ?kinds= means both kinds', async () => {
  const r = await fetch(`${BASE}/api/history?student=qa-g3b-x&student=qa-g3b-y`)
  assert.equal(r.status, 400)
  const sid = uid('qa-g3b-kinds')
  const now = Date.now()
  await store.saveHistory(sid, 'qa-g3b-kinds', [
    { kind: 'line', ref: `${sid}:l`, at: now, data: {} },
    { kind: 'question', ref: `${sid}:q`, at: now, data: {} },
    { kind: 'summary', ref: `${sid}:s`, at: now, data: {} },
  ])
  const kinds = async (q) => (await (await fetch(`${BASE}/api/history?student=qa-g3b-kinds&${q}`)).json()).map((x) => x.kind).sort()
  assert.deepEqual(await kinds('kinds=line&kinds=question'), ['line', 'question'])
  assert.deepEqual(await kinds('kinds=line,question'), ['line', 'question'])
  assert.deepEqual(await kinds('kinds=line'), ['line'])
})

test('dashboard: newest status wins, lists in time order with the newest kept, today only', async () => {
  const d0 = dayStart() + 60e3 // just after midnight: always today
  const bug = (status) => ({ adds_across: { id: 'adds_across', name: 'Adds the tops and the bottoms', seen: 1, status, styles: ['pictures'] } })
  await store.saveSession(session('qa-g3b-st', uid('qa-g3b-st1'), d0, d0 + 60e3, [part(1, '1/2+1/3=2/5', 'wrong', d0)], { misconceptions: bug('working') }))
  await store.saveSession(session('qa-g3b-st', uid('qa-g3b-st2'), d0 + 120e3, d0 + 180e3, [part(1, '1/2+1/4=3/4', 'correct', d0 + 120e3)], { misconceptions: bug('fixed') }))
  const a = await summaryOf('qa-g3b-st')
  assert.equal(a.misconceptions[0].status, 'fixed')
  assert.equal(a.misconceptions[0].seen, 2)
  assert.equal(a.flag, 'fixed')

  const t = d0 + 10 * 60e3
  const lines = (n, from, at) => Array.from({ length: n }, (_, i) => part(i + 1, `${from + i}+1=${from + i + 1}`, 'correct', at + i * 1000))
  const qs = (n, label, at) => Array.from({ length: n }, (_, i) => ({ text: `${label} ${i + 1}`, lang: 'en', answer: 'a', at: at + i }))
  await store.saveSession(session('qa-g3b-order', uid('qa-g3b-o1'), t, t + 60e3, lines(15, 1, t), { questions: qs(8, 'old', t) }))
  await store.saveSession(session('qa-g3b-order', uid('qa-g3b-o2'), t + 120e3, t + 180e3, lines(10, 100, t + 120e3), { questions: qs(5, 'new', t + 120e3) }))
  const b = await summaryOf('qa-g3b-order')
  assert.deepEqual(
    b.parts.map((p) => p.latex),
    [...lines(10, 6, 0), ...lines(10, 100, 0)].map((p) => p.latex),
  )
  assert.deepEqual(
    b.questions.map((q) => q.text),
    ['old 4', 'old 5', 'old 6', 'old 7', 'old 8', 'new 1', 'new 2', 'new 3', 'new 4', 'new 5'],
  )

  await store.saveSession(session('qa-g3b-ai', uid('qa-g3b-ai1'), d0 - 72 * H, d0 - 72 * H + 60e3, [part(1, '1+1=2', 'correct', d0 - 72 * H)], { ai: { localReads: 7, bigCalls: 5, cost: 0.25 } }))
  await store.saveSession(session('qa-g3b-ai', uid('qa-g3b-ai2'), d0, d0 + 60e3, [part(1, '2+2=4', 'correct', d0)], { ai: { localReads: 1, bigCalls: 0, cost: 0 } }))
  assert.deepEqual((await summaryOf('qa-g3b-ai')).ai, { localReads: 1, bigCalls: 0, cost: 0 })
})

test('dashboard: a session going on past midnight counts its lines of today; empty sessions add no minutes', async () => {
  const m0 = dayStart()
  await store.saveSession(session('qa-g3b-mid', uid('qa-g3b-mid'), m0 - 7 * 60e3, m0 + 5 * 60e3, [part(1, '1+1=2', 'correct', m0 - 6 * 60e3), part(2, '3+3=6', 'correct', m0 + 60e3), part(3, '1/2+1/3=2/5', 'wrong', m0 + 2 * 60e3)]))
  const d = await summaryOf('qa-g3b-mid')
  assert.equal(d.today.parts, 2)
  assert.equal(d.today.right, 1)
  assert.equal(d.today.minutes, 5) // since midnight, not since it started
  for (let i = 0; i < 5; i++) await store.saveSession(session('qa-g3b-empty', uid('qa-g3b-e'), m0 + 60e3 + i, m0 + 62e3 + i))
  assert.deepEqual((await summaryOf('qa-g3b-empty')).today, { minutes: 0, parts: 0, right: 0 })
})

// ---------------------------------------------------------------- HTTP routes

test('bad event fields are a 400 before anything is streamed; NUL characters are dropped', async () => {
  const sid = uid('qa-g3b-ev')
  assert.equal((await engine(sid, { type: 'session_start', student: { a: 1 }, name: 'Qa' })).status, 400)
  assert.equal((await engine(sid, { type: 'session_start', student: 'qa-g3b-ev', name: 'Qa', lang: 'constructor' })).status, 400)
  assert.equal((await engine(sid, { type: 'session_start', student: 'qa-g3b-ev', name: 'Qa Ev', lang: 'en' })).status, 200)
  assert.equal((await engine(sid, { type: 'part_typed', text: 42 })).status, 400)
  assert.equal((await engine(sid, { type: 'part_typed', text: '\\('.repeat(5000) })).status, 400)
  const ids = []
  for (const text of ['1/2 + 1/4 = 3/4', '2/3 + 1/3 = 1\u0000', '1/5 + 1/5 = 2/5']) {
    const r = await engine(sid, { type: 'part_typed', text })
    assert.equal(r.status, 200)
    assert.ok(!r.text.includes('Engine error'))
    ids.push(r.events.filter((e) => e.type === 'part').at(-1).part.id)
  }
  assert.deepEqual(ids, [1, 2, 3]) // every line saved: no part id used twice
  assert.ok(await summaryOf('qa-g3b-ev'))
})

test('session_start never wipes or moves a session that exists', async () => {
  const sid = uid('qa-g3b-own')
  await engine(sid, { type: 'session_start', student: 'qa-g3b-own', name: 'Qa Own' })
  await engine(sid, { type: 'part_typed', text: '1/2+1/4=3/4' })
  const r = await engine(sid, { type: 'session_start', student: 'qa-g3b-other', name: 'Qa Other' })
  assert.equal(r.status, 409)
  const s = await store.loadSession(sid)
  assert.equal(s.student, 'qa-g3b-own')
  assert.equal(s.parts.length, 1)
})

test('bad JSON and oversized bodies get a JSON error, not an HTML stack trace', async () => {
  let r = await fetch(`${BASE}/api/engine`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"sessionId": "qa-x' })
  assert.equal(r.status, 400)
  assert.match(r.headers.get('content-type'), /json/)
  assert.ok(!(await r.text()).includes('node_modules'))
  r = await fetch(`${BASE}/api/engine`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ x: 'a'.repeat(6e6) }) })
  assert.equal(r.status, 413)
  assert.deepEqual(await r.json(), { error: 'request too large' })
})

// A fresh process (like a cold Vercel function): hello must not wait for the database set-up.
function spawnNode(args, { cwd = ROOT, env = {} } = {}) {
  const e = { ...process.env, ...env }
  delete e.NODE_TEST_CONTEXT
  const child = spawn(process.execPath, args, { cwd, env: e })
  child.log = ''
  child.stdout.on('data', (d) => (child.log += d))
  return child
}
const waitFor = async (child, text) => {
  for (let i = 0; i < 100 && !child.log.includes(text); i++) await new Promise((r) => setTimeout(r, 100))
}

test('hello answers at once on a cold start, before the database is set up', async () => {
  const port = 30000 + Math.floor(Math.random() * 20000)
  const code = `const { default: app } = await import(${JSON.stringify(path.join(ROOT, 'server', 'app.js'))}); app.listen(${port}, '127.0.0.1', () => console.log('up'))`
  const child = spawnNode(['--input-type=module', '-e', code], { env: { VERCEL: '1' } })
  try {
    await waitFor(child, 'up')
    const t0 = Date.now()
    const j = await (await fetch(`http://127.0.0.1:${port}/api/engine/hello`)).json()
    const ms = Date.now() - t0
    assert.equal(j.type, 'hello')
    assert.equal(j.store, 'pglite-memory')
    assert.ok(ms < 500, `${ms} ms`)
  } finally {
    child.kill()
  }
})

// ---------------------------------------------------------------- local server (server/index.js)

test('the local server reads .env.local, listens on 127.0.0.1 only, and logs the real endpoints', async () => {
  const dir = mkdtempSync(path.join(TMP, 'run-'))
  writeFileSync(path.join(dir, '.env.local'), 'AI_BASE_URL=https://example.invalid/api/v1\nTUTOR_MODEL=prov/tutor-model\nOCR_PROVIDER=ollama\n')
  const port = 30000 + Math.floor(Math.random() * 20000)
  const child = spawnNode([path.join(ROOT, 'server', 'index.js')], { cwd: dir, env: { OCR_PORT: String(port), PGLITE_DIR: path.join(dir, 'pg'), OLLAMA_URL: 'http://127.0.0.1:9', HOST: '' } })
  try {
    await waitFor(child, 'Database')
    const { log } = child
    assert.match(log, new RegExp(`Server on http://127\\.0\\.0\\.1:${port}`))
    assert.match(log, /Tutor: openai prov\/tutor-model @ https:\/\/example\.invalid\/api\/v1/)
    assert.match(log, /OCR: +ollama glm-ocr @ http:\/\/127\.0\.0\.1:9\b/)
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/engine/hello`)).status, 200)
    const lan = Object.values(os.networkInterfaces())
      .flat()
      .find((a) => a && a.family === 'IPv4' && !a.internal)
    if (lan) await assert.rejects(fetch(`http://${lan.address}:${port}/api/engine/hello`, { signal: AbortSignal.timeout(2000) }))
  } finally {
    child.kill()
  }
})
