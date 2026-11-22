// Regressions for the UX test findings in the animations' maths (server/engine/scenes.js,
// domains.js) and Practise again (server/engine/review.js): exact or "≈" values, never a rounded
// value with "=", captions, and suggestions shown once and as they read.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sceneFor } from '../server/engine/scenes.js'
import { suggestReview, variantOf, reviewKey } from '../server/engine/review.js'

const S = (exercise, age = 15) => sceneFor({ exercise, age })
const R = (exercise, age) => S(exercise, age)?.resultTex ?? null
const captions = (sc) => sc.stages.map((x) => x.caption).join(' ')

// ---------------------------------------------------------------- exact, or written with ≈

test('simultaneous equations: fractions, never rounded decimals with "="', () => {
  assert.equal(R('x + 2y = 1, 3x - 7y = 2'), 'x = \\frac{11}{13},\\ y = \\frac{1}{13}')
  assert.equal(R('2x + 3y = 1, x - 7y = 2'), 'x = \\frac{13}{17},\\ y = -\\frac{3}{17}')
  assert.equal(R('x + y = 5, x - y = 1'), 'x = 3,\\ y = 2')
  assert.match(captions(S('x + 2y = 1, 3x - 7y = 2')), /\(11\/13, 1\/13\)/)
})

test('limits, slopes, trig and graph roots that are rounded say ≈', () => {
  assert.equal(R('lim x->oo (x+1)/(13x)'), '\\frac{1}{13}')
  assert.equal(R('lim x->0 (1+x)^(1/x)'), '\\approx 2.718')
  assert.match(S('lim x->0 (1+x)^(1/x)').stages.at(-1).math, /\\approx 2\.718$/)
  assert.equal(R('sin 15°'), '\\approx 0.259')
  assert.equal(R('sin 30°'), '\\frac{1}{2}')
  assert.equal(R('y = x^2 - 2'), 'x \\approx -1.414,\\ x \\approx 1.414')
  assert.equal(R("f(x) = e^x, f'(1)"), "f'(1) \\approx 2.718")
  assert.equal(R('d/dx x^3'), "f'(1) = 3")
})

test('a decimal that does not end is not exact, however big (1000/3 + 1)', () => {
  assert.equal(R('1000 / 3 + 1 =', 12), null)
  assert.equal(R('1 / 3 + 1 =', 12), null)
  assert.equal(R('mean of 1000, 1001, 1001', 12), '\\frac{3002}{3} \\approx 1000.667')
  assert.equal(R('0.25 * 0.25 + 1', 12), '1.0625')
  assert.equal(R('1234567.8 * 3 + 1', 12), '3703704.4')
})

test('chance: "= 0.375" for an exact decimal, nothing after 1, ≈ only when rounded', () => {
  assert.equal(S('A bag has 4 red and 0 blue balls. Probability of red?', 12).stages[2].math, 'P = \\frac{4}{4} = 1')
  assert.equal(S('bag with 3 red and 5 blue balls, P(red)', 12).stages[2].math, 'P = \\frac{3}{8} = 0.375')
  assert.equal(S('bag with 1 red and 2 blue balls, P(red)', 12).stages[2].math, 'P = \\frac{1}{3} \\approx 0.333')
})

// ---------------------------------------------------------------- the pictures and captions

test('the limit of 1/x keeps the curve in the picture (the far values stay in the captions)', () => {
  const sc = S('lim x->0 1/x')
  const { y0, y1 } = sc.plot.bounds
  assert.ok(y0 > -20 && y1 < 20, `${y0} .. ${y1}`)
  assert.ok(sc.plot.markers.every((m) => m.y >= y0 && m.y <= y1))
  assert.match(captions(sc), /f\(0\.001\) = 1000/)
  // a limit with everything near the curve is not cut
  assert.equal(S('lim x->2 (x^2-4)/(x-2)').plot.bounds.y0, undefined)
})

test('limit captions: values never rounded onto the limit, and "falls" without end for minus infinity', () => {
  const sinc = captions(S('lim x->0 sin(x)/x'))
  assert.doesNotMatch(sinc, /f\(-?0\.0+1\) = 1[,.]/)
  assert.match(sinc, /f\(0\.01\) = 0\.99998/)
  assert.match(captions(S('lim x->0+ ln(x)')), /falls without end: the limit is minus infinity/)
  assert.match(captions(S('lim x->0 x^3')), /1 × 10\^-9/)
})

test('graphs: a double root once, a touching root found, and "never meets the x-axis" with a result', () => {
  assert.equal(R('y = x^2 - 0.2x + 0.01'), 'x = 0.1')
  assert.equal(R('y = 9x^2 - 6x + 1'), 'x = \\frac{1}{3}')
  assert.equal(R('y = x^2'), 'x = 0')
  const inv = S('y = 1/x')
  assert.equal(inv.resultTex, '\\text{no roots}')
  assert.ok(inv.stages.length >= 3)
  assert.match(captions(inv), /never meets the x-axis/)
})

test('integrals: bounds with π as written, and a negative or cancelling integral said so', () => {
  const a = S('S_{pi}^{2pi} sin x dx')
  assert.equal(a.stages[1].math, '\\int_{\\pi}^{2\\pi} \\sin x\\,dx')
  assert.match(a.stages[1].caption, /from x = π to x = 2π/)
  assert.match(captions(a), /below the x-axis/)
  assert.match(captions(S('S_{-1}^{2} x^2 - 1 dx')), /counts minus: together about 0/)
  assert.match(captions(S('\\int_0^1 x^2 dx')), /The area is about 0\.333/)
})

test('trig with the student\'s answer after "=" still gets its animation', () => {
  assert.equal(R('sin 30° = 0.6', 14), '\\frac{1}{2}')
  assert.equal(R('sin 30° =', 14), '\\frac{1}{2}')
  assert.equal(S('3 / 2 + 1 = \\frac{5}{2}', 12)?.kind, 'order_ops')
})

test('captions: no "+ 0x", no "...." and powers past 6 say every product', () => {
  assert.equal(S('x^2 + 1 = 0').stages[0].math, 'y = x^2 + 1')
  assert.equal(S('x^2 - x = 0').stages[0].math, 'y = x^2 - x')
  assert.doesNotMatch(captions(S('12 x 12', 9)), /\.\.\.\./)
  assert.doesNotMatch(captions(S('144 / 12', 12)), /\.\.\.\./)
  assert.match(captions(S('2^10 =', 9)), /128, 256, 512, 1024/)
  // the fraction picture's last stage says the simplified answer
  assert.deepEqual(S('3/2 + 3/2', 9).stages.at(-1).simple, { n: 3, d: 1 })
})

test('science captions: 1 000 000 mm, R = 4/3 Ω, the mice eat', () => {
  assert.match(captions(S('Convert 1 km to mm', 12)), /1 km = 1 000 000 mm/)
  const c = S('Resistors of 2 ohms and 4 ohms in parallel with 12 V. Current?', 12)
  assert.match(captions(c), /R = 4\/3 Ω/)
  assert.doesNotMatch(c.stages.map((x) => x.math).join(' '), /1\.3333/)
  assert.equal(c.resultTex, 'I = 9\\,\\text{A}')
  const f = captions(S('Owls eat mice and mice eat seeds', 12))
  assert.match(f, /The mice eat the seeds/)
  assert.match(f, /The seeds are producers/)
  assert.doesNotMatch(f, /mice eats|seeds is/)
})

// ---------------------------------------------------------------- Practise again

test('Practise again: "3 x -2" is 3 × (-2), never 3x − 2', () => {
  const r = suggestReview({ seed: 'qa-ux-n', lines: [{ latex: '3 x -2 = 6', verdict: 'wrong' }] })
  assert.equal(r[0].exercise, '3 \\times (-2)')
  assert.equal(r[0].answer, '-6')
  assert.ok(r.every((x) => !/x - \d/.test(x.exercise)), r.map((x) => x.exercise).join(' | '))
})

test('Practise again: one exercise once, written 6 x 7, 6 * 7, 3/4 or \\frac{3}{4}', () => {
  let r = suggestReview({ seed: 'qa-ux-d', lines: [{ latex: '6 x 7 = 48', verdict: 'wrong' }, { latex: '6 * 7 = 45', verdict: 'wrong' }] })
  assert.equal(new Set(r.map((x) => reviewKey(x.exercise))).size, r.length)
  r = suggestReview({ seed: 'qa-ux-d', lines: [{ latex: '3/4 + 1/8 = 4/12', verdict: 'wrong' }, { latex: '\\frac{3}{4} + \\frac{1}{8} = \\frac{4}{12}', verdict: 'wrong' }] })
  assert.equal(new Set(r.map((x) => x.exercise)).size, r.length)
  assert.equal(reviewKey('6 x 7'), reviewKey('6 \\times 7'))
  assert.equal(reviewKey('3/4 + 1/8'), reviewKey('\\frac{3}{4} + \\frac{1}{8}'))
})

test('Practise again: a line kept as \\text{...} is its exercise, without the answer, and never a false equation', () => {
  const r = suggestReview({ seed: 'qa-ux-times-1795330083531', lines: [{ latex: '\\text{6 x 7 = 48}', verdict: 'unsure' }], ideas: [{ exercise: '6 x 7', why: 'a' }, { exercise: '5 x 8', why: 'b' }] })
  assert.equal(r[0].exercise, '6 \\times 7')
  assert.ok(r.every((x) => !/=/.test(x.exercise) && !/\\text/.test(x.exercise)), r.map((x) => x.exercise).join(' | '))
  assert.equal(new Set(r.map((x) => reviewKey(x.exercise))).size, r.length)
})

test('Practise again: "Last time:" for a note that is not something you did', () => {
  const r = suggestReview({ seed: 'qa-ux-w', lines: [{ latex: '7 + 5 = 13', verdict: 'wrong', note: 'the two sides are not equal' }] })
  assert.equal(r[0].why, 'Last time: the two sides are not equal. Try it again, one step at a time.')
})

test('new numbers for 1 + 2 + ... + n, logs and Pythagoras', () => {
  const seen = (q) => {
    const out = new Set()
    for (let i = 0; i < 60; i++) {
      const v = variantOf(q, { seed: `qa-ux-${i}` })
      if (v) out.add(`${v.exercise} = ${v.scene.resultTex}`)
    }
    return [...out]
  }
  assert.ok(seen('1 + 2 + ... + 10').some((x) => /^1 \+ 2 \+ \.\.\. \+ \d+ = \d+$/.test(x) && !x.includes('+ 10 =')))
  assert.ok(seen('log_2 32').some((x) => /^log_2 (16|64) = (4|6)$/.test(x)))
  const py = seen('3^2 + 4^2 = c^2')
  assert.ok(py.some((x) => !/^(3\^2 \+ 4\^2|4\^2 \+ 3\^2)/.test(x)), py.join(' | '))
  assert.ok(py.every((x) => /\^2 \+ \d+\^2 = c\^2 = \d+$/.test(x)), py.join(' | '))
})
