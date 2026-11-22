// End-to-end test of the whole pipeline, against the running engine (npm run dev):
//   photo -> GLM-OCR -> tutor LLM (verdicts, hint) -> Laya (topic, animation) -> worked steps
//   -> pointing + question -> session summary -> database history -> tutor dashboard.
// Uses real photos of handwriting (test/fixtures). Prints a report; exits 1 if a check fails.
//
//   npm run e2e                 (ENGINE=http://localhost:3001 by default)
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ENGINE = process.env.ENGINE || 'http://localhost:3001'
const LAYA = process.env.DECIDE_URL || 'http://127.0.0.1:8091'
const OLLAMA = process.env.OLLAMA_URL || 'http://127.0.0.1:11434'
const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures')
const photo = (name) => `data:image/jpeg;base64,${readFileSync(path.join(fixtures, name)).toString('base64')}`

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail })
  console.log(`${ok ? '  ok ' : ' FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
const json = async (url, init) => {
  const r = await fetch(url, init)
  if (!r.ok) throw new Error(`${url}: ${r.status}`)
  return r.json()
}

const sessionId = `e2e-${Date.now()}`
async function send(event) {
  const t = performance.now()
  const r = await fetch(`${ENGINE}/api/engine`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, event }) })
  const events = []
  const firstAt = {}
  const reader = r.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let nl
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line) continue
      const e = JSON.parse(line)
      firstAt[e.type] ??= Math.round(performance.now() - t)
      events.push(e)
    }
  }
  const of = (type) => events.filter((e) => e.type === type)
  return { events, of, last: (type) => of(type).pop(), ms: Math.round(performance.now() - t), firstAt }
}

console.log(`\nGlimpse end-to-end test against ${ENGINE}\n`)

// ---------------------------------------------------------------- 1. services
console.log('1. Services')
const hello = await json(`${ENGINE}/api/engine/hello`).catch(() => null)
check('engine answers', hello?.type === 'hello', hello ? `store: ${hello.store}` : 'start it with npm run dev')
if (!hello) process.exit(1)
const models = await json(`${OLLAMA}/api/tags`).then((d) => d.models.map((m) => m.name)).catch(() => [])
check('GLM-OCR installed (Ollama)', models.some((m) => m.startsWith('glm-ocr')))
check('tutor model installed (Ollama)', models.some((m) => m.startsWith('qwen3.5')))
const laya = await json(`${LAYA}/health`).catch(() => null)
check('Laya decision service', laya?.ok, laya ? `${laya.examples} examples` : 'not running: the rules pick the animations')

// ---------------------------------------------------------------- 2. reading a line
console.log('\n2. Reading a line: the integral (photo -> OCR -> tutor -> Laya -> animation)')
await send({ type: 'session_start', student: 'e2e', name: 'Sam', lang: 'en', subject: 'maths', age: 9 })
let r = await send({ type: 'cut_part', image: photo('integral.jpg') })
const page = r.last('page')?.page
check('OCR read the page', page?.lines?.length, page ? `${page.ms} ms: ${page.lines.map((l) => l.map((x) => x.v).join(' ')).join(' | ')}` : '')
const part = r.last('part')?.part
check('a line of work came back', part, part && `${part.latex} -> ${part.verdict}${part.note ? ` (${part.note})` : ''}`)
check('the unfinished integral is not marked right', part && part.verdict !== 'correct')
check('the line carries its photo', part?.crop?.startsWith('data:image/jpeg'))
const hint = r.last('hint')?.hint
check('a hint', hint?.text?.length > 20, hint?.text)
check('hint is plain text (no $ or \\frac)', hint && !/\$|\\frac/.test(hint.text))
const topic = r.last('topic')?.topic
check('topic recognised: integrals', topic?.kind === 'area', topic?.label)
const stepsFirst = r.of('steps')[0]?.steps
const steps = r.last('steps')?.steps
check('animation sent before the written steps', stepsFirst?.scene && !stepsFirst.items.length, r.firstAt.steps && `animation at ${r.firstAt.steps} ms, all done at ${r.ms} ms`)
check('animation: area under the curve, grown-up style', steps?.scene?.kind === 'area' && steps.scene.skin === 'grown', steps?.scene && `${steps.scene.kind}/${steps.scene.skin}, decided by ${steps.scene.decidedBy}`)
check('animation value is right (ln 2 ≈ 0.693 for 0..1)', steps?.scene && (Math.abs(steps.scene.value - Math.LN2) < 1e-3 || Math.abs(steps.scene.value - Math.log(5)) < 1e-3), steps?.scene && `${steps.scene.value} (upper bound read as ${steps.scene.b})`)
check('worked steps from the tutor', steps?.items?.length >= 3, steps && `${steps.items.length} steps, result ${steps.result}`)
check('captions are plain maths', steps?.scene?.stages.every((s) => !/\\|frac\{/.test(s.caption)), steps?.scene?.stages[0]?.caption)
check('status back to watching', r.last('status')?.state === 'watching')

// ---------------------------------------------------------------- 3. pointing and asking
console.log('\n3. Pointing at the exercise and asking (photo + fingertip + question -> OCR -> tutor)')
r = await send({ type: 'point', image: photo('integral.jpg'), x: 0.37, y: 0.62, text: 'how do I solve this?' })
const q = r.last('question')?.question
check('the question is echoed', q?.text === 'how do I solve this?')
check('the tutor found what was pointed at', q?.about && /frac|int|1\+x/.test(q.about), q?.about)
const answer = r.last('answer')?.answer
check('an answer', answer?.text?.length > 20, answer && `${r.firstAt.answer} ms: ${answer.text}`)
check('answer is plain text', answer && !/\$|\\frac/.test(answer.text))

// ---------------------------------------------------------------- 4. a second page: fractions
console.log('\n4. Reading fractions (exact checking, misconception, teaching, Laya)')
r = await send({ type: 'cut_part', image: photo('fractions.jpg') })
const parts = r.of('part').map((e) => e.part)
check('two lines read', parts.length >= 2, parts.map((p) => `${p.latex} -> ${p.verdict}`).join('; '))
check('a new page keeps the earlier lines (numbered after them)', parts.length && parts.every((p) => p.id >= 2), parts.map((p) => `line ${p.id}`).join(', '))
check('3/4 + 1/2 = 4/6 is wrong (exact check)', parts.some((p) => p.verdict === 'wrong' && /3.*4.*1.*2.*4.*6/.test(p.latex.replace(/\D/g, ''))))
check('misconception found: added tops and bottoms', parts.some((p) => /tops and the bottoms/.test(p.note || '')))
const teach = r.last('teach')?.teaching
check('teaching picture for the mistake', teach?.visual, teach && `${teach.style} / ${teach.visual.kind}`)
check('topic changes to fractions', r.last('topic')?.topic?.kind === 'fractions', r.last('topic')?.topic?.label)
const fsteps = r.last('steps')?.steps
check('fraction animation for a 9-year-old: pizzas', fsteps?.scene?.kind === 'fractions' && fsteps.scene.skin === 'kid', fsteps?.scene && `${fsteps.scene.kind}/${fsteps.scene.skin}`)
check('2/5 + 1/3 computed as 11/15', fsteps?.scene?.resultTex === '\\frac{11}{15}', fsteps?.scene?.resultTex)
check('similar exercises offered', r.last('exercises')?.items?.length > 0)

// ---------------------------------------------------------------- 5. age
console.log('\n5. Age changes the animations')
await send({ type: 'set_age', age: 15 })
r = await send({ type: 'point', image: photo('fractions.jpg'), x: 0.5, y: 0.5, text: 'can you show me the second one?' })
const s15 = r.last('steps')?.steps?.scene
check('at 15, fractions are bars (not pizzas)', !s15 || s15.skin !== 'kid', s15 ? `${s15.kind}/${s15.skin}` : 'no new animation (same exercise)')

// ---------------------------------------------------------------- 6. end of session
console.log('\n6. End of session: the summary')
r = await send({ type: 'session_end' })
const sum = r.last('summary')?.summary
check('summary written', sum?.title, sum && `${r.ms} ms: "${sum.title}", ${sum.stars} star(s)`)
check('stars counted from the results (1-3)', sum && sum.stars >= 1 && sum.stars <= 3)
check('practised mentions integrals and fractions', sum && /integral|area|calculus/i.test(sum.practised.join(' ') + sum.title) && /fraction/i.test(sum.practised.join(' ') + sum.praise + sum.for_adults), sum?.practised.join(', '))
check('mistakes with tips', sum?.mistakes?.length > 0 && sum.mistakes.every((m) => m.tip), sum?.mistakes.map((m) => m.what).join(' | '))
check('no he/she for the student', sum && !/\b(he|she|his|her|him)\b/i.test(`${sum.praise} ${sum.for_adults} ${sum.next}`))
const rev = sum?.review ?? []
check('exercises to practise again (3 to 5)', rev.length >= 3 && rev.length <= 5, rev.map((x) => `${x.level}: ${x.exercise} = ${x.answer}`).join(' | '))
check('each one checked by code (answer + animation)', rev.length && rev.every((x) => x.id && x.why && (x.level === 'idea' || (x.answer && x.scene?.stages?.length))))

// ---------------------------------------------------------------- 7. database
console.log('\n7. Saved in the database')
const hist = await json(`${ENGINE}/api/history/sessions/${sessionId}`)
const kinds = hist.map((h) => h.kind)
check('lines saved', kinds.filter((k) => k === 'line').length >= 2, `${kinds.length} records: ${[...new Set(kinds)].join(', ')}`)
check('questions saved', kinds.includes('question'))
check('solutions saved with their animation', hist.some((h) => h.kind === 'steps' && h.data.scene?.stages?.length))
check('summary saved', kinds.includes('summary'))
check('photos saved small', hist.filter((h) => h.data.photo).every((h) => h.data.photo.length < 80000), `${hist.filter((h) => h.data.photo).length} photos`)
const byStudent = await json(`${ENGINE}/api/history?student=e2e&limit=50`)
check('history by student', byStudent.some((h) => h.sessionId === sessionId))
const students = await json(`${ENGINE}/api/students`)
check('tutor dashboard lists the student', students.some((s) => s.id === 'e2e'))
const practise = await json(`${ENGINE}/api/review?student=e2e`)
const mine = practise.find((x) => x.sessionId === sessionId)
check('My work: practise again for this session', mine?.items?.length === rev.length, `${practise.length} sessions`)
const first = mine?.items?.[0]
if (first) {
  const done = await json(`${ENGINE}/api/review/done`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: mine.ref, id: first.id, done: true }) })
  const again = (await json(`${ENGINE}/api/review?student=e2e`)).find((x) => x.sessionId === sessionId)
  check('"I did it" is saved', done.ok && again?.items?.[0]?.done === true)
}

// ---------------------------------------------------------------- 8. every animation
console.log('\n8. Every animation (Laya decides, the engine computes)')
const cases = [
  ['3 + 4 =', 7, 'count', '7'],
  ['27 + 15 =', 7, 'number_line', '42'],
  ['4 \\times 6 =', 7, 'groups', '24'],
  ['6 x 7 = 42', 9, 'groups', '42'], // a times sign read as the letter x (seen live)
  ['\\frac{1}{2} + \\frac{1}{3} =', 9, 'fractions', '\\frac{5}{6}'],
  ['3x + 5 = 20', 11, 'balance', 'x = 5'],
  ['1 + 2 + ... + 100 =', 10, 'pairs', '5050'],
  ['\\int_0^4 x^2 dx', 17, 'area', '\\approx 21.333'],
  ['y = x^2 - 4', 15, 'graph', 'x = -2,\\ x = 2'],
  ['345 + 278 =', 9, 'columns', '623'],
  ['68 \\times 74 =', 10, 'area_model', '5032'],
  ['24 \\div 6 =', 7, 'sharing', '4'],
  ['20\\% of 50', 12, 'percent', '10'],
  ['(5 + 3) \\times 2 - 4 =', 12, 'order_ops', '12'],
  ['2^5 =', 13, 'powers', '32'],
  ['mean of 3, 5, 7, 9', 12, 'mean', '6'],
  ['2x + 3 > 7', 14, 'inequality', 'x > 2'],
  ['3^2 + 4^2 = c^2', 14, 'pythagoras', '5'],
  ['x^2 - 5x + 6 = 0', 16, 'quadratic', 'x = 2,\\ x = 3'],
  ['2x + y = 5, x - y = 1', 16, 'system', 'x = 2,\\ y = 1'],
  ['\\sin 30^\\circ', 16, 'trig', '\\frac{1}{2}'],
  ['\\lim_{x \\to 0} \\frac{\\sin x}{x}', 17, 'limit', '1'],
  ['\\frac{d}{dx} x^3', 17, 'derivative', "f'(1) = 3"],
  ['sum of 7 with two dice', 14, 'chance', '\\frac{1}{6}'],
  ['\\binom{5}{2}', 15, 'combinations', '10'],
  ['P(A) = 0.5, P(B) = 0.3, P(A and B) independent', 15, 'tree', '0.15'],
  ['Write a story about a dog', 9, null, null],
]
for (const [text, age, kind, result] of cases) {
  const sc = await json(`${ENGINE}/api/scene?text=${encodeURIComponent(text)}&age=${age}`)
  check(`${text} -> ${kind ?? 'no animation'}`, sc.kind === kind && (result === null || sc.resultTex === result), sc.kind ? `${sc.kind}/${sc.skin} = ${sc.resultTex}, by ${sc.decidedBy}${sc.laya ? ` (Laya ${Math.round(sc.laya.probability * 100)}%, ${sc.laya.ms} ms)` : ''}` : 'none')
}

const failed = results.filter((x) => !x.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed${failed.length ? `; failed: ${failed.map((f) => f.name).join('; ')}` : ''}\n`)
process.exit(failed.length ? 1 : 0)
