// Regressions for the UX test findings in the engine's step function (server/engine/session.js):
// equations checked step by step, computed words for fractions, line numbers, the summary's rule
// for fractions, a session ended twice, typed questions, Laya's topic.
// No model or service is called: server/llm.js is replaced by a stub, and Laya by a local mock.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { registerHooks } from 'node:module'

const STUB = `data:text/javascript,${encodeURIComponent(`
export function roleConfig(role) { return { role, provider: 'stub', model: role === 'ocr' ? 'glm-ocr' : 'stub' } }
export const isLayoutParsing = () => false
export async function layoutParse() { throw new Error('no cloud OCR in tests') }
export async function complete(role, opts = {}) {
  const st = globalThis.__stub
  st.calls.push({ role, opts })
  if (role === 'ocr') return { text: st.ocr(), model: 'glm-ocr', ms: 1 }
  const p = opts.schema?.properties || {}
  const json = p.lines ? st.page(opts) : p.steps ? st.steps(opts) : p.praise ? st.summary(opts) : p.pointed ? st.point(opts) : st.answer(opts)
  if (json instanceof Error) throw json
  return { text: JSON.stringify(json), json, model: 'stub', ms: 1 }
}`)}`
registerHooks({
  resolve(spec, ctx, next) {
    const r = next(spec, ctx)
    return r.url.endsWith('/server/llm.js') ? { url: STUB, shortCircuit: true } : r
  },
})

// a mock Laya: answers what the test sets (abstains by default)
let layaSays = { kind: 'none', probability: 0.2 }
const laya = http.createServer((req, res) => {
  req.resume()
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(req.url === '/decide' ? { ...layaSays, ms: 1 } : { ok: true }))
  })
})
await new Promise((r) => laya.listen(0, '127.0.0.1', r))
after(() => laya.close())
process.env.DECIDE_URL = `http://127.0.0.1:${laya.address().port}`
process.env.ENGINE_DEBUG = '0'

const { handle, newState } = await import('../server/engine/session.js')
const { toJpegBase64 } = await import('../server/images.js')

const st = (globalThis.__stub = {})
function resetStub() {
  layaSays = { kind: 'none', probability: 0.2 }
  Object.assign(st, {
    calls: [],
    ocr: () => '',
    page: () => ({ lines: [], feedback: '' }),
    steps: () => ({ title: 'Steps', steps: [{ say: 'do it', math: 'x' }], result: '', exercise: '' }),
    summary: () => new Error('no model'),
    point: () => ({ pointed: '', answer: 'ok' }),
    answer: () => ({ text: 'ok' }),
  })
}
resetStub()
const frame = (() => {
  const w = 16
  const data = new Uint8Array(w * w * 4).fill(120)
  return `data:image/jpeg;base64,${toJpegBase64({ width: w, height: w, data }, 80)}`
})()
const session = (id, extra = {}) => newState({ id: `qa-ux-${id}`, student: 'qa-ux', name: 'Luca', lang: 'en', ...extra })
async function send(s, e) {
  const events = []
  s.history = []
  await handle(s, e, (x) => events.push(x))
  const of = (t) => events.filter((x) => x.type === t)
  return { events, hist: s.history, of, last: (t) => of(t).pop() }
}
function read(s, lines, { verdicts = [], notes = [], feedback = 'fb', kinds = [] } = {}) {
  st.ocr = () => lines.join('\n')
  st.page = () => ({ lines: lines.map((l, i) => ({ n: i + 1, kind: kinds[i] || 'work', verdict: verdicts[i] || 'unsure', ...(notes[i] ? { note: notes[i] } : {}) })), feedback })
  return send(s, { type: 'cut_part', image: frame })
}
const hintText = (r) => r.last('hint')?.hint?.text

// ---------------------------------------------------------------- equations, step by step

test('a step that changes the answer is not Right, whatever the model says (3x + 4x = 400 -> 5x = 400)', async () => {
  resetStub()
  const s = session('alg')
  const r = await read(s, ['$3x + 4x = 400$', '$5x = 400$', '$x = 80$'], { verdicts: ['correct', 'correct', 'correct'], feedback: 'Great job! You correctly added the x terms to get 5x = 400.' })
  assert.deepEqual(s.parts.map((p) => p.verdict), ['correct', 'wrong', 'wrong'])
  assert.match(s.parts[1].note, /doesn't follow from the line above/)
  assert.match(s.parts[2].note, /carried on a slip/)
  // never the model's praise for the slip
  assert.doesNotMatch(hintText(r), /Great job/)
  assert.match(hintText(r), /slip higher up/)
  // the steps solve the exercise (its first line), not the slip
  const asked = st.calls.filter((c) => c.opts.schema?.properties?.steps).map((c) => c.opts.messages.at(-1).content)
  assert.ok(asked.some((t) => t.includes('3x + 4x = 400')), asked.join(' | '))
  // the history keeps the marks
  assert.deepEqual(r.hist.filter((h) => h.kind === 'line').map((h) => h.data.verdict), ['correct', 'wrong', 'wrong'])
})

test('right steps stay right, and a new exercise after an answer is not compared with the last one', async () => {
  resetStub()
  const s = session('alg2')
  await read(s, ['$2x + 3 = 11$', '$2x = 8$', '$x = 4$', '$5x = 20$', '$x = 5$'], { verdicts: ['correct', 'correct', 'correct', 'correct', 'correct'], feedback: 'Well done.' })
  assert.deepEqual(s.parts.map((p) => p.verdict), ['correct', 'correct', 'correct', 'correct', 'wrong'])
  assert.match(s.parts[4].note, /doesn't follow/)
})

// ---------------------------------------------------------------- fractions: computed words

test('a right sum of fractions gets computed praise, never the model\'s "tops and bottoms"', async () => {
  resetStub()
  const s = session('praise')
  await read(s, ['$\\frac{1}{2} + \\frac{1}{3} = \\frac{2}{5}$'], { verdicts: ['wrong'] })
  const r = await read(s, ['$\\frac{1}{2} + \\frac{1}{3} = \\frac{2}{5}$', '$\\frac{1}{4} + \\frac{1}{2} = \\frac{3}{4}$'], {
    verdicts: ['wrong', 'correct'],
    feedback: 'Good job on line 2! You added the tops (1+1) and bottoms (4+2) correctly to get 3/4.',
  })
  assert.equal(s.parts[1].verdict, 'correct')
  assert.equal(hintText(r), 'Right! Make the pieces the same size: 1/4 + 1/2 = 1/4 + 2/4 = 3/4.')
})

test('a wrong sum of fractions is taught with the computed hint, also when the model agrees it is wrong', async () => {
  resetStub()
  const s = session('teach')
  const r = await read(s, ['$\\frac{2}{5} + \\frac{1}{3} = \\frac{3}{8}$'], { verdicts: ['wrong'], feedback: 'But halves and thirds are different sizes... Change 1/3 into fifths: it is 5/15.' })
  assert.equal(s.parts[0].verdict, 'wrong')
  assert.equal(hintText(r), 'Look: 3/8 is smaller than 2/5. Can adding give you less?')
  assert.equal(r.hist.find((h) => h.kind === 'line').data.hint, hintText(r))
})

test('the tutor prompt has no worked numbers to copy', async () => {
  resetStub()
  const s = session('prompt')
  await read(s, ['$\\frac{2}{5} + \\frac{1}{3} = \\frac{3}{8}$'])
  const sys = st.calls.find((c) => c.opts.schema?.properties?.lines).opts.messages[0].content
  assert.doesNotMatch(sys, /halves|sixths|ln\(1\+x\)|1\/2 = 3\/6/)
})

// ---------------------------------------------------------------- line numbers

test('"line N" in the tutor\'s words is the number the student sees', async () => {
  resetStub()
  const s = session('lines')
  const r = await read(s, ['theorem hypothetical', '$2x + 3 = 9$', '$2x = 6$'], { kinds: ['printed'], verdicts: ['unsure', 'correct', 'correct'], feedback: 'Line 3 is right: you took 3 from both sides in line 2 and 3.' })
  assert.deepEqual(s.parts.map((p) => p.id), [1, 2])
  assert.equal(hintText(r), 'Line 2 is right: you took 3 from both sides in line 1 and 2.')
  const sys = st.calls.find((c) => c.opts.schema?.properties?.lines).opts.messages[0].content
  assert.match(sys, /Don't mention line numbers/)
})

// ---------------------------------------------------------------- the line records keep their time

test('reading an unchanged page again keeps each line at the time it was written', async () => {
  resetStub()
  const s = session('order')
  await read(s, ['$\\frac{2}{5} + \\frac{1}{3} = \\frac{3}{8}$'], { verdicts: ['wrong'] })
  const at = s.parts[0].at
  await new Promise((r) => setTimeout(r, 15))
  const r = await read(s, ['$\\frac{2}{5} + \\frac{1}{3} = \\frac{3}{8}$'], { verdicts: ['wrong'] })
  const rec = r.hist.find((h) => h.kind === 'line')
  assert.ok(rec, 'the line is saved again with what Glim said')
  assert.equal(rec.at, at)
})

// ---------------------------------------------------------------- typed lines

test('"6 x 7 = 48" is read as times and marked wrong (not kept as words)', async () => {
  resetStub()
  const s = session('times')
  const r = await send(s, { type: 'part_typed', text: '6 x 7 = 48' })
  assert.equal(s.parts[0].verdict, 'wrong')
  assert.equal(s.parts[0].latex, '6\\times 7=48')
  assert.equal(r.last('part').part.verdict, 'wrong')
})

// ---------------------------------------------------------------- the end of a session

test('session_end on an ended session sends the same summary, without asking the tutor again', async () => {
  resetStub()
  const s = session('end2')
  await send(s, { type: 'part_typed', text: '1/2 + 1/3 = 2/5' })
  const first = (await send(s, { type: 'session_end' })).last('summary').summary
  const calls = st.calls.length
  const r = await send(s, { type: 'session_end' })
  assert.equal(st.calls.length, calls)
  assert.deepEqual(r.last('summary').summary, first)
  assert.equal(r.hist.length, 0) // nothing saved again
})

test('summary: the fraction mistakes are said in the engine\'s words, and a wrong rule from the model is replaced', async () => {
  resetStub()
  const s = session('rule')
  await send(s, { type: 'part_typed', text: '1/2 + 1/3 = 2/5' })
  await send(s, { type: 'part_typed', text: '1/4 + 2/4 = 3/4' })
  st.summary = () => ({
    title: 'Fraction fun!',
    praise: 'You worked hard.',
    practised: ['Fractions'],
    mistakes: [{ what: 'You added the tops and the bottoms.', tip: 'When adding fractions, keep the bottom number the same and only add the top numbers!' }],
    next: 'Next time, we will practise adding fractions.',
    for_adults: 'Luca needs to learn that we must keep the bottom number the same when adding.',
  })
  const sum = (await send(s, { type: 'session_end' })).last('summary').summary
  assert.equal(sum.mistakes[0].what, 'You added the tops and the bottoms: 1/2 + 1/3 = 2/5.')
  assert.equal(sum.mistakes[0].tip, 'Make the bottoms the same first, then add the tops: 1/2 + 1/3 = 3/6 + 2/6 = 5/6.')
  assert.ok(sum.mistakes.every((m) => !/keep the bottom number the same/i.test(m.tip)))
  assert.equal(sum.next, 'We will practise adding fractions.')
  assert.doesNotMatch(sum.for_adults, /keep the bottom/)
  const prompt = st.calls.find((c) => c.opts.schema?.properties?.praise).opts.messages[1].content
  assert.match(prompt, /make the bottoms the same first/)
})

// ---------------------------------------------------------------- typed questions

test('an empty typed question is not answered, saved or counted', async () => {
  resetStub()
  const s = session('qempty')
  for (const text of ['', '    ', undefined]) {
    const r = await send(s, { type: 'question_typed', ...(text === undefined ? {} : { text }) })
    assert.equal(r.of('answer').length, 0)
    assert.equal(r.hist.length, 0)
  }
  assert.equal(s.questions.length, 0)
  assert.equal(st.calls.length, 0)
})

test('a typed question is about the line it quotes; a question about something else has no line', async () => {
  resetStub()
  const s = session('qabout')
  await send(s, { type: 'part_typed', text: '3/4 + 1/2 = 4/6' })
  await send(s, { type: 'part_typed', text: '2/5 + 1/3 = 3/8' })
  let r = await send(s, { type: 'question_typed', text: 'why is 3/4 + 1/2 not 4/6?' })
  assert.equal(r.last('question').question.pointedAt.partId, 1)
  assert.deepEqual(r.last('answer').answer.visual.rows.map((x) => x.label), ['3/4', '1/2'])
  assert.equal(s.questions.at(-1).about, '3/4+1/2=4/6')
  r = await send(s, { type: 'question_typed', text: 'What is the capital of France?' })
  assert.equal(r.last('question').question.pointedAt, undefined)
  assert.equal(r.last('answer').answer.visual, undefined)
  assert.equal(s.questions.at(-1).about, undefined)
  // "why is it wrong?" is about the newest wrong line
  r = await send(s, { type: 'question_typed', text: 'why is it wrong?' })
  assert.equal(r.last('question').question.pointedAt.partId, 2)
})

// ---------------------------------------------------------------- the topic

test("Laya's guess alone is a topic only within the session's subject", async () => {
  resetStub()
  const s = session('topic')
  layaSays = { kind: 'circuit', probability: 0.64 }
  let r = await read(s, ['If one pen costs 3 pounds, how much do 7 pens cost?'], { verdicts: ['unsure'] })
  assert.equal(r.of('topic').length, 0)
  assert.ok(!(s.kindsSeen || []).includes('circuit'))
  const sci = session('topic2', { subject: 'science' })
  r = await read(sci, ['A lamp and a 9 V battery: what is the current?'], { verdicts: ['unsure'] })
  assert.equal(r.last('topic')?.topic?.kind, 'circuit')
})
