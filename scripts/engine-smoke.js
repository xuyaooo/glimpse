// End-to-end check of the Glimpse engine over HTTP (server must be running: npm run dev).
//   node scripts/engine-smoke.js [baseUrl]
// Replays Glimpse's demo script as typed lines and prints what the engine answers.
const BASE = process.argv[2] || 'http://localhost:3001'
const sessionId = `smoke-${Date.now()}`

async function send(event) {
  const t = performance.now()
  const r = await fetch(`${BASE}/api/engine`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, event }),
  })
  const events = (await r.text()).trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
  return { events, ms: performance.now() - t }
}

const show = (e) => {
  switch (e.type) {
    case 'part':
      return `part #${e.part.id} ${e.part.latex} -> ${e.part.verdict}${e.part.note ? ` (${e.part.note})` : ''}`
    case 'teach':
      return e.teaching ? `teach [${e.teaching.style}, try ${e.teaching.iteration}] "${e.teaching.title}" visual=${e.teaching.visual.kind} | why: ${e.teaching.why}` : 'teach: cleared'
    case 'hint':
      return e.hint ? `hint (${e.hint.lang}): ${e.hint.text}${e.hint.translation ? ` | en: ${e.hint.translation}` : ''}` : 'hint: cleared'
    case 'exercises':
      return `exercises: ${e.items.map((x) => x.id).join(', ') || '(none)'}`
    case 'profile':
      return `profile: ${JSON.stringify(e.profile)}`
    case 'answer':
      return `answer (${e.answer.lang}): ${e.answer.text}${e.answer.translation ? ` | en: ${e.answer.translation}` : ''}${e.answer.visual ? ` [${e.answer.visual.kind}]` : ''}`
    case 'question':
      return `question: "${e.question.text}" pointing at part ${e.question.pointedAt?.partId}`
    case 'confirm':
      return `confirm? ${e.latex}`
    default:
      return null
  }
}

const hello = await (await fetch(`${BASE}/api/engine/hello`)).json()
console.log('hello:', JSON.stringify(hello), '\n')
const steps = [
  { type: 'session_start', student: 'amara', name: 'Amara', lang: 'fr', subject: 'maths' },
  { type: 'part_typed', text: '1/5 + 2/5 = 3/5' },
  { type: 'part_typed', text: '3/4 + 1/2 = 4/6' },
  { type: 'part_typed', text: '2/5 + 1/3 = 3/8' },
  { type: 'part_typed', text: '1/2 + 1/3 = 5/6' },
  { type: 'part_typed', text: '7 + 5 = 12' },
  { type: 'ask_start' },
  { type: 'question_typed', text: 'pourquoi on ne peut pas additionner les nombres du bas ?', partId: 3 },
]
for (const ev of steps) {
  const { events, ms } = await send(ev)
  console.log(`> ${ev.type}${ev.text ? ` "${ev.text}"` : ''}  (${Math.round(ms)} ms)`)
  for (const e of events) {
    const line = show(e)
    if (line) console.log(`    ${line}`)
  }
}
const students = await (await fetch(`${BASE}/api/students`)).json()
const amara = students.find((s) => s.id === 'amara')
console.log('\n/api/students -> amara:', amara ? `${amara.headline} | flag=${amara.flag} | profile=${JSON.stringify(amara.profile)} | today=${JSON.stringify(amara.today)}` : 'missing')
