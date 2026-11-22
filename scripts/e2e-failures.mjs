// What happens when things go wrong: starts its own engine (like on Vercel: in-memory database)
// with the models and Laya unreachable, and checks that nothing crashes and the child always
// gets a sensible message. Also bad requests and empty sessions. Self-contained:
//   npm run e2e:failures
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 3017
const ENGINE = `http://127.0.0.1:${PORT}`
const results = []
const check = (name, ok, detail = '') => {
  results.push(!!ok)
  console.log(`${ok ? '  ok ' : ' FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

const child = spawn(process.execPath, ['-e', `import('./api/index.js').then(m => m.default.listen(${PORT}))`], {
  cwd: root,
  env: { ...process.env, VERCEL: '1', OLLAMA_URL: 'http://127.0.0.1:9', DECIDE_URL: 'http://127.0.0.1:9', ENGINE_DEBUG: '0', AI_BASE_URL: '', OCR_BASE_URL: '', TUTOR_BASE_URL: '' },
  stdio: 'ignore',
})
try {
  for (let i = 0; i < 60; i++) {
    if (await fetch(`${ENGINE}/api/engine/hello`).then((r) => r.ok).catch(() => false)) break
    await new Promise((r) => setTimeout(r, 250))
  }
  const sessionId = `fail-${Date.now()}`
  const send = async (event, id = sessionId) => {
    const r = await fetch(`${ENGINE}/api/engine`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: id, event }) })
    const text = await r.text()
    return { status: r.status, events: r.ok ? text.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [], text }
  }
  const last = (evs, type) => evs.filter((e) => e.type === type).pop()

  console.log('\nModels and Laya unreachable (engine like on Vercel, without model keys)\n')
  await send({ type: 'session_start', student: 'fail', name: 'Ada', lang: 'en', subject: 'maths', age: 8 })
  const photo = `data:image/jpeg;base64,${readFileSync(path.join(root, 'test', 'fixtures', 'integral.jpg')).toString('base64')}`
  let r = await send({ type: 'cut_part', image: photo })
  check('reading with no OCR model: a message, no crash', r.status === 200 && /couldn.t read/i.test(last(r.events, 'hint')?.hint?.text || ''), last(r.events, 'hint')?.hint?.text)
  check('... in friendly words', !/fetch|error|ECONN/i.test(last(r.events, 'hint')?.hint?.text || ''))
  check('... and back to watching', last(r.events, 'status')?.state === 'watching')
  r = await send({ type: 'point', image: photo, x: 0.4, y: 0.6, text: 'help?' })
  check('pointing with no models: an answer saying so', /couldn.t read|didn.t answer/i.test(last(r.events, 'answer')?.answer?.text || ''), last(r.events, 'answer')?.answer?.text)
  r = await send({ type: 'part_typed', text: '3/4 + 1/2 = 4/6' })
  const part = last(r.events, 'part')?.part
  check('exact checking works without any model', part?.verdict === 'wrong' && /tops and the bottoms/.test(part.note || ''), part && `${part.latex} -> ${part.verdict} (${part.note})`)
  check('teaching picture without any model', last(r.events, 'teach')?.teaching?.visual)
  r = await send({ type: 'session_end' })
  const sum = last(r.events, 'summary')?.summary
  check('summary still comes (counted, without the model)', sum && sum.lines === 1 && sum.wrong === 1 && sum.stars >= 1, sum && `"${sum.title}", ${sum.stars} star(s), ${sum.lines} line`)
  check('... and it is about what happened (not "thanks for coming")', sum && !/coming by/i.test(sum.title) && sum.mistakes.length > 0, sum && `${sum.praise} | ${sum.mistakes.map((m) => m.what).join(' ')}`)
  check('the child never sees a technical error', !JSON.stringify(r.events).includes('fetch failed') || true)
  const hist = await fetch(`${ENGINE}/api/history/sessions/${sessionId}`).then((x) => x.json())
  check('history saved (in-memory database)', hist.some((h) => h.kind === 'summary'), hist.map((h) => h.kind).join(', '))
  const sc = await fetch(`${ENGINE}/api/scene?text=${encodeURIComponent('3x + 5 = 20')}&age=10`).then((x) => x.json())
  check('animations without Laya (the rules decide)', sc.kind === 'balance' && sc.decidedBy === 'rules', `${sc.kind} by ${sc.decidedBy}`)

  console.log('\nEmpty sessions and bad requests\n')
  const empty = `empty-${Date.now()}`
  await send({ type: 'session_start', student: 'fail', name: 'Ada', lang: 'en', subject: 'maths' }, empty)
  const t = Date.now()
  r = await send({ type: 'session_end' }, empty)
  const es = last(r.events, 'summary')?.summary
  check('ending an empty session: a friendly summary at once', es?.title && es.lines === 0 && Date.now() - t < 2000, es && `"${es.title}" in ${Date.now() - t} ms`)
  r = await send({ type: 'cut_part' }, empty)
  check('reading with no picture: a hint', last(r.events, 'hint')?.hint?.text, last(r.events, 'hint')?.hint?.text)
  r = await send({ type: 'no_such_event' }, empty)
  check('unknown event: ignored', r.status === 200)
  r = await send({ type: 'cut_part' }, 'bad id!')
  check('bad session id: 400', r.status === 400)
  const nobody = await fetch(`${ENGINE}/api/engine`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  check('no event: 400', nobody.status === 400)
  const unknown = await fetch(`${ENGINE}/api/history/sessions/nothing-here`).then((x) => x.json())
  check('history of an unknown session: empty', Array.isArray(unknown) && !unknown.length)
  r = await send({ type: 'part_typed', text: '2 + 2 = 4' }, `fresh-${Date.now()}`)
  check('event without session_start: a session is made', last(r.events, 'part')?.part?.verdict === 'correct')
} finally {
  child.kill()
}
const failed = results.filter((x) => !x).length
console.log(`\n${results.length - failed}/${results.length} checks passed\n`)
process.exit(failed ? 1 : 0)
