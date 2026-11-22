// Regression tests for the engine's protocol step (server/engine/session.js): the lines read by
// the camera, the hints, the steps, Laya's learning and the end-of-session summary.
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

// a mock Laya: abstains on everything, records what it is taught
const learned = []
const laya = http.createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    if (req.url === '/learn') learned.push(JSON.parse(body))
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(req.url === '/decide' ? { kind: 'none', probability: 0.2, ms: 1 } : { ok: true }))
  })
})
await new Promise((r) => laya.listen(0, '127.0.0.1', r))
after(() => laya.close())
process.env.DECIDE_URL = `http://127.0.0.1:${laya.address().port}`
process.env.ENGINE_DEBUG = '0'

const { handle, newState, previewScene } = await import('../server/engine/session.js')
const { toJpegBase64 } = await import('../server/images.js')

const st = (globalThis.__stub = {})
function resetStub() {
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
const session = (id, extra = {}) => newState({ id: `qa-g3a-${id}`, student: 'qa-g3a', name: 'Sam', lang: 'en', ...extra })
async function send(s, e) {
  const events = []
  s.history = []
  await handle(s, e, (x) => events.push(x))
  const of = (t) => events.filter((x) => x.type === t)
  return { events, hist: s.history, of, last: (t) => of(t).pop() }
}
// the camera reads `lines`; the tutor model judges them (verdicts, notes) and says `feedback`
function read(s, lines, { verdicts = [], notes = [], feedback = 'fb', kinds = [] } = {}) {
  st.ocr = () => lines.join('\n')
  st.page = () => ({ lines: lines.map((l, i) => ({ n: i + 1, kind: kinds[i] || 'work', verdict: verdicts[i] || 'unsure', ...(notes[i] ? { note: notes[i] } : {}) })), feedback })
  return send(s, { type: 'cut_part', image: frame })
}
const hintText = (r) => r.last('hint')?.hint?.text
const show = (s) => s.parts.map((p) => `${p.id}:${p.plain || p.latex}:${p.verdict}`)
const lineRefs = (r) => r.hist.filter((h) => h.kind === 'line').map((h) => h.ref.split(':').pop())

// ---------------------------------------------------------------- hints agree with the marks

test('the exact check overrules the tutor: its words are replaced, not spoken against the mark', async () => {
  resetStub()
  const s = session('verdict')
  let r = await read(s, ['$7+5=13$'], { verdicts: ['correct'], feedback: 'Well done, 7 + 5 = 13 is right!' })
  assert.equal(s.parts[0].verdict, 'wrong')
  assert.equal(hintText(r), 'Not yet. Check your working.')
  r = await read(s, ['$7+5=13$', '$8+4=12$'], { verdicts: ['wrong', 'wrong'], feedback: 'Not quite: 8 + 4 is 11.' })
  assert.equal(s.parts[1].verdict, 'correct')
  assert.equal(hintText(r), 'Right!')
  const s2 = session('verdict2')
  r = await read(s2, ['$\\frac{3}{4} + \\frac{1}{2} = \\frac{10}{8}$'], { verdicts: ['wrong'], feedback: "You added the top numbers. That's not right." })
  assert.equal(s2.parts[0].verdict, 'correct')
  assert.equal(hintText(r), 'Right! And 10/8 can also be written 5/4.')
  assert.equal(r.hist.find((h) => h.kind === 'line').data.hint, hintText(r)) // the history keeps what was said
  // when the model agrees, its own (more specific) words are kept
  const s3 = session('verdict3')
  r = await read(s3, ['$6 \\times 7 = 42$'], { verdicts: ['correct'], feedback: 'Yes, 6 × 7 = 42. Try 6 × 8 next.' })
  assert.equal(hintText(r), 'Yes, 6 × 7 = 42. Try 6 × 8 next.')
})

test('a wrong line checked exactly gets a computed note, not the model guess', async () => {
  resetStub()
  const s = session('note')
  await read(s, ['$12 + 15 = 37$'], { verdicts: ['wrong'], notes: ['added the tops and the bottoms'] })
  assert.equal(s.parts[0].note, 'had one ten too many: add the tens again') // computed: 27, not 37
})

test('a whole number is written as one: "2/2 can also be written 1", not 1/1', async () => {
  resetStub()
  const s = session('whole')
  let r = await send(s, { type: 'part_typed', text: '1/2 + 1/2 = 2/2' })
  assert.equal(s.parts[0].note, 'also 1')
  assert.equal(hintText(r), 'Right! And 2/2 can also be written 1.')
  r = await send(s, { type: 'part_typed', text: '1/2 + 3/2 = 4/2' })
  assert.equal(s.parts[1].note, 'also 2')
})

test('"Two in a row!" is said once, on the second right line', async () => {
  resetStub()
  const s = session('streak')
  await send(s, { type: 'part_typed', text: '1/2 + 1/3 = 5/6' })
  assert.match(hintText(await send(s, { type: 'part_typed', text: '1/4 + 1/4 = 1/2' })), /^Two in a row/)
  assert.equal(hintText(await send(s, { type: 'part_typed', text: '7 + 5 = 12' })), 'Right!')
  assert.equal(hintText(await send(s, { type: 'part_typed', text: '1/3 + 1/3 = 2/3' })), 'Right!')
})

test('confirm_reply only answers the line waiting for it', async () => {
  resetStub()
  const s = session('confirm')
  await send(s, { type: 'part_typed', text: '1 + 1 = 2' })
  await send(s, { type: 'confirm_reply', partId: 1, ok: false })
  assert.equal(s.parts[0].verdict, 'correct')
  assert.equal(s.parts[0].note, undefined)
  await send(s, { type: 'part_typed', text: '\\frac{1}{2} + \\frac{1}{3} =' })
  assert.equal(s.awaiting, 2)
  const r = await send(s, { type: 'confirm_reply', partId: 2, ok: true })
  assert.equal(s.parts[1].verdict, 'unsure')
  assert.equal(hintText(r), "I read: 1/2 + 1/3 =. That's not a sum I can check yet.") // plain text, no LaTeX
  assert.equal(s.streak, 1)
})

test('a taught sum fixed with a whole-number answer counts as a win for the style', async () => {
  resetStub()
  const s = session('wholefix')
  await send(s, { type: 'part_typed', text: '1/4+3/4=4/8' })
  assert.equal(s.lastTeach.style, 'pictures')
  const r = await send(s, { type: 'part_typed', text: '1/4+3/4=1' })
  assert.deepEqual(s.profile, { pictures: { tries: 1, wins: 1 } })
  assert.equal(s.misconceptions.adds_across.status, 'fixed')
  assert.equal(s.lastTeach, null)
  assert.equal(hintText(r), 'Well done! The pictures did it.')
})

test('typed lines are saved to the history, and cut to one line of maths', async () => {
  resetStub()
  const s = session('typed')
  let r = await send(s, { type: 'part_typed', text: '1/2 + 1/3 = 2/5' })
  assert.deepEqual(lineRefs(r), ['1'])
  assert.equal(r.hist[0].data.verdict, 'wrong')
  r = await send(s, { type: 'part_typed', text: `1+1=2${' '.repeat(10)}${'a'.repeat(100000)}` })
  assert.ok(s.parts[1].raw.length <= 300)
  assert.ok(hintText(r).length < 120)
})

test('answers never show raw JSON or LaTeX, and typed questions are saved', async () => {
  resetStub()
  const s = session('answers')
  await send(s, { type: 'part_typed', text: '1/2 + 1/3 = 2/5' })
  st.answer = () => ({ answer: 'Make the bottoms the same first.' })
  let r = await send(s, { type: 'question_typed', text: 'why?' })
  assert.equal(r.last('answer').answer.text, 'Make the bottoms the same first.')
  assert.equal(r.hist.filter((h) => h.kind === 'question').length, 1)
  st.answer = () => ({ text: '', translation_en: '' })
  r = await send(s, { type: 'question_typed', text: 'why?' })
  assert.equal(r.last('answer').answer.text, 'Have another look at this line.')
  st.point = () => ({ text: 'a reply in the wrong field' })
  r = await send(s, { type: 'point', image: frame, x: 0.5, y: 0.5 })
  assert.equal(r.last('answer').answer.text, 'a reply in the wrong field')
  st.point = () => ({ pointed: '', answer: 'The rule for \\frac{1}{1+x} is \\ln|1+x|.' })
  r = await send(s, { type: 'point', image: frame, x: 0.5, y: 0.5 })
  assert.equal(r.last('answer').answer.text, 'The rule for 1/(1+x) is ln|1+x|.')
  st.point = () => ({ pointed: '', answer: '' })
  r = await send(s, { type: 'point', image: frame, x: 0.5, y: 0.5 })
  assert.doesNotMatch(r.last('answer').answer.text, /[{}"]/)
})

// ---------------------------------------------------------------- the lines of the paper

test('a new sheet never replaces the lines (or history) of the last one', async () => {
  resetStub()
  const s = session('sheet')
  await read(s, ['$\\frac{1}{8} + \\frac{6}{4} = \\frac{7}{4}$', '$\\frac{3}{4} + \\frac{1}{2} = \\frac{4}{6}$'])
  const r = await read(s, ['$\\frac{4}{5} - \\frac{1}{6} = \\frac{19}{30}$', '$\\frac{2}{3} + \\frac{1}{6} = \\frac{5}{6}$'])
  assert.deepEqual(show(s).map((x) => x.split(':').pop()), ['wrong', 'wrong', 'correct', 'correct'])
  assert.deepEqual(lineRefs(r), ['3', '4'])
  const s2 = session('sheet2')
  await read(s2, ['1/2+1/3=5/6'])
  await read(s2, ['1/2+1/4=3/4'])
  assert.equal(s2.parts.length, 2)
})

test('the same sheet read again stays the same lines, whatever the OCR formatting', async () => {
  resetStub()
  const s = session('same')
  await read(s, ['$6 × 7 = 42$', '$= 6 × 89$'])
  await read(s, ['$6 \\times 7 = 42$', '$= 6 \\times 89$'])
  assert.equal(s.parts.length, 2)
  const s2 = session('jitter')
  await read(s2, ['$3+4=7$', '$1/2 + 1/3 = 2/5$'])
  for (const last of ['$1/2+1/3=2/5$', '$\\frac{1}{2} + \\frac{1}{3} = \\frac{2}{5}$']) {
    const r = await read(s2, ['$3+4=7$', last])
    assert.equal(r.of('teach').length, 0)
  }
  assert.equal(s2.parts.length, 2)
  assert.equal(s2.misconceptions.adds_across.seen, 1)
  assert.deepEqual(s2.profile, {})
})

test('a line the OCR missed changes nothing, and no other line takes its place', async () => {
  resetStub()
  const s = session('missed')
  await read(s, ['$1/2+1/2=1$', '$1/2+1/3=2/5$'])
  let r = await read(s, ['$1/2+1/2=1$']) // the newest line under the hand
  assert.equal(r.of('teach').length, 0)
  assert.equal(s.misconceptions.adds_across.status, 'working')
  assert.equal(s.lastTeach.partId, 2)
  const s2 = session('middle')
  await read(s2, ['$3+4=7$', '$5+6=12$', '$8+1=9$'])
  r = await read(s2, ['$3+4=7$', '$8+1=9$'])
  assert.deepEqual(show(s2), ['1:3+4=7:correct', '2:5+6=12:wrong', '3:8+1=9:correct'])
  assert.ok(!lineRefs(r).includes('2'))
  await read(s2, ['$3+4=7$', '$5+6=12$', '$8+1=9$', '$2+2=4$'])
  assert.deepEqual(show(s2).at(-1), '4:2+2=4:correct')
  assert.equal(s2.parts.length, 4)
})

test('every line read is saved with its photo, and a corrected line is updated', async () => {
  resetStub()
  const s = session('history')
  let r = await read(s, ['$1/2+1/3=5/6$', '$2/5+1/5=3/5$'])
  assert.deepEqual(lineRefs(r), ['1', '2'])
  assert.ok(r.of('part').every((e) => e.part.crop?.startsWith('data:image/jpeg')))
  assert.ok(r.hist.every((h) => h.data.photo))
  const s2 = session('corrected')
  await read(s2, ['1/2+1/3=2/5'])
  await read(s2, ['1/2+1/3=2/5', '3+4=7'])
  r = await read(s2, ['$1/2+1/3=5/6$', '$3+4=7$'])
  assert.equal(r.hist.find((h) => h.ref.endsWith(':line:1')).data.verdict, 'correct')
  assert.ok(r.of('part').find((e) => e.part.id === 1).part.crop)
  assert.equal(s2.misconceptions.adds_across.status, 'fixed')
})

test('typed lines keep their ids when the camera reads the sheet again', async () => {
  resetStub()
  const s = session('typedcam')
  await read(s, ['$3+4=7$', '$5+5=10$'])
  await send(s, { type: 'part_typed', text: '1/2 + 1/3 = 2/5' })
  await read(s, ['$3+4=7$', '$5+5=10$', '$9-2=7$'])
  assert.deepEqual(show(s), ['1:3+4=7:correct', '2:5+5=10:correct', '3:1/2+1/3=2/5:wrong', '4:9-2=7:correct'])
  assert.equal(s.misconceptions.adds_across.status, 'working')
})

test('going back to an earlier sheet updates its lines', async () => {
  resetStub()
  const s = session('back')
  await read(s, ['$3+4=7$', '$5+6=12$'])
  await read(s, ['$x^2=16$'])
  await read(s, ['$3+4=7$', '$5+6=11$'])
  assert.equal(s.parts.length, 3)
  assert.equal(s.parts.find((p) => p.id === 2).verdict, 'correct')
})

test('each wrong line on one photo counts, and the sums on the page are not offered again', async () => {
  resetStub()
  const s = session('photo2')
  await read(s, ['$3/4+1/2=4/6$', '$2/5+1/3=3/8$'])
  assert.equal(s.misconceptions.adds_across.seen, 2)
  assert.deepEqual(s.misconceptions.adds_across.styles, ['pictures']) // one teaching, for the newest line
  assert.ok(!s.exercises.some((e) => ['3/4+1/2', '2/5+1/3'].includes(e.id)))
})

test('a session saved before sheets were kept goes on with its lines', async () => {
  resetStub()
  const s = session('old')
  await read(s, ['$3+4=7$', '$5+6=12$'])
  delete s.sheets
  delete s.sheet
  await read(s, ['$3+4=7$', '$5+6=11$'])
  assert.deepEqual(show(s), ['1:3+4=7:correct', '2:5+6=11:correct'])
})

// ---------------------------------------------------------------- worked steps and animations

test('steps: the title is the exercise without the wrong answer, and no photo when the text computes', async () => {
  resetStub()
  const s = session('about', { age: 9 })
  st.steps = () => ({ title: 'Steps', steps: [{ say: 'multiply', math: '6 \\times 7 = 42' }], result: '42', exercise: '6 \\times 7' })
  const r = await read(s, ['$6 × 7 = 48$'], { verdicts: ['wrong'] })
  const steps = r.last('steps').steps
  assert.equal(steps.about, '6 × 7')
  assert.equal(steps.result, '42')
  const call = st.calls.filter((c) => c.opts.schema?.properties?.steps).pop()
  assert.equal(call.opts.messages[1].images, undefined)
})

test('steps: the computed answer and the tutor answer are never shown disagreeing', async () => {
  resetStub()
  const run = async (line, result) => {
    st.steps = () => ({ title: 'Steps', steps: [{ say: 'do it', math: 'x' }], result, exercise: '' })
    const r = await read(session(`net${Math.random()}`, { age: 15 }), [line], { verdicts: ['unfinished'] })
    return r.last('steps').steps
  }
  // the animation's value is the written arithmetic, computed exactly: the tutor's working goes
  let steps = await run('$\\frac{1}{2} + \\frac{1}{3} =$', '\\frac{2}{5}')
  assert.equal(steps.scene.kind, 'fractions')
  assert.equal(steps.result, '\\frac{5}{6}')
  assert.equal(steps.items.length, 0)
  // no answer in common: the rules read another exercise, the animation goes
  steps = await run('$3x + 5 = 20$', 'x = 6')
  assert.equal(steps.scene, undefined)
  assert.equal(steps.result, 'x = 6')
  assert.equal(steps.items.length, 1)
  // approximately equal: the exact form is shown
  steps = await run('$\\int_0^1 \\frac{1}{1+x} dx$', '\\ln 2 \\approx 0.693')
  assert.equal(steps.scene.kind, 'area')
  assert.equal(steps.result, '\\ln 2 \\approx 0.693')
  steps = await run('$\\frac{1}{2} + \\frac{1}{3} =$', '0.833')
  assert.equal(steps.result, '\\frac{5}{6}')
  // the same answers, written differently, or only some of them: the computed result stays
  for (const [line, result, shown] of [
    ['$x^2 - 5x + 6 = 0$', 'x = 3 \\text{ or } x = 2', 'x = 2,\\ x = 3'],
    ['$x^2 - 5x + 6 = 0$', 'x = 2', 'x = 2,\\ x = 3'],
    ['$x^2 - 4 = 0$', 'x = \\pm 2', 'x = -2,\\ x = 2'],
    ['$68 \\times 74 =$', '5,032', '5032'],
    ['$2x + y = 5, x - y = 1$', '(2, 1)', 'x = 2,\\ y = 1'],
  ]) {
    steps = await run(line, result)
    assert.ok(steps.scene, line)
    assert.equal(steps.result, shown, line)
  }
})

test('Laya learns only from real sessions, never from the GET /api/scene preview', async () => {
  resetStub()
  learned.length = 0
  const settle = () => new Promise((r) => setTimeout(r, 100))
  for (const t of ['3+4', '12*11', '20\\% of 50']) assert.ok(await previewScene(t, 9))
  await settle()
  assert.deepEqual(learned, [])
  st.steps = () => ({ title: 'S', steps: [{ say: 'add', math: '7' }], result: '7', exercise: '' })
  await read(session('laya'), ['$3 + 4 =$'], { verdicts: ['unfinished'] })
  await settle()
  assert.deepEqual(learned, []) // a qa- session is test traffic
  await read(newState({ id: 'unit-real', student: 'unit', name: 'U', lang: 'en' }), ['$3 + 4 =$'], { verdicts: ['unfinished'] })
  await settle()
  assert.deepEqual(learned, [{ text: '$3 + 4 =$', kind: 'count' }])
  // an animation dropped because the rules misread the exercise is not learned
  // (the rules read a dice chance, 1/6; the tutor answers 7: the animation is dropped)
  assert.equal((await previewScene('sum of 7 with two dice', 9))?.kind, 'chance')
  st.steps = () => ({ title: 'S', steps: [{ say: 'add', math: '7' }], result: '7', exercise: '' })
  const dropped = await read(newState({ id: 'unit-real2', student: 'unit', name: 'U', lang: 'en' }), ['sum of 7 with two dice'], { verdicts: ['unfinished'] })
  await settle()
  assert.equal(dropped.last('steps').steps.result, '7')
  assert.equal(dropped.last('steps').steps.scene, undefined)
  assert.equal(learned.length, 1)
})

// ---------------------------------------------------------------- the summary

test('summary: no gendered pronoun, and grammatical replacements', async () => {
  resetStub()
  const s = session('pronouns')
  await send(s, { type: 'part_typed', text: '1/2 + 1/3 = 5/6' })
  st.summary = () => ({
    title: 'She added the fractions.',
    praise: 'Sam checked his 1/2 + 1/3 line.',
    practised: ['Adding fractions'],
    mistakes: [],
    next: 'Sam can do it by herself.',
    for_adults: 'Encourage her to check each answer, and help him write neatly. Ask her to try one more. Check her 2/5 answer. Give her time.',
  })
  const sm = (await send(s, { type: 'session_end' })).last('summary').summary
  assert.equal(sm.for_adults, "Encourage Sam to check each answer, and help Sam write neatly. Ask Sam to try one more. Check Sam's 2/5 answer. Give Sam time.")
  assert.equal(sm.title, 'Sam added the fractions.')
  assert.equal(sm.praise, "Sam checked Sam's 1/2 + 1/3 line.")
  assert.doesNotMatch(`${sm.title} ${sm.praise} ${sm.next} ${sm.for_adults}`, /\b(he|she|his|her|him|hers|himself|herself)\b/i)
  const s2 = session('noname', { name: undefined })
  await send(s2, { type: 'part_typed', text: '1/2 + 1/3 = 5/6' })
  let prompt = ''
  st.summary = (opts) => {
    prompt = opts.messages[0].content
    return { title: 'Nice', praise: 'Then he added the tops.', practised: ['Fractions'], mistakes: [], next: 'More.', for_adults: 'She did well.' }
  }
  const sm2 = (await send(s2, { type: 'session_end' })).last('summary').summary
  assert.doesNotMatch(prompt, /Sam/)
  assert.equal(sm2.praise, 'Then the student added the tops.')
  assert.equal(sm2.for_adults, 'The student did well.')
})

test('summary: the model output is checked for shape, and recognised topics are never cut', async () => {
  resetStub()
  const s = session('shape')
  await send(s, { type: 'part_typed', text: '1/2 + 1/3 = 5/6' })
  s.kindsSeen = ['fractions', 'trig', 'percent']
  st.summary = () => ({ title: 'T', praise: 'P', practised: 'Using a common denominator', mistakes: [null, 'added tops', { what: 'kept a bottom', tip: 't' }], next: 'n', for_adults: 'a' })
  const sm = (await send(s, { type: 'session_end' })).last('summary').summary
  assert.deepEqual(sm.practised, ['Using a common denominator', 'Fractions', 'Trigonometry', 'Percentages'])
  assert.deepEqual(sm.mistakes, [{ what: 'added tops', tip: '' }, { what: 'kept a bottom', tip: 't' }])
  const s2 = session('topics')
  await send(s2, { type: 'part_typed', text: '1/2 + 1/3 = 5/6' })
  s2.kindsSeen = ['fractions', 'percent']
  st.summary = () => ({ title: 'T', praise: 'P', practised: ['Number sense', 'Mental maths', 'Checking work', 'Estimation'], mistakes: [], next: 'n', for_adults: 'a' })
  const sm2 = (await send(s2, { type: 'session_end' })).last('summary').summary
  assert.ok(sm2.practised.includes('Fractions') && sm2.practised.includes('Percentages'))
  assert.ok(sm2.practised.length <= 5)
})

test('summary without the model: grammatical, one line per mistake, fixed ones not "working on"', async () => {
  resetStub()
  const s = session('fallback')
  await send(s, { type: 'part_typed', text: '1/2 + 1/3 = 5/7' })
  let sm = (await send(s, { type: 'session_end' })).last('summary').summary
  assert.deepEqual(sm.mistakes.map((m) => m.what), ['You didn’t get the right total.'])
  const s2 = session('fallback2')
  await send(s2, { type: 'part_typed', text: '1/2 + 1/3 = 2/6' })
  await send(s2, { type: 'part_typed', text: '1/4 + 1/6 = 2/12' })
  sm = (await send(s2, { type: 'session_end' })).last('summary').summary
  assert.deepEqual(sm.mistakes.map((m) => m.what), ['You changed the bottom, not the top.'])
  const s3 = session('fallback3')
  await send(s3, { type: 'part_typed', text: '1/2 + 1/3 = 2/5' })
  await send(s3, { type: 'part_typed', text: '1/2 + 1/3 = 5/6' })
  sm = (await send(s3, { type: 'session_end' })).last('summary').summary
  assert.doesNotMatch(sm.for_adults, /Working on/)
  assert.match(sm.for_adults, /Fixed today: Adds the tops and the bottoms\./)
})

test('summary: in the session language, without English topics added', async () => {
  resetStub()
  const empty = (await send(session('fr0', { lang: 'fr' }), { type: 'session_end' })).last('summary').summary
  assert.equal(empty.title, 'Merci pour ta visite !')
  assert.equal(empty.lang, 'fr')
  const s = session('fr1', { lang: 'fr' })
  await send(s, { type: 'part_typed', text: '1/2 + 1/3 = 2/5' })
  let sm = (await send(s, { type: 'session_end' })).last('summary').summary
  assert.equal(sm.praise, 'Tu as écrit 1 ligne (0 juste).')
  assert.match(sm.for_adults, /^Sam a écrit 1 ligne/)
  const s2 = session('de1', { lang: 'de' })
  await send(s2, { type: 'part_typed', text: '1/2 + 1/3 = 5/6' })
  s2.kindsSeen = ['fractions']
  let prompt = ''
  st.summary = (opts) => {
    prompt = opts.messages[1].content
    return { title: 'Bruch-Profi!', praise: 'Super', practised: ['Bruchaddition'], mistakes: [], next: 'n', for_adults: 'a' }
  }
  sm = (await send(s2, { type: 'session_end' })).last('summary').summary
  assert.deepEqual(sm.practised, ['Bruchaddition'])
  assert.match(prompt, /Write every field in German/)
  // a language the counted summary doesn't have is marked as the English it is written in
  const tr = (await send(session('tr0', { lang: 'tr' }), { type: 'session_end' })).last('summary').summary
  assert.equal(tr.lang, 'en')
})

// ---------------------------------------------------------------- a sheet mixing subjects

test('a sheet mixing subjects: every exercise counts, each with its subject, solved and filed as it', async () => {
  resetStub()
  const s = session('mixed', { subject: 'maths' })
  const lines = ['Exercise Sheet', '$376 + 447 =$', 'How long does it take to drive 150 km at 60 km/h?', '$24 ÷ 6 =$']
  st.ocr = () => lines.join('\n')
  // seen live: the model took the speed question for printed text
  st.page = (opts) => {
    st.prompt = opts.messages.map((m) => m.content).join('\n')
    return { lines: lines.map((l, i) => ({ n: i + 1, kind: i === 1 || i === 3 ? 'work' : 'printed', verdict: 'unfinished' })), feedback: 'fb' }
  }
  const r = await send(s, { type: 'check_sheet', image: frame })
  const sheet = r.last('sheet').sheet
  assert.deepEqual(sheet.items.map((x) => [x.subject, x.verdict]), [['maths', 'unfinished'], ['science', 'unfinished'], ['maths', 'unfinished']])
  assert.match(st.prompt, /\[science\] How long does it take/) // the tutor is told which line is science
  assert.match(st.prompt, /WHOLE sheet/)
  assert.doesNotMatch(st.prompt, /\[reading\] Exercise Sheet/) // a heading is no subject
  assert.equal(s.subject, 'maths') // the session stays maths
  assert.equal(r.hist.find((h) => h.kind === 'line' && /drive/.test(h.data.latex)).data.subject, 'science')
  // "Help me" on the speed question: solved as science, with its animation, filed under science
  st.steps = (opts) => {
    st.solve = opts.messages[0].content
    return { hints: ['Speed is distance divided by time.'], steps: [{ say: 'divide', math: '150 \\div 60' }], result: '2.5\\text{ h}', exercise: '' }
  }
  const speed = sheet.items[1]
  const ex = await send(s, { type: 'explain', partId: speed.partId })
  assert.match(st.solve, /science tutor/)
  assert.equal(ex.last('steps').steps.scene?.kind, 'speed')
  assert.equal(ex.hist.find((h) => h.kind === 'steps').data.subject, 'science')
})

test('a worded problem with numbers is maths, and a mark whose note is about another line is not kept', async () => {
  resetStub()
  const s = session('farmer', { subject: 'maths' })
  const farmer = 'A farmer has a field that is 120 m long and 80 m wide. He wants to put a fence all around it. How many metres of fence does he need?'
  const lines = [farmer, '$$1 + 2 + 3 + 4 + 5 + 6 + 7$$', '$24 : 6 = 4$']
  st.ocr = () => lines.join('\n')
  st.page = () => ({
    lines: [
      { n: 1, kind: 'work', verdict: 'unfinished' },
      { n: 2, kind: 'work', verdict: 'wrong', note: 'You added numbers that are not the sides of the field. The fence goes around the outside.' },
      { n: 3, kind: 'work', verdict: 'correct' },
    ],
    feedback: 'fb',
  })
  const r = await send(s, { type: 'check_sheet', image: frame })
  const items = r.last('sheet').sheet.items
  assert.equal(items[0].subject, 'maths') // not science: the rules see no science in it
  assert.deepEqual([items[1].verdict, items[1].note], ['unsure', null]) // the fence note was about line 1
  assert.equal(items[2].verdict, 'right')
})
