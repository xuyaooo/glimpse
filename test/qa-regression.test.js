// Regression tests for the fixes made while checking that every group's changes work together.
// No model or service is called: server/llm.js is replaced by a stub, Laya by a local mock, the
// database is PGlite in a temp folder, and the Laya service code runs in its own process with a
// stub encoder (never the shared service on :8091, never decide/learned.jsonl).
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { registerHooks } from 'node:module'

const STUB = `data:text/javascript,${encodeURIComponent(`
export function roleConfig(role) { return { role, provider: 'stub', model: role === 'ocr' ? 'glm-ocr' : 'stub' } }
export async function complete(role, opts = {}) {
  const st = globalThis.__stub
  if (role === 'ocr') return { text: st.ocr(), model: 'glm-ocr', ms: 1 }
  if (st.fail) throw new Error(st.fail)
  const p = opts.schema?.properties || {}
  const json = p.steps ? { title: 'Steps', steps: [{ say: 'do it', math: 'x' }], result: '', exercise: '' } : p.lines ? { lines: [], feedback: '' } : { text: 'ok' }
  return { text: JSON.stringify(json), json, model: 'stub', ms: 1 }
}`)}`
registerHooks({
  resolve(spec, ctx, next) {
    const r = next(spec, ctx)
    return r.url.endsWith('/server/llm.js') ? { url: STUB, shortCircuit: true } : r
  },
})
const st = (globalThis.__stub = { fail: null, ocr: () => '' })

const laya = http.createServer((req, res) => {
  req.resume()
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(req.url === '/decide' ? { kind: 'none', probability: 0.2, ms: 1 } : { ok: true }))
  })
})
await new Promise((r) => laya.listen(0, '127.0.0.1', r))

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const TMP = mkdtempSync(path.join(os.tmpdir(), 'glimpse-qa-regression-'))
process.env.PGLITE_DIR = path.join(TMP, 'pg')
process.env.DECIDE_URL = `http://127.0.0.1:${laya.address().port}`
process.env.ENGINE_DEBUG = '0'
delete process.env.DATABASE_URL
delete process.env.POSTGRES_URL
delete process.env.VERCEL

const { handle, newState } = await import('../server/engine/session.js')
const { texToPlain, sceneFor } = await import('../server/engine/scenes.js')
const { stripMath } = await import('../server/engine/reader.js')
const { toJpegBase64 } = await import('../server/images.js')
const { default: app } = await import('../server/app.js')
const server = await new Promise((r) => {
  const s = app.listen(0, '127.0.0.1', () => r(s))
})
const BASE = `http://127.0.0.1:${server.address().port}`
after(() => {
  server.close()
  laya.close()
  rmSync(TMP, { recursive: true, force: true })
})

async function send(s, e) {
  const events = []
  s.history = []
  await handle(s, e, (x) => events.push(x))
  return { events, last: (t) => events.filter((x) => x.type === t).pop() }
}
const session = (id) => newState({ id: `qa-regression-${id}`, student: 'qa-regression', name: 'Sam', lang: 'en' })

// ---------------------------------------------------------------- teaching

test('a mistake fixed, then made again: the style that fixed it comes first, and is never "didn\'t click"', async () => {
  const s = session('relapse')
  const first = (await send(s, { type: 'part_typed', text: '1/2 + 1/3 = 2/5' })).last('teach').teaching
  assert.equal(first.style, 'pictures')
  await send(s, { type: 'part_typed', text: '1/2 + 1/4 = 3/4' }) // right after the pictures: fixed
  const m = Object.values(s.misconceptions)
  assert.equal(m.length, 1)
  assert.equal(m[0].status, 'fixed')
  const again = (await send(s, { type: 'part_typed', text: '1/3 + 1/5 = 2/8' })).last('teach').teaching
  assert.equal(again.style, 'pictures')
  assert.match(again.why, /worked for you before/)
  assert.doesNotMatch(again.why, /didn.t click/)
})

// ---------------------------------------------------------------- plain text

test('texToPlain: text-mode escapes come back as the characters written', () => {
  const plain = (l) => texToPlain(stripMath(l))
  assert.equal(plain('x^2 = 4 is it'), 'x² = 4 is it')
  assert.equal(plain('50% of 20 = 10'), '50% of 20 = 10')
  assert.equal(plain('a_1 & b # c ~ d $5'), 'a_1 & b # c ~ d $5')
  assert.equal(plain('$\\frac{1}{2}$ is 50%'), '1/2 is 50%')
  assert.equal(texToPlain('20\\% of 50'), '20% of 50')
  assert.equal(texToPlain('\\frac{1}{1+x}'), '1/(1+x)') // maths as before
})

test('trig: a negative angle turns clockwise, by its size', () => {
  const turn = (t) => sceneFor({ exercise: t, kind: 'trig', age: 15 })?.stages.find((x) => x.show === 'angle')?.caption
  assert.equal(turn('\\sin(-30°)'), 'Turn 30° from the right-hand side, clockwise.')
  assert.equal(turn('\\cos 225°'), 'Turn 225° from the right-hand side, anticlockwise.')
})

// ---------------------------------------------------------------- the browser never sees internal errors

test('a model failure: the child gets a friendly message, without the model URL or error text', async () => {
  const frame = (() => {
    const w = 16
    return `data:image/jpeg;base64,${toJpegBase64({ width: w, height: w, data: new Uint8Array(w * w * 4).fill(120) }, 80)}`
  })()
  st.fail = 'tutor model timed out after 120 s (http://10.0.0.7:11434/api/chat)'
  try {
    const s = session('errors')
    st.ocr = () => '3 + 4 = 8'
    const read = await send(s, { type: 'cut_part', image: frame })
    const typed = await send(s, { type: 'part_typed', text: '3 + 4 = 8' })
    const asked = await send(s, { type: 'question_typed', text: 'why?' })
    const pointed = await send(s, { type: 'point', image: frame, x: 0.5, y: 0.5, text: 'help?' })
    for (const e of [...read.events, ...typed.events, ...asked.events, ...pointed.events]) {
      assert.doesNotMatch(JSON.stringify(e), /10\.0\.0\.7|timed out|11434/, e.type)
      if (e.type === 'hint' && e.hint) assert.equal(e.hint.error, undefined)
      if (e.type === 'answer' && e.answer) assert.equal(e.answer.error, undefined)
    }
    assert.ok(read.last('hint')?.hint?.text)
    assert.equal(asked.last('answer')?.answer?.text, 'Have another look at this line.')
    assert.equal(pointed.last('answer')?.answer?.text, "I'm having trouble thinking right now. Please try again in a moment.")
  } finally {
    st.fail = null
    st.ocr = () => ''
  }
})

// ---------------------------------------------------------------- GET /api/scene

test('GET /api/scene: a text too long to be one exercise has no animation', async () => {
  const get = (t) => fetch(`${BASE}/api/scene?text=${encodeURIComponent(t)}&age=10`).then((r) => r.json())
  assert.equal((await get('3x + 5 = 20')).kind, 'balance')
  assert.deepEqual(await get(`3x + 5 = 20 ${' '.repeat(1000)}`), { kind: null })
})

// ---------------------------------------------------------------- Laya service (decide/laya_service.py)

const DECIDE = path.join(ROOT, 'decide')
const PY = path.join(DECIDE, '.venv', 'bin', 'python')
const noLaya = !existsSync(PY) && 'Laya is not set up (npm run setup:decide)'
function py(code, env = {}) {
  const prelude = 'import sys, json, os\nsys.dont_write_bytecode = True\nsys.path.insert(0, os.environ["DECIDE_DIR"])\nimport laya_service as L\n'
  const r = spawnSync(PY, ['-B', '-c', prelude + code], { cwd: os.tmpdir(), encoding: 'utf8', env: { ...process.env, ...env, DECIDE_DIR: DECIDE, PYTHONWARNINGS: 'ignore' }, timeout: 60000 })
  assert.equal(r.status, 0, r.stderr)
  return JSON.parse(r.stdout.trim().split('\n').pop())
}

test('Laya: learn() keeps one copy of a text it already knows, and stops at its limit', { skip: noLaya }, () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'qa-regression-laya-'))
  try {
    const out = py(
      `
import threading, hashlib
import numpy as np
from examples import KINDS, generate
L.LEARNED = os.path.join(os.environ["SCRATCH"], "learned.jsonl")
def fake_embed(texts):
    return np.array([np.random.default_rng(int(hashlib.md5(t.encode()).hexdigest()[:8], 16)).standard_normal(64) for t in texts], dtype=np.float32)
d = object.__new__(L.Decider)
d.embed, d.lock = fake_embed, threading.Lock()
rows = generate()
d.texts = [L.words(t) for t, _ in rows]
d.labels = np.array([KINDS.index(k) for _, k in rows])
d.bank = d._unit(d.embed(d.texts))
n0 = len(d.texts)
a = d.learn("I share 12 sweets between 3 friends", "sharing")
b = d.learn("I share 12 sweets between 3 friends", "sharing")
c = d.learn(rows[0][0], rows[0][1])
L.MAX_EXAMPLES = len(d.texts)
try:
    d.learn("a brand new text 77 + 1 =", "count"); full = "learned"
except ValueError as e:
    full = str(e)
print(json.dumps({"n0": n0, "a": a, "b": b, "c": c, "full": full, "n": len(d.texts), "consistent": len(d.texts) == len(d.labels) == d.bank.shape[0]}))`,
      { SCRATCH: dir },
    )
    assert.equal(out.a.examples, out.n0 + 1)
    assert.deepEqual(out.b, { ok: true, examples: out.n0 + 1, known: true })
    assert.equal(out.c.known, true)
    assert.match(out.full, /limit/)
    assert.equal(out.n, out.n0 + 1)
    assert.equal(out.consistent, true)
    assert.equal(readFileSync(path.join(dir, 'learned.jsonl'), 'utf8').trim().split('\n').length, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('Laya HTTP: a request body over the limit is refused without reading it', { skip: noLaya }, () => {
  const out = py(`
import socket, threading
from http.server import ThreadingHTTPServer
class Stub:
    texts = ["x"]
    def decide(self, text):
        return {"kind": "groups"}
    def learn(self, text, kind):
        return {"ok": True}
L.decider = Stub()
srv = ThreadingHTTPServer(("127.0.0.1", 0), L.Handler)
srv.daemon_threads = True
threading.Thread(target=srv.serve_forever, daemon=True).start()
def status(length, body):
    s = socket.create_connection(("127.0.0.1", srv.server_address[1]), timeout=5)
    s.sendall(b"POST /decide HTTP/1.1\\r\\nHost: x\\r\\nContent-Length: %d\\r\\n\\r\\n" % length + body)
    out = b""
    while True:
        c = s.recv(65536)
        if not c: break
        out += c
    s.close()
    return int(out.split(b" ", 2)[1])
print(json.dumps({"big": status(10**9, b'{"text": "3 + 4 ="}'), "ok": status(19, b'{"text": "3 + 4 ="}')}))`)
  assert.deepEqual(out, { big: 413, ok: 200 })
})
