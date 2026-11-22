import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compile, toExpr, detectScene, buildScene, pickScene, skinFor, plainToTex, texToPlain } from '../server/engine/scenes.js'

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`)

test('expressions: LaTeX and plain text, implicit multiplication, functions', () => {
  close(compile('\\frac{1}{1+x}')(1), 0.5)
  close(compile('1/(1+x)')(3), 0.25)
  close(compile('3x^2 + 2x - 1')(2), 15)
  close(compile('x^{2}')(3), 9)
  close(compile('2(x+1)')(1), 4)
  close(compile('\\ln(1+x)')(Math.E - 1), 1)
  close(compile('sqrt(x)')(9), 3)
  close(compile('\\sqrt{x}')(16), 4)
  close(compile('sin(pi/2)')(0), 1)
  close(compile('e^x')(1), Math.E)
  close(compile('-x^2')(3), -9)
  assert.throws(() => compile('y + 1'))
  assert.throws(() => compile('alert(1)'))
  assert.equal(toExpr('3 × 4'), '3 * 4')
  assert.equal(plainToTex('ln(1+x)'), '\\ln(1+x)')
  assert.equal(plainToTex('x^3/3'), 'x^{3}/3')
  assert.equal(texToPlain('\\frac{1}{1+x}'), '1/(1+x)')
  assert.equal(texToPlain('x^{2} - 4'), 'x² - 4')
})

test('rules recognise each kind of exercise', () => {
  assert.deepEqual(detectScene('\\int_{0}^{1} \\frac{1}{1+x} dx'), { kind: 'area', expression: '\\frac{1}{1+x}', from: 0, to: 1, variable: 'x', tex: '\\int_{0}^{1} \\frac{1}{1+x} dx' })
  // OCR reads the integral sign as S
  assert.equal(detectScene('S_{0}^{1} \\frac{1}{1+x} dx =').kind, 'area')
  assert.equal(detectScene('S_0^+ \\frac{1}{1+x} dx'), null) // "+" is no bound: the tutor's clean copy is used instead
  assert.equal(detectScene('$\\int_0^4 x^2 dx =$').kind, 'area')
  assert.deepEqual(detectScene('1 + 2 + ... + 100 ='), { kind: 'pairs', expression: '100' })
  assert.equal(detectScene('1+2+\\ldots+100').kind, 'pairs')
  assert.equal(detectScene('3x + 5 = 20').kind, 'balance')
  assert.equal(detectScene('y = x^2 - 4').kind, 'graph')
  assert.equal(detectScene('\\frac{1}{2} + \\frac{1}{3} =').kind, 'fractions')
  assert.equal(detectScene('3 + 4 =').kind, 'count')
  assert.equal(detectScene('27 + 15 =').kind, 'number_line')
  assert.equal(detectScene('4 \\times 6 =').kind, 'groups')
  // a times sign read as the letter x is still "times" between numbers (seen live: 6x7 = 42 became x = 1)
  assert.equal(detectScene('6x7 = 42').kind, 'groups')
  assert.equal(detectScene('6 x 7 = 42').kind, 'groups')
  assert.equal(buildScene({ kind: 'groups', expression: '6x7' }, { age: 9 }).result, 42)
  assert.equal(detectScene('3x + 5 = 20').kind, 'balance')
  assert.equal(detectScene('2x = 8').kind, 'balance')
  assert.equal(detectScene('Solve the Riemann hypothesis'), null)
})

test('count: kid objects, results checked', () => {
  const s = buildScene({ kind: 'count', expression: '3 + 4' }, { age: 6 })
  assert.equal(s.result, 7)
  assert.equal(s.skin, 'kid')
  assert.equal(s.stages.length, 3)
  assert.ok(s.emoji)
  assert.equal(buildScene({ kind: 'count', expression: '3 - 5' }, { age: 6 }), null) // negative: not with objects
  assert.equal(buildScene({ kind: 'count', expression: '3 + 4' }, { age: 30 }).kind, 'number_line') // grown-ups get a line
})

test('number line: big jumps split into tens and ones', () => {
  const s = buildScene({ kind: 'number_line', expression: '27+15' }, { age: 10 })
  assert.equal(s.result, 42)
  assert.deepEqual(s.jumps, [
    { from: 27, to: 37 },
    { from: 37, to: 42 },
  ])
})

test('groups, fractions, pairs', () => {
  const g = buildScene({ kind: 'groups', expression: '4*6' }, { age: 8 })
  assert.equal(g.result, 24)
  assert.deepEqual(g.counts, [6, 12, 18, 24])
  const f = buildScene({ kind: 'fractions', expression: '1/2 + 1/3' }, { age: 9 })
  assert.equal(f.l, 6)
  assert.equal(f.top, 5)
  assert.equal(f.resultTex, '\\frac{5}{6}')
  assert.equal(f.skin, 'kid')
  const f2 = buildScene({ kind: 'fractions', expression: '\\frac{1}{4}+\\frac{1}{4}' }, { age: 11 })
  assert.equal(f2.resultTex, '\\frac{1}{2}')
  assert.ok(f2.stages.some((st) => /Simplify/.test(st.caption)))
  const p = buildScene({ kind: 'pairs', expression: '100' }, { age: 10 })
  assert.equal(p.total, 5050)
})

test('balance: solves linear equations, blocks only when countable', () => {
  const b = buildScene({ kind: 'balance', expression: '3x + 5 = 20' }, { age: 10 })
  assert.equal(b.solution, 5)
  assert.equal(b.skin, 'junior')
  assert.equal(b.resultTex, 'x = 5')
  const b2 = buildScene({ kind: 'balance', expression: '2x - 7 = 5x + 2' }, { age: 15 })
  assert.equal(b2.solution, -3)
  assert.equal(b2.skin, 'grown')
  assert.equal(buildScene({ kind: 'balance', expression: 'x^2 = 4' }, {}), null) // not linear
})

test('area: integral computed, antiderivative only shown when it is right', () => {
  const a = buildScene({ kind: 'area', expression: '1/(1+x)', from: 0, to: 1, antiderivative: 'ln(1+x)' }, { age: 9 })
  close(a.value, Math.LN2, 1e-5)
  assert.equal(a.skin, 'grown')
  assert.equal(a.antiderivative, '\\ln(1+x)')
  assert.equal(a.stages.length, 5)
  const wrong = buildScene({ kind: 'area', expression: 'x^2', from: 0, to: 4, antiderivative: 'x^3' }, {})
  close(wrong.value, 64 / 3, 1e-5)
  assert.equal(wrong.antiderivative, undefined) // x^3 is not an antiderivative of x^2
  assert.equal(buildScene({ kind: 'area', expression: '1/x', from: -1, to: 1 }, {}), null) // not finite on [-1, 1]
})

test('graph finds where the curve crosses', () => {
  const g = buildScene({ kind: 'graph', expression: 'x^2 - 4' }, {})
  assert.deepEqual(g.roots.map((r) => Math.round(r * 100) / 100), [-2, 2])
  assert.equal(g.y0, -4)
})

test('decision: the model first, then the rules, then nothing', () => {
  // the model's choice is checked by building it
  assert.equal(pickScene({ exercise: 'whatever', choice: { kind: 'groups', expression: '3*4' }, age: 8 }).decidedBy, 'model')
  // a choice that doesn't build falls back to the rules on what was written
  const s = pickScene({ exercise: '\\int_{0}^{4} x^{2} dx', choice: { kind: 'balance', expression: 'nonsense' } })
  assert.equal(s.kind, 'area')
  assert.equal(s.decidedBy, 'rules')
  assert.equal(pickScene({ exercise: 'Write a poem', choice: { kind: 'none' } }), null)
  assert.equal(skinFor('area', 7), 'grown')
  assert.equal(skinFor('count', 7), 'kid')
  assert.equal(skinFor('balance', 11), 'junior')
})

test('more animations: arithmetic (columns, area model, sharing, order of operations)', async () => {
  const { sceneFor } = await import('../server/engine/scenes.js')
  const k = (t, age = 9) => sceneFor({ exercise: t, age })
  assert.equal(k('68 \\times 74 =').result, 5032)
  assert.deepEqual(k('68 \\times 74 =').cells.map((c) => c.p), [4200, 240, 560, 32])
  assert.equal(k('345 + 278 =').result, 623)
  assert.equal(k('602 - 348 =').result, 254)
  assert.ok(k('602 - 348 =').stages.some((s) => /borrow/.test(s.caption)))
  assert.equal(k('24 \\div 6 =').resultTex, '4')
  assert.equal(k('25 : 4 =').r, 1)
  assert.equal(k('3 + 4 \\times 2 =').result, 11)
  assert.equal(k('(5 + 3) \\times 2 - 4 =').result, 12)
  assert.ok(/Brackets/.test(k('(5 + 3) \\times 2 - 4 =').stages[0].caption))
  assert.equal(k('2 + 2 + 2 =')?.kind ?? null, null) // same operation only: no order to explain
})

test('more animations: middle school (percent, powers, logs, Pythagoras, mean, inequalities)', async () => {
  const { sceneFor } = await import('../server/engine/scenes.js')
  const k = (t, age = 13) => sceneFor({ exercise: t, age })
  assert.equal(k('20\\% of 50').value, 10)
  assert.equal(k('2^5 =').value, 32)
  assert.equal(k('\\log_2 32').resultTex, '5')
  assert.equal(k('3^2 + 4^2 = c^2').resultTex, '5')
  assert.equal(k('5^2 + b^2 = 13^2').resultTex, '12')
  assert.equal(k('mean of 3, 5, 7, 9').mean, 6)
  assert.equal(k('2x + 3 > 7').resultTex, 'x > 2')
  assert.equal(k('-2x + 1 \\le 7').resultTex, 'x \\ge -3') // dividing by a negative flips the sign
})

test('more animations: high school (quadratics, systems, trig, limits, derivatives)', async () => {
  const { sceneFor } = await import('../server/engine/scenes.js')
  const k = (t) => sceneFor({ exercise: t, age: 16 })
  assert.deepEqual(k('x^2 - 5x + 6 = 0').roots, [2, 3])
  assert.equal(k('x^2 + 1 = 0').roots.length, 0)
  assert.deepEqual([k('2x + y = 5, x - y = 1').x, k('2x + y = 5, x - y = 1').y], [2, 1])
  assert.equal(k('\\sin 30^\\circ').resultTex, '\\frac{1}{2}')
  assert.equal(k('\\cos(120°)').resultTex, '-\\frac{1}{2}')
  assert.equal(k('\\tan 90°').resultTex, '\\text{undefined}')
  assert.equal(k('\\lim_{x \\to 0} \\frac{\\sin x}{x}').resultTex, '1')
  assert.equal(k('\\lim_{x \\to 1} \\frac{x^2 - 1}{x - 1}').resultTex, '2')
  assert.equal(k('\\lim_{x \\to 1} \\frac{x^2 - 1}{x - 1}').plot.markers.find((m) => m.kind === 'hole')?.x, 1) // a hole where it isn't defined
  assert.equal(k('\\lim_{x \\to \\infty} \\frac{1}{x}').resultTex, '0')
  assert.equal(k('\\frac{d}{dx} x^3').slope, 3)
  assert.equal(k("f(x) = x^2, f'(3) =").slope, 6)
  const { buildScene } = await import('../server/engine/scenes.js')
  const right = buildScene({ kind: 'derivative', expression: 'x^3', derivative: '3x^2' }, { age: 16 })
  const wrong = buildScene({ kind: 'derivative', expression: 'x^3', derivative: '3x' }, { age: 16 })
  assert.equal(right.formula, '3x^{2}')
  assert.equal(wrong.formula, null) // a wrong formula from the tutor is not shown
})

test('more animations: probability (dice, coins, bags, combinations, trees)', async () => {
  const { sceneFor } = await import('../server/engine/scenes.js')
  const k = (t) => sceneFor({ exercise: t, age: 14 })
  assert.equal(k('P(rolling a 6) with a die').resultTex, '\\frac{1}{6}')
  assert.equal(k('roll a die: P(even)').resultTex, '\\frac{1}{2}')
  assert.equal(k('sum of 7 with two dice').resultTex, '\\frac{1}{6}')
  assert.equal(k('two coins: P(two heads)').resultTex, '\\frac{1}{4}')
  assert.equal(k('bag with 3 red and 5 blue balls, P(red)').resultTex, '\\frac{3}{8}')
  assert.equal(k('\\binom{5}{2}').value, 10)
  assert.deepEqual(k('\\binom{4}{2}').groups, ['AB', 'AC', 'AD', 'BC', 'BD', 'CD'])
  assert.equal(k('5! =').value, 120)
  assert.equal(k('P(A) = 0.5, P(B) = 0.3, P(A and B) independent').both, 0.15)
})

test('each animation keeps to the numbers it explains well', async () => {
  const { sceneFor } = await import('../server/engine/scenes.js')
  // the classifier may say "number line" for 345 + 278: the columns are used instead
  assert.equal(sceneFor({ exercise: '345 + 278 =', kind: 'number_line', age: 9 }).kind, 'columns')
  assert.equal(sceneFor({ exercise: '27 + 15 =', kind: 'number_line', age: 9 }).kind, 'number_line')
  // and "groups" for 68 x 74: the area model
  assert.equal(sceneFor({ exercise: '68 \\times 74 =', kind: 'groups', age: 9 }).kind, 'area_model')
})
