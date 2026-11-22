// Regression tests for the Laya decision service (decide/laya_service.py), without the model:
// each test runs the real Python code with a stub encoder in a separate process, never the
// shared service on :8091, and never writes decide/learned.jsonl.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DECIDE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'decide')
const PY = path.join(DECIDE, '.venv', 'bin', 'python')
const skip = !existsSync(PY) && 'Laya is not set up (npm run setup:decide)'

// Runs Python with laya_service importable; the script prints one JSON value.
function py(code, env = {}) {
  const prelude = 'import sys, json, os\nsys.dont_write_bytecode = True\nsys.path.insert(0, os.environ["DECIDE_DIR"])\nimport laya_service as L\n'
  const r = spawnSync(PY, ['-B', '-c', prelude + code], { cwd: os.tmpdir(), encoding: 'utf8', env: { ...process.env, ...env, DECIDE_DIR: DECIDE, PYTHONWARNINGS: 'ignore' }, timeout: 60000 })
  assert.equal(r.status, 0, r.stderr)
  return JSON.parse(r.stdout.trim().split('\n').pop())
}

// A Decider without the model: embed/predict are stubs (or raise when they must not be called).
const STUB = `
import threading, hashlib
import numpy as np
from examples import KINDS, generate
def fake_embed(texts):
    return np.array([np.random.default_rng(int(hashlib.md5(t.encode()).hexdigest()[:8], 16)).standard_normal(64) for t in texts], dtype=np.float32)
class FakeAgent:
    device = "cpu"
    def predict(self, w, q):
        return {"answers": {"animation": {"choice": "count", "probabilities": {k: 1 / len(KINDS) for k in KINDS}}}}
def stub_decider(rows=None, embed=fake_embed):
    d = object.__new__(L.Decider)
    d.agent, d.embed, d.lock = FakeAgent(), embed, threading.Lock()
    rows = rows if rows is not None else generate()
    d.texts = [L.words(t) for t, _ in rows]
    d.labels = np.array([KINDS.index(k) for _, k in rows])
    d.bank = d._unit(d.embed(d.texts))
    return d
`

test('Laya: empty, markup-only and bare-answer lines abstain without asking the model', { skip }, () => {
  const out = py(`${STUB}
d = stub_decider()
def boom(*a, **k):
    raise AssertionError("the model must not be asked")
d.embed = boom
texts = ["", " ", "$ $", "{}", "\\\\,", "\\\\quad", "\\\\left( \\\\right)", "...", "=", "0", "1", "42", "3.5", "= 0", "= 7", "= -3", "= 0.5", "= \\\\frac{1}{2}", "= 3/4"]
print(json.dumps({t: d.decide(t) for t in texts}))`)
  for (const [text, r] of Object.entries(out)) {
    assert.equal(r.kind, 'none', text)
    assert.equal(r.abstained, true, text)
    assert.equal(r.probability, 0, text)
  }
})

test('Laya: real exercises are not mistaken for empty lines', { skip }, () => {
  const out = py(`
print(json.dumps([L.nothing_to_decide(L.words(t)) for t in ["3 + 4 =", "2^5", "5!", "x = 4", "1/2", "½ + ¼ =", "Name: Ben"]]))`)
  assert.deepEqual(out, [false, false, false, false, false, false, false])
})

test('Laya: braced exponents and spaces in \\frac/\\sqrt read the same as the plain LaTeX', { skip }, () => {
  const pairs = [
    ['\\lim_{x \\to 1} \\frac{x^{2} - 1}{x - 1}', '\\lim_{x \\to 1} \\frac{x^2 - 1}{x - 1}'],
    ['\\lim_{x \\to \\infty} \\frac{x^{2} + 1}{2x^{2}}', '\\lim_{x \\to \\infty} \\frac{x^2 + 1}{2x^2}'],
    ['\\frac {1}{2} + \\frac {1}{3} =', '\\frac{1}{2} + \\frac{1}{3} ='],
    ['\\frac{1} {2} + \\frac{1} {3} =', '\\frac{1}{2} + \\frac{1}{3} ='],
    ['\\frac12 + \\frac14 =', '\\frac{1}{2} + \\frac{1}{4} ='],
    ['\\frac{2^{2}}{3} + \\frac{1}{3} =', '\\frac{2^2}{3} + \\frac{1}{3} ='],
    ['c = \\sqrt{6^{2} + 8^{2}}', 'c = \\sqrt{6^2 + 8^2}'],
    ['\\int_{0}^{4} x^{2} dx', '\\int_0^4 x^2 dx'],
    ['\\sqrt{\\sqrt{16}}', '\\sqrt{ \\sqrt{16} }'],
  ]
  const out = py(`print(json.dumps([[L.words(a), L.words(b)] for a, b in ${JSON.stringify(pairs)}]))`)
  for (const [i, [a, b]] of out.entries()) assert.equal(a, b, pairs[i][0])
  assert.equal(out[0][0], 'lim _x to 1 (x^2 - 1) over (x - 1)')
  assert.ok(!out.some(([a]) => /frac|sqrt/.test(a)), 'no \\frac or \\sqrt left unread')
})

test('Laya: typed symbols read like their LaTeX (2³, 6 * 7, 6·7, sin 30°, ½, √, −)', { skip }, () => {
  const pairs = [
    ['2³ =', '2^3 ='],
    ['2¹⁰ =', '2^{10} ='],
    ['6 * 7 =', '6 \\times 7 ='],
    ['6·7 =', '6 \\cdot 7 ='],
    ['6 × (2 + 3) =', '6 \\times (2 + 3) ='],
    ['sin 30° =', '\\sin 30^\\circ ='],
    ['\\cos 60°', '\\cos 60^{\\circ}'],
    ['½ + ¼ =', '\\frac{1}{2} + \\frac{1}{4} ='],
    ['c = √(3² + 4²)', 'c = \\sqrt{(3^2 + 4^2)}'],
    ['x² − 5x + 6 = 0', 'x^2 - 5x + 6 = 0'],
    ['9 – 4 =', '9 - 4 ='],
    ['24 ÷ 6 =', '24 \\div 6 ='],
  ]
  const out = py(`print(json.dumps([[L.words(a), L.words(b)] for a, b in ${JSON.stringify(pairs)}]))`)
  for (const [i, [a, b]] of out.entries()) assert.equal(a, b, pairs[i][0])
})

test('Laya: a text far from every example abstains instead of naming the least unlike kind', { skip }, () => {
  const out = py(`${STUB}
import numpy as np
vecs = {"near": np.array([1.0, 0.0, 0.0]), "far": np.array([0.3, 0.954, 0.0]), "ex1": np.array([1.0, 0.0, 0.0]), "ex2": np.array([0.999, 0.04, 0.0]), "ex3": np.array([0.998, 0.0, 0.06])}
emb = lambda texts: np.array([vecs[t] for t in texts], dtype=np.float32)
d = stub_decider(rows=[("ex1", "groups"), ("ex2", "groups"), ("ex3", "groups")], embed=emb)
print(json.dumps({"near": d.decide("near"), "far": d.decide("far")}))`)
  assert.equal(out.near.kind, 'groups')
  assert.equal(out.near.abstained, false)
  assert.equal(out.far.kind, 'none')
  assert.equal(out.far.abstained, true)
})

test('Laya: decide() and learn() at the same time never fail (one consistent view of the examples)', { skip }, () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'qa-laya-'))
  try {
    const out = py(`${STUB}
import time
L.LEARNED = os.path.join(os.environ["SCRATCH"], "learned.jsonl")
d = stub_decider()
stop = time.time() + 1.5
errors, n = [], [0, 0]
def dec(i):
    while time.time() < stop:
        try:
            d.decide(f"{i} + {n[0] % 50} ="); n[0] += 1
        except Exception as e:
            errors.append(f"{type(e).__name__}: {e}")
def lrn():
    j = 0
    while time.time() < stop:
        d.learn(f"{j % 8} + {j % 50} =", "count"); n[1] += 1; j += 1
ths = [threading.Thread(target=dec, args=(i,)) for i in range(6)] + [threading.Thread(target=lrn)]
[t.start() for t in ths]; [t.join() for t in ths]
print(json.dumps({"decides": n[0], "learns": n[1], "errors": errors[:3], "n_errors": len(errors), "consistent": len(d.texts) == len(d.labels) == d.bank.shape[0]}))`, { SCRATCH: dir })
    assert.equal(out.n_errors, 0, out.errors.join('\n'))
    assert.ok(out.decides > 0 && out.learns > 0)
    assert.equal(out.consistent, true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('Laya: learn() refuses a line with nothing in it', { skip }, () => {
  const out = py(`${STUB}
d = stub_decider()
try:
    d.learn("$ $", "groups"); print(json.dumps("learned"))
except ValueError as e:
    print(json.dumps(str(e)))`)
  assert.match(out, /nothing to learn/)
})

test('Laya: a blank or broken line in learned.jsonl is skipped, not fatal', { skip }, () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'qa-laya-'))
  try {
    const out = py(`
p = os.path.join(os.environ["SCRATCH"], "learned.jsonl")
with open(p, "w") as f:
    f.write('{"text": "6 x 7 = 42", "kind": "groups"}\\n\\n{"text": "5 + 5 =", "kind": "count"\\n{"kind": "count"}\\n{"text": 12, "kind": "count"}\\n{"text": "1 + 1 =", "kind": "nonsense"}\\n[1]\\n{"text": "8 + 1 =", "kind": "count"}\\n')
print(json.dumps({"rows": L.load_learned(p), "missing": L.load_learned(p + ".nope")}))`, { SCRATCH: dir })
    assert.deepEqual(out.rows, [['6 x 7 = 42', 'groups'], ['8 + 1 =', 'count']])
    assert.deepEqual(out.missing, [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('Laya HTTP: text must be a string, and a body without Content-Length is refused', { skip }, () => {
  const out = py(`
import socket, threading
from http.server import ThreadingHTTPServer
class Stub:
    texts = ["x"]
    def decide(self, text):
        return {"kind": "groups", "probability": 0.8, "abstained": False, "decided": text}
    def learn(self, text, kind):
        return {"ok": True}
L.decider = Stub()
srv = ThreadingHTTPServer(("127.0.0.1", 0), L.Handler)
srv.daemon_threads = True
threading.Thread(target=srv.serve_forever, daemon=True).start()
def raw(req):
    s = socket.create_connection(("127.0.0.1", srv.server_address[1]), timeout=5)
    s.sendall(req); s.shutdown(socket.SHUT_WR)
    out = b""
    while True:
        c = s.recv(65536)
        if not c: break
        out += c
    s.close()
    return int(out.split(b" ", 2)[1])
def post(path, body):
    return raw(b"POST %s HTTP/1.1\\r\\nHost: x\\r\\nContent-Length: %d\\r\\n\\r\\n" % (path, len(body)) + body)
chunk = b'{"text":"3 + 4 ="}'
print(json.dumps({
    "ok": post(b"/decide", b'{"text": "3 + 4 ="}'), "null": post(b"/decide", b'{"text": null}'), "number": post(b"/decide", b'{"text": 7}'),
    "missing": post(b"/decide", b"{}"), "empty": post(b"/decide", b""), "list": post(b"/decide", b"[1]"),
    "chunked": raw(b"POST /decide HTTP/1.1\\r\\nHost: x\\r\\nTransfer-Encoding: chunked\\r\\n\\r\\n%x\\r\\n%s\\r\\n0\\r\\n\\r\\n" % (len(chunk), chunk)),
    "learn_null": post(b"/learn", b'{"text": null, "kind": "count"}'), "learn_ok": post(b"/learn", b'{"text": "3 + 4 =", "kind": "count"}'),
    "unknown": post(b"/nope", b'{"text": "1"}'),
}))`)
  assert.deepEqual(out, { ok: 200, null: 400, number: 400, missing: 400, empty: 400, list: 400, chunked: 411, learn_null: 400, learn_ok: 200, unknown: 404 })
})
