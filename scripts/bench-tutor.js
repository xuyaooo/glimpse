// Tutor benchmark through the real API (server must be running: npm run dev).
//   node scripts/bench-tutor.js [model1,model2,...]
// Default: every installed tutor model from /api/health. Exercises are given as text
// (what GLM-OCR produces), without the photo.
const BASE = process.env.API || 'http://localhost:3001'

const CHECKS = [
  ['Factor and solve: $x^2-5x+6=0$', '$(x-1)(x-6)=0$\n$x=1$ or $x=6$', false],
  ['Factor and solve: $x^2-5x+6=0$', '$(x-2)(x-3)=0$\n$x=2$ or $x=3$', true],
  ['Solve for x: $3x + 7 = 22$', '$3x = 22 + 7$\n$3x = 29$\n$x = 29/3$', false],
  ['Solve for x: $3x + 7 = 22$', '$3x = 15$\n$x = 5$', true],
  ['A rectangle has a perimeter of 30 cm and its length is twice its width. Find the area.', '$2(w + 2w) = 30$\n$6w = 30$\n$w = 5$, $l = 10$\n$A = 50$ cm²', true],
  ['A rectangle has a perimeter of 30 cm and its length is twice its width. Find the area.', '$w + 2w = 30$\n$3w = 30$\n$w = 10$, $l = 20$\n$A = 200$ cm²', false],
  ['Compute the derivative of $f(x) = x^3 \\sin x$', "$f'(x) = 3x^2 \\cos x$", false],
  ['Compute the derivative of $f(x) = x^3 \\sin x$', "$f'(x) = 3x^2 \\sin x + x^3 \\cos x$", true],
  ['Add the fractions: $\\frac{1}{3} + \\frac{1}{4}$', '$\\frac{1}{3} + \\frac{1}{4} = \\frac{2}{7}$', false],
  ['Simplify: $(2a^3)^2$', '$(2a^3)^2 = 4a^6$', true],
]

const SOLVES = [
  ['Solve for x: $3x + 7 = 22$', /x\s*=\s*5\b|\\boxed\{\s*5\s*\}|\\boxed\{x\s*=\s*5\}/],
  ['Factor and solve: $x^2-5x+6=0$', /2[\s\S]{0,40}3/],
  ['A rectangle has a perimeter of 30 cm and its length is twice its width. Find the area.', /\b50\b/],
]

async function tutor(body) {
  const t0 = performance.now()
  const r = await fetch(`${BASE}/api/tutor`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sendImage: false, ...body }),
  })
  if (!r.ok) throw new Error((await r.json()).error)
  let text = ''
  let first = null
  let thinkingChars = 0
  const dec = new TextDecoder()
  let buf = ''
  for await (const chunk of r.body) {
    buf += dec.decode(chunk, { stream: true })
    let nl
    while ((nl = buf.indexOf('\n')) >= 0) {
      const ev = JSON.parse(buf.slice(0, nl))
      buf = buf.slice(nl + 1)
      if (ev.type === 'thinking') thinkingChars += ev.text.length
      if (ev.type === 'delta') {
        if (first === null) first = performance.now() - t0
        text += ev.text
      }
      if (ev.type === 'error') throw new Error(ev.error)
    }
  }
  return { text, first: first ?? performance.now() - t0, total: performance.now() - t0, thinkingChars }
}

const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length
const sec = (ms) => `${(ms / 1000).toFixed(1)} s`

const health = await (await fetch(`${BASE}/api/health`)).json()
const models = process.argv[2]
  ? process.argv[2].split(',')
  : health.tutor.models.filter((m) => m.ready).map((m) => m.name)
console.log(`Models: ${models.join(', ')}  (exercise given as OCR text, no photo)\n`)

for (const model of models) {
  console.log(`=== ${model}`)
  await tutor({ model, action: 'hint', exercise: { text: 'Solve $x+1=2$' } }) // warm-up (load model)

  // 1. hints: speed
  const hints = []
  for (const [ex] of CHECKS.slice(0, 4)) hints.push(await tutor({ model, action: 'hint', exercise: { text: ex } }))
  console.log(`hint     first word ${sec(avg(hints.map((h) => h.first)))}, full hint ${sec(avg(hints.map((h) => h.total)))}`)
  console.log(`         e.g. "${hints[0].text.replace(/\s+/g, ' ').slice(0, 140)}…"`)

  // 2. checking work: accuracy + speed (no thinking)
  let right = 0
  const times = []
  const wrong = []
  for (const [ex, work, isCorrect] of CHECKS) {
    const r = await tutor({ model, action: 'check', exercise: { text: ex }, work })
    const saidCorrect = /^\s*(✅|\*\*✅)/.test(r.text)
    if (saidCorrect === isCorrect) right++
    else wrong.push(`${isCorrect ? 'RIGHT' : 'WRONG'} work judged ${saidCorrect ? 'correct' : 'wrong'}: ${ex.slice(0, 40)}`)
    times.push(r.total)
  }
  console.log(`check    ${right}/${CHECKS.length} judged correctly, avg ${sec(avg(times))}`)
  for (const w of wrong) console.log(`         ✗ ${w}`)

  // 3. full solutions (thinking on by default)
  let solved = 0
  const st = []
  for (const [ex, answer] of SOLVES) {
    const r = await tutor({ model, action: 'solve', exercise: { text: ex } })
    if (answer.test(r.text)) solved++
    st.push(r)
  }
  console.log(
    `solve    ${solved}/${SOLVES.length} correct final answers, avg ${sec(avg(st.map((r) => r.total)))} (first word ${sec(avg(st.map((r) => r.first)))}, ~${Math.round(avg(st.map((r) => r.thinkingChars)) / 4)} thinking tokens)\n`,
  )
}
