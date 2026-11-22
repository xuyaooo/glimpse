// Regressions for the UX test findings in the HTTP API (server/app.js, server/store.js): one event
// at a time per session, sessions that were never started or have ended, a session ended twice,
// Practise again made again with its subject, and the history in the order things happened.
// Self-contained: its own database (PGlite in a temp folder), no models, no Laya.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'

const TMP = mkdtempSync(path.join(os.tmpdir(), 'glimpse-qa-ux-'))
process.env.PGLITE_DIR = path.join(TMP, 'pg')
process.env.ENGINE_DEBUG = '0'
process.env.DECIDE_URL = 'http://127.0.0.1:9'
process.env.OLLAMA_URL = 'http://127.0.0.1:9'
delete process.env.DATABASE_URL
delete process.env.POSTGRES_URL
delete process.env.VERCEL
for (const k of Object.keys(process.env)) if (/^(AI|OCR|TUTOR)_/.test(k)) delete process.env[k]

const store = await import('../server/store.js')
const { REVIEW_VERSION } = await import('../server/engine/review.js')
const { default: app } = await import('../server/app.js')

const server = await new Promise((r) => {
  const s = app.listen(0, '127.0.0.1', () => r(s))
})
const BASE = `http://127.0.0.1:${server.address().port}`
after(() => {
  server.close()
  rmSync(TMP, { recursive: true, force: true })
})

const engine = async (sessionId, event) => {
  const r = await fetch(`${BASE}/api/engine`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, event }) })
  const text = await r.text()
  return { status: r.status, text, events: r.ok ? text.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [] }
}
const last = (r, type) => r.events.filter((e) => e.type === type).pop()
const uid = (p) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const start = (sid, student, extra = {}) => engine(sid, { type: 'session_start', student, name: 'Qa', lang: 'en', ...extra })

test('an unknown event type is a 400; an event for a session never started is a 404 (no "unknown" session)', async () => {
  const sid = uid('qa-ux-nostart')
  assert.equal((await engine(sid, { type: 'look_again' })).status, 400)
  const r = await engine(sid, { type: 'part_typed', text: '2 + 2 = 4' })
  assert.equal(r.status, 404)
  assert.equal(await store.loadSession(sid), null)
  // and the session can still be started
  assert.equal((await start(sid, 'qa-ux-nostart')).status, 200)
  assert.equal((await store.loadSession(sid)).student, 'qa-ux-nostart')
})

test('two events at once are applied one after the other: no line lost, no part id given twice', async () => {
  const sid = uid('qa-ux-conc')
  await start(sid, 'qa-ux-conc')
  const texts = ['1/2 + 1/4 = 3/4', '1/3 + 1/3 = 2/3', '2 + 2 = 4', '3 + 4 = 7', '1/5 + 1/5 = 2/5']
  const rs = await Promise.all(texts.map((text) => engine(sid, { type: 'part_typed', text })))
  assert.ok(rs.every((r) => r.status === 200))
  const ids = rs.map((r) => last(r, 'part').part.id).sort((a, b) => a - b)
  assert.deepEqual(ids, [1, 2, 3, 4, 5])
  const s = await store.loadSession(sid)
  assert.equal(s.parts.length, 5)
  const lines = (await store.sessionHistory(sid)).filter((h) => h.kind === 'line')
  assert.equal(lines.length, 5)
})

test('an ended session refuses new work (409) but takes settings; ending it again keeps its summary and "I did it"', async () => {
  const sid = uid('qa-ux-end')
  await start(sid, 'qa-ux-end')
  for (const text of ['1/2 + 1/3 = 2/5', '3/4 + 1/2 = 4/6']) await engine(sid, { type: 'part_typed', text })
  const first = last(await engine(sid, { type: 'session_end' }), 'summary').summary
  assert.ok(first.review.length > 0)
  // "I did it" on the first exercise
  const [card] = await (await fetch(`${BASE}/api/review?student=qa-ux-end`)).json()
  const done = await fetch(`${BASE}/api/review/done`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: card.ref, id: card.items[0].id, done: true }) })
  assert.equal(done.status, 200)
  // new work: refused, nothing saved
  const r = await engine(sid, { type: 'part_typed', text: '3/4 + 1/4 = 1' })
  assert.equal(r.status, 409)
  assert.equal((await store.loadSession(sid)).parts.length, 2)
  assert.equal((await engine(sid, { type: 'question_typed', text: 'why?' })).status, 409)
  // a new age in Settings is still fine
  assert.equal((await engine(sid, { type: 'set_age', age: 10 })).status, 200)
  // ending again: the saved summary, with its "I did it", and the record unchanged
  const again = last(await engine(sid, { type: 'session_end' }), 'summary').summary
  assert.equal(again.at, first.at)
  assert.deepEqual(again.review.map((x) => x.exercise), first.review.map((x) => x.exercise))
  assert.equal(again.review[0].done, true)
  const rec = await store.historyRecord(`${sid}:summary`)
  assert.equal(rec.data.review[0].done, true)
  assert.equal(rec.data.at, first.at)
})

test('Practise again made again (a newer version) keeps the subject, the solved exercises and the tutor\'s ideas', async () => {
  const sid = uid('qa-ux-read')
  await start(sid, 'qa-ux-read', { subject: 'reading' })
  await engine(sid, { type: 'part_typed', text: 'i have a apple' })
  await engine(sid, { type: 'part_typed', text: 'where is my book' })
  await engine(sid, { type: 'session_end' })
  const rec = await store.historyRecord(`${sid}:summary`)
  const idea = { id: 'idea1', level: 'idea', exercise: '7 \\times 8', why: 'Glim picked this one for you.', kind: 'groups', answer: '56', scene: null }
  // an older version, nothing done: made again on the next GET
  await store.saveHistory(sid, 'qa-ux-read', [{ ref: rec.ref, kind: 'summary', at: rec.at, data: { ...rec.data, review: [idea], reviewVersion: REVIEW_VERSION - 1 } }])
  const [card] = await (await fetch(`${BASE}/api/review?student=qa-ux-read`)).json()
  assert.ok(card.items.some((x) => x.kind === 'sentence'), JSON.stringify(card.items.map((x) => x.kind)))
  assert.ok(card.items.some((x) => x.level === 'idea' && x.exercise === '7 \\times 8'))
})

test('a record saved again keeps the time it was first saved (the session history stays in order)', async () => {
  const sid = uid('qa-ux-at')
  const t0 = Date.now() - 60_000
  await store.saveHistory(sid, 'qa-ux-at', [{ kind: 'line', ref: `${sid}:line:1`, at: t0, data: { v: 1 } }])
  await store.saveHistory(sid, 'qa-ux-at', [{ kind: 'line', ref: `${sid}:line:2`, at: t0 + 1000, data: { v: 2 } }])
  await store.saveHistory(sid, 'qa-ux-at', [{ kind: 'line', ref: `${sid}:line:1`, at: Date.now(), data: { v: 3 } }])
  const h = await store.sessionHistory(sid)
  assert.deepEqual(h.map((x) => x.ref.split(':').pop()), ['1', '2'])
  assert.equal(h[0].data.v, 3)
  assert.equal(h[0].at, t0)
})
