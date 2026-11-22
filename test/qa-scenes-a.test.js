// Regression tests for the animation library's parser, calculus, algebra and primary scenes
// (QA group G1a). Each test names the bug it pins down.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compile, toExpr, texToPlain, plainToTex, detectScene, sceneFor } from '../server/engine/scenes.js'

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`)
const S = (exercise, age = 16, kind) => sceneFor({ exercise, age, kind })
const R = (exercise, age = 16, kind) => S(exercise, age, kind)?.resultTex ?? null
const words = (s) => (s?.stages || []).map((x) => `${x.caption} ${x.math ?? ''}`).join(' | ')

// ------------------------------------------------------------------ parser

test('\\frac and \\sqrt with nested braces keep their meaning (x^{2} inside a fraction)', () => {
  close(compile('\\frac{1}{x^{2}}')(2), 0.25)
  close(compile('\\frac{x^{2} - 1}{x - 1}')(3), 4)
  close(compile('\\sqrt{x^{2}+1}')(0), 1)
  close(compile('\\frac{\\frac{1}{x}}{\\sqrt{x^{2}}}')(2), 0.25)
  assert.equal(R('\\lim_{x \\to 1} \\frac{x^{2} - 1}{x - 1}'), '2')
  assert.equal(R('\\lim_{x\\to 0}\\frac{e^{x}-1}{x}'), '1')
  assert.equal(R('\\lim_{x\\to\\infty}\\frac{3x^{2}+1}{x^{2}}'), '3')
  close(S('\\int_{0}^{1} \\frac{1}{1+x^{2}} dx').value, Math.PI / 4, 1e-6)
  assert.equal(S('\\frac{d}{dx}\\frac{1}{x^{2}}').slope, -2)
  assert.equal(R('\\frac{x^{2}}{2} = 8'), 'x = -4,\\ x = 4')
  assert.equal(texToPlain('\\frac{1}{1+x^{2}}'), '1/(1+x²)')
})

test('brace-less \\frac12, \\sqrt x and \\sqrt[n]{x}', () => {
  assert.equal(toExpr('\\frac12'), '((1)/(2))')
  close(compile('\\sqrt x')(9), 3)
  close(compile('\\sqrt[3]{x}')(-8), -2)
  assert.equal(R('\\frac12 + \\frac13', 9), '\\frac{5}{6}')
})

test('unknown LaTeX commands are refused, not silently deleted', () => {
  for (const t of ['\\lfloor x \\rfloor', 'x + \\infty', '\\operatorname{sgn} x', '\\Gamma(x)']) assert.throws(() => compile(t), t)
  assert.equal(S('y = \\lfloor x \\rfloor'), null)
  assert.equal(S('\\sqrt 9 + 1 =')?.resultTex ?? null, null) // no longer "9 + 1 = 10"
  // the ones it knows give the right values
  close(compile('\\arctan x')(1), Math.PI / 4)
  close(compile('\\cot x')(1), 1 / Math.tan(1))
  close(compile('\\cosh x')(1), Math.cosh(1))
  close(S('\\int_{0}^{1} \\arctan x \\, dx').value, Math.PI / 4 - Math.log(2) / 2, 1e-6)
  close(S('\\frac{d}{dx} \\cot x').slope, -1 / Math.sin(1) ** 2, 1e-5)
})

test('a function without brackets takes the factors written after it: \\sin 2x = sin(2x)', () => {
  close(compile('\\sin 2x')(0.5), Math.sin(1))
  close(compile('sin 3x')(0.5), Math.sin(1.5))
  close(compile('\\ln 2x')(1), Math.log(2))
  close(compile('\\sin x \\cos x')(0.3), Math.sin(0.3) * Math.cos(0.3)) // stops at the next function
  close(compile('\\sin x + 1')(0.3), Math.sin(0.3) + 1)
  close(compile('\\sin x^2')(1.5), Math.sin(2.25))
  close(compile('\\sin x \\cdot 2')(0.3), 2 * Math.sin(0.3)) // an explicit times ends the argument
  assert.equal(R('\\lim_{x \\to 0} \\frac{\\sin 2x}{x}'), '2')
  assert.equal(R('\\lim_{x \\to 0} \\frac{\\sin 3x}{\\sin 2x}'), '\\frac{3}{2}')
  close(S('\\frac{d}{dx} \\sin 2x').slope, 2 * Math.cos(2), 1e-5)
})

test('\\sin^2 x and \\sin^{-1} x', () => {
  close(compile('\\sin^{2} x')(1), Math.sin(1) ** 2)
  close(compile('\\sin^2(x) + \\cos^2(x)')(0.7), 1)
  close(compile('\\sin^{-1} x')(0.5), Math.PI / 6)
  close(S('\\int_{0}^{\\pi} \\sin^{2} x \\, dx', 16, 'area').value, Math.PI / 2, 1e-6)
})

test('odd roots of negative numbers are real: (-8)^(1/3) = -2', () => {
  close(compile('x^{1/3}')(-8), -2)
  close(compile('x^{2/3}')(-8), 4)
  assert.ok(Number.isNaN(compile('x^{1/2}')(-4)))
  assert.equal(R('\\lim_{x \\to 0} x^{1/3}'), '0')
  assert.equal(S('y = x^{1/3}').points.filter((p) => p[1] === null).length, 0)
})

test('absolute value bars pair up properly, and |x| is never taken for a straight line', () => {
  assert.equal(toExpr('|3|x| - 6|'), 'abs(3abs(x) - 6)')
  assert.equal(toExpr('|x| + |y|'), 'abs(x) + abs(y)')
  assert.equal(toExpr('||x| - 1|'), 'abs(abs(x) - 1)')
  assert.equal(toExpr('|x|(x+1)'), 'abs(x)(x+1)')
  for (const t of ['|x| = 4', '|x| < 3', '|x + 2| = 3', '\\sqrt{x^2} = 5', '|x + 1| \\le 3', '|2x + 1| = 5', '|3|x| - 6| = 0']) assert.equal(S(t, 13), null, t)
})

test('display: superscripts read the way they are computed', () => {
  assert.equal(texToPlain('e^{2x}'), 'e^(2x)')
  assert.equal(texToPlain('x^{2x}'), 'x^(2x)')
  assert.equal(texToPlain('x^{2} - 4'), 'x² - 4')
  assert.equal(plainToTex('e^2x'), 'e^{2}x') // e²·x, as compile reads it
  assert.equal(plainToTex('e^(2x)'), 'e^{2x}')
  assert.equal(plainToTex('x^3/3'), 'x^{3}/3')
  const g = S('y = e^2x')
  assert.equal(g.fTex, 'e^{2}x')
  // a graph keeps the LaTeX it was written in
  assert.equal(S('y = \\frac{1}{x}').fTex, '\\frac{1}{x}')
  assert.ok(!/\(\(1\)\/\(x\)\)/.test(words(S('y = \\frac{1}{x}'))))
})

test('a long exercise cannot block the engine (the integral rule used to backtrack for minutes)', () => {
  const t0 = performance.now()
  detectScene('\\int_0^1 ' + ' '.repeat(16000) + 'x')
  detectScene('\\int_0^1 ' + ' '.repeat(900) + 'x dx')
  detectScene('\\binom{' + '1'.repeat(16000) + '}{2}')
  detectScene('9'.repeat(16000) + ' + 1')
  assert.ok(performance.now() - t0 < 500, `${Math.round(performance.now() - t0)} ms`)
  assert.equal(detectScene('\\int_0^1 ' + ' '.repeat(900) + 'x dx').kind, 'area') // spaces don't matter
})

// ------------------------------------------------------------------ calculus

test('trig of an angle only when the exercise is just that', () => {
  for (const t of ['\\int_{0}^{\\pi} \\sin 2x \\, dx', '\\int_{0}^{1} \\cos(2x) dx', 'y = \\sin(2x)', '\\cos 2x = 1', '\\arcsin(0.5)', '\\sin 30^{\\circ} + \\cos 60^{\\circ}', '2\\sin 30°', 'f(x) = 3\\sin(2x) + 1']) {
    assert.notEqual(S(t, 16, 'area')?.kind, 'trig', t)
  }
  assert.equal(S('y = \\sin(2x)').kind, 'graph')
  close(S('\\int_{0}^{1} \\cos(3x) dx', 16, 'area').value, Math.sin(3) / 3, 1e-6)
  close(S('\\int_{0}^{\\pi} \\sin(2x) \\, dx', 16, 'area').value, 0, 1e-6)
  assert.equal(R('\\sin 30^\\circ'), '\\frac{1}{2}')
  assert.equal(R('cos 60 degrees'), '\\frac{1}{2}')
  assert.equal(R('\\sin\\left(30^\\circ\\right) ='), '\\frac{1}{2}')
})

test('limits that cancel to second order or more (floating point used to break them)', () => {
  const want = [
    ['\\lim_{x \\to 0} \\frac{1 - \\cos x}{x^2}', '\\frac{1}{2}'],
    ['\\lim_{x \\to 0} \\frac{x - \\sin x}{x^3}', '\\frac{1}{6}'],
    ['\\lim_{x \\to 0} \\frac{e^x - 1 - x}{x^2}', '\\frac{1}{2}'],
    ['\\lim_{x \\to 0} \\frac{\\tan x - x}{x^3}', '\\frac{1}{3}'],
    ['\\lim_{x \\to 0} \\frac{x^2}{1-\\cos x}', '2'],
    ['\\lim_{x \\to 0} \\frac{\\ln(1+x)-x}{x^2}', '-\\frac{1}{2}'],
    ['\\lim_{x \\to 1} \\frac{x^2-2x+1}{(x-1)^2}', '1'],
    ['\\lim_{x \\to \\infty} x^2 (1 - \\cos(1/x))', '\\frac{1}{2}'],
    ['\\lim_{x \\to \\infty} x(\\sqrt{x^2+1} - x)', '\\frac{1}{2}'],
    ['\\lim_{x \\to 100} \\frac{x^2 - 10000}{x - 100}', '200'],
    ['\\lim_{x \\to 1000} \\frac{x^2 - 1000000}{x - 1000}', '2000'],
  ]
  for (const [t, w] of want) assert.equal(R(t), w, t)
})

test('limits that converge slowly, overflow, or do not exist', () => {
  for (const t of ['\\lim_{x \\to \\infty} \\frac{1}{\\ln x}', '\\lim_{x \\to \\infty} \\frac{\\ln x}{\\sqrt{x}}', '\\lim_{x \\to \\infty} x^{-1/3}', '\\lim_{x \\to 0} x \\sin(1/x)', '\\lim_{x \\to \\infty} \\frac{\\sin x}{x}']) assert.equal(R(t), '0', t)
  assert.equal(R('\\lim_{x \\to \\infty} e^x'), '\\infty')
  assert.equal(R('\\lim_{x \\to 0^+} e^{1/x}'), '\\infty')
  assert.equal(R('\\lim_{x \\to 0^-} e^{1/x}'), '0')
  assert.equal(R('\\lim_{x \\to 0} \\frac{1 - \\cos x}{x^4}'), '\\infty')
  for (const t of ['\\lim_{x \\to 0} \\sin(1/x)', '\\lim_{x \\to 0} \\frac{1}{x}', '\\lim_{x \\to 0} \\frac{|x|}{x}', '\\lim_{x \\to \\infty} \\sin x', '\\lim_{x \\to 0} e^{1/x}']) assert.equal(R(t), '\\text{does not exist}', t)
  // the ones that already worked
  assert.equal(R('\\lim_{x \\to 0} \\frac{\\sin x}{x}'), '1')
  assert.equal(R('\\lim_{x \\to 0} \\frac{1}{x^2}'), '\\infty')
  assert.ok(R('\\lim_{x \\to \\infty} (1 + 1/x)^x').startsWith('2.718'))
})

test('one-sided limits are written one-sided, with a dot where f is defined', () => {
  const a = S('\\lim_{x \\to 0^+} \\frac{1}{x}')
  assert.equal(a.resultTex, '\\infty')
  assert.equal(a.stages.at(-1).math, '\\lim_{x \\to 0^{+}} \\frac{1}{x} = \\infty')
  assert.match(a.stages[0].caption, /vertical asymptote/)
  assert.doesNotMatch(words(a), /hole/)
  const b = S('\\lim_{x \\to 0^+} \\frac{|x|}{x}')
  assert.equal(b.resultTex, '1')
  assert.doesNotMatch(b.stages.at(-1).caption, /Both sides/)
  const c = S('\\lim_{x \\to 2^+} x^2')
  assert.equal(c.plot.markers.find((m) => m.when === 'value').kind, 'dot')
  assert.equal(S('\\lim_{x \\to 1} \\frac{x^2 - 1}{x - 1}').plot.markers.find((m) => m.when === 'value').kind, 'hole')
  const d = S('\\lim_{x \\to 0^+} x^x', 17)
  assert.equal(d.resultTex, '1')
  assert.match(d.stages.at(-1).math, /\\to 0\^\{\+\}/)
})

test('one-sided notations: 0^{+}, x->0+, x->0^+, \\lim\\limits', () => {
  assert.equal(R('lim x->0+ 1/x'), '\\infty')
  assert.equal(R('lim x->0^+ 1/x'), '\\infty')
  assert.equal(R('lim x->0- 1/x'), '-\\infty')
  assert.equal(R('\\lim_{x \\to 0^{+}} \\frac{1}{x}'), '\\infty')
  assert.equal(R('\\lim_{x \\to 0^{+}} \\sqrt{x}'), '0')
  assert.equal(R('\\lim\\limits_{x \\to 0} \\frac{\\sin x}{x}'), '1')
  assert.equal(R('\\lim_{x \\to \\frac{\\pi}{2}^-} \\tan x'), '\\infty')
})

test('a limit target that is not a number is not turned into minus infinity', () => {
  assert.equal(S('\\lim_{x \\to c} (3x + 1)'), null)
  assert.equal(R('lim x->infinity e^x'), '\\infty')
  assert.equal(R('lim x->oo 1/x'), '0')
  assert.doesNotMatch(S('lim x->oo 1/x').stages.at(-1).math, /-\\infty/)
  assert.equal(R('\\lim_{x \\to 0,5} \\frac{1}{x}'), '2') // a decimal comma
  assert.equal(R('\\lim_{x \\to 2,5} (x+1)'), '\\frac{7}{2}')
})

test('limit captions never say NaN; a side where f is not defined is said so', () => {
  for (const t of ['\\lim_{x \\to 0} \\sqrt{x}', '\\lim_{x\\to 1} \\sqrt{x-1}', '\\lim_{x \\to 0} \\ln x', '\\lim_{x \\to 0} x \\ln x', '\\lim_{x \\to 0} x^x']) {
    const w = words(S(t))
    assert.doesNotMatch(w, /NaN|Infinity|undefined/, t)
    assert.doesNotMatch(w, /Left and right go to different places/, t)
    assert.match(w, /isn't defined left of/, t)
  }
  assert.equal(R('\\lim_{x \\to 0} \\sqrt{x}'), '0')
  assert.equal(S('\\lim_{x \\to 0} \\sqrt{x}').stages.at(-1).math, '\\lim_{x \\to 0^{+}} \\sqrt{x} = 0')
  assert.equal(R('\\lim_{x \\to 0} \\ln x'), '-\\infty')
  assert.equal(S('\\lim_{x \\to 0^-} \\sqrt{x}'), null) // nothing to come closer from
  assert.match(words(S('\\lim_{x \\to -\\infty} \\frac{x}{\\sqrt{x^2+1}}')), /more and more negative/)
})

test('definite integrals across a pole have no area', () => {
  for (const t of ['\\int_{0}^{2} \\tan x \\, dx', '\\int_{0}^{3} \\frac{1}{x^2 - 2} dx', '\\int_{0}^{4} \\frac{1}{(x-\\pi)^2} dx', '\\int_{-1}^{2} \\frac{1}{x^2} dx', '\\int_{-1}^{2} \\frac{1}{x} dx', '\\int_{-2}^{1} \\frac{1}{1+x} dx']) assert.equal(S(t), null, t)
  // integrable ones still work
  close(S('\\int_0^1 \\sqrt{x} dx').value, 2 / 3, 1e-4)
  close(S('\\int_{0}^{4} x^2 dx').value, 64 / 3, 1e-6)
})

test('integrals: \\pi and nested braces as bounds, long intervals, bounds in the picture', () => {
  assert.equal(R('\\int_0^\\pi \\sin x \\, dx'), '\\approx 2')
  assert.equal(R('\\int_{0}^{\\frac{\\pi}{2}} \\cos x \\, dx'), '\\approx 1')
  assert.equal(R('\\int_{0}^{\\sqrt{2}} x \\, dx'), '\\approx 1')
  assert.equal(R('\\int_{-\\frac{1}{2}}^{1} x^{2} dx'), '\\approx 0.375')
  close(S('\\int_{0}^{1000} \\sin x dx').value, 1 - Math.cos(1000), 1e-5)
  for (const t of ['\\int_0^{5} x^{10} dx', '\\int_0^{20} e^x dx']) {
    const s = S(t)
    assert.ok(s.plot.bounds.x0 <= Math.min(s.a, s.b) && s.plot.bounds.x1 >= Math.max(s.a, s.b), t)
  }
  // the old rules still hold
  assert.equal(detectScene('S_0^+ \\frac{1}{1+x} dx'), null)
  assert.equal(detectScene('\\int_{0}^{1} \\frac{1}{1+x} dx').expression, '\\frac{1}{1+x}')
})

test('graphs: no crossings at asymptotes or where the curve only gets near 0; the edge counts', () => {
  assert.deepEqual(S('y = \\frac{1}{x^2 - 2}').roots, [])
  assert.deepEqual(S('y = \\frac{1}{3x - 1}').roots, [])
  assert.deepEqual(S('y = \\frac{x}{x^2 - 3}').roots, [0])
  for (const t of ['y = e^{-x^2}', 'y = e^{3x}', 'y = 2^{-x^2}']) assert.deepEqual(S(t).roots, [], t)
  assert.deepEqual(S('y = x^2 - 36').roots, [-6, 6])
  assert.deepEqual(S('y = 6 - x').roots, [6])
  assert.deepEqual(S('y = x^2 - 4').roots, [-2, 2])
  close(S('y = 1000x - 1').roots[0], 0.001, 1e-6) // a steep crossing is still one
})

test('no derivative at a corner', () => {
  for (const t of ["f(x) = |x|, f'(0)", "f(x) = |x - 2|, f'(2)", "f(x) = \\sqrt{x^2}, f'(0)", "f(x) = x^{2/3}, f'(0)"]) assert.equal(S(t), null, t)
  assert.equal(R("f(x) = |x|, f'(1)"), "f'(1) = 1")
  assert.equal(R("f(x) = x^2, f'(0) ="), "f'(0) = 0")
})

// ------------------------------------------------------------------ algebra

test('quadratics: a double root with decimals or fractions is one root', () => {
  for (const [t, r] of [['x^2 + 0.2x + 0.01 = 0', -0.1], ['(x - 0.3)^2 = 0', 0.3], ['(x - 1/3)^2 = 0', 1 / 3], ['(x + 2.8)^2 = 0', -2.8], ['0.01x^2 - 0.2x + 1 = 0', 10]]) {
    const s = S(t, 13)
    assert.equal(s.roots.length, 1, t)
    close(s.roots[0], r, 1e-6)
    assert.doesNotMatch(s.resultTex, /no real solution/)
  }
  assert.equal(R('(x - 1/3)^2 = 0', 13), 'x = \\frac{1}{3}')
})

test('quadratics: the discriminant brackets negative numbers; roots are exact', () => {
  assert.match(words(S('x^2 - 5x + 6 = 0', 13)), /b² − 4ac = \(-5\)² − 4 × 1 × 6 = 1/)
  assert.match(words(S('x^2 + x - 4 = 0', 13)), /4 × 1 × \(-4\)/)
  assert.equal(R('6x^2 - 5x + 1 = 0', 13), 'x = \\frac{1}{3},\\ x = \\frac{1}{2}')
  assert.equal(R('x^2 = 2', 13), 'x = -\\sqrt{2},\\ x = \\sqrt{2}')
  assert.equal(R('2x^2 + 4x - 7 = 0', 13), 'x = \\frac{-2 - 3\\sqrt{2}}{2},\\ x = \\frac{-2 + 3\\sqrt{2}}{2}')
  assert.equal(R('x^2 = 8', 13), 'x = -2\\sqrt{2},\\ x = 2\\sqrt{2}')
  assert.equal(R('1.3x^2 - 2.1x - 0.7 = 0', 13), 'x \\approx -0.284,\\ x \\approx 1.899')
  assert.deepEqual(S('x^2 - 5x + 6 = 0').roots, [2, 3])
})

test('a linear equation with big decimal coefficients is not a parabola', () => {
  const s = S('8915.2x + 981.2 = 9276.7x - 8191.6', 13)
  assert.equal(s.kind, 'balance')
  close(s.solution, 9172.8 / 361.5, 1e-9)
  assert.match(s.resultTex, /^x \\approx 25\.374$/)
})

test('balance and inequality captions add when the x term is negative', () => {
  const b = words(S('2x = 9 - x', 13))
  assert.match(b, /Add x to both sides/)
  assert.doesNotMatch(b, /Take 1x|Take x off/)
  assert.match(words(S('-x + 4 = 10', 13)), /Add x to both sides/)
  assert.equal(R('-x + 4 = 10', 13), 'x = -6')
  assert.match(words(S('3x + 1 = x + 5', 13)), /Take x off both sides/)
  const i = words(S('x > 5 - 2x', 13))
  assert.match(i, /Add 2x to both sides/)
  assert.doesNotMatch(i, /Take 2x/)
  assert.match(words(S('7x + 3 \\ge -6x + 8', 13)), /Add 6x to both sides/)
  assert.match(words(S('5x + 1 > 2x + 7', 13)), /Take 2x from both sides/)
})

test('inequalities read ≤ and ≥ aloud, and \\left( is not \\le', () => {
  assert.match(words(S('2x + 1 \\leq 4', 13)), /keep the ≤ sign/)
  assert.match(words(S('5x - 4 \\ge 11', 13)), /keep the ≥ sign/)
  assert.equal(R('\\left(x+1\\right) > 3', 13), 'x > 2')
  assert.equal(R('2\\left(x+1\\right) \\geq 6', 13), 'x \\ge 2')
  assert.equal(R('2x + 1 > 6', 13), 'x > 2.5')
  assert.equal(R('-2x + 1 \\le 7', 13), 'x \\ge -3')
})

test('fractions stay exact in balances, inequalities and their captions', () => {
  const a = S('\\frac{x}{3} = 2', 13)
  assert.equal(a.resultTex, 'x = 6')
  assert.doesNotMatch(words(a), /0\.333/)
  assert.equal(R('x/7 = 1/3', 13), 'x = \\frac{7}{3}')
  assert.equal(R('2x = 5', 13), 'x = \\frac{5}{2}')
  assert.equal(R('3x < 1', 13), 'x < \\frac{1}{3}')
  assert.equal(R('3x < 2', 13), 'x < \\frac{2}{3}')
  assert.equal(R('0.5x + 1 = 3', 13), 'x = 4')
  assert.match(R('3x < 1.1111', 13), /\\approx/)
})

test('systems written in array, aligned or \\left\\{ cases', () => {
  for (const t of ['\\left\\{\\begin{array}{l} x + y = 5 \\\\ x - y = 1 \\end{array}\\right.', '\\begin{aligned} x + y &= 5 \\\\ x - y &= 1 \\end{aligned}', '\\left\\{ \\begin{cases} x + y = 5 \\\\ x - y = 1 \\end{cases} \\right.', 'x + y = 5\nx - y = 1']) {
    const s = S(t)
    assert.equal(s?.kind, 'system', t)
    assert.deepEqual([s.x, s.y], [3, 2])
  }
})

test('Pythagoras: the unknown is squared, any order, any case; exact decimals', () => {
  assert.notEqual(S('3^2 + 4^2 = x', 13)?.kind, 'pythagoras')
  assert.equal(R('3^2 + 4^2 = x', 13), 'x = 25')
  assert.equal(R('2^2 + 3^2 = ?', 13), '13')
  for (const [t, r] of [['5^2 = 3^2 + b^2', '4'], ['3^2 + 4^2 = C^2', '5'], ['a^2 + 4^2 = 5^2', '3'], ['b^2 + 3^2 = 5^2', '4'], ['c^2 = 3^2 + 4^2', '5'], ['3^2 + 4^2 = c^2', '5'], ['5^2 + b^2 = 13^2', '12']]) {
    assert.equal(S(t, 13).kind, 'pythagoras', t)
    assert.equal(R(t, 13), r, t)
  }
  assert.equal(R('x^2 + 4^2 = 5^2', 13), 'x = -3,\\ x = 3') // an equation in x: both roots
  for (const [t, r] of [['2.5^2 + 6^2 = c^2', '6.5'], ['0.6^2 + b^2 = 1^2', '0.8'], ['1.5^2 + 2^2 = x^2', '2.5'], ['1^2 + 1^2 = c^2', '\\approx 1.414']]) assert.equal(R(t, 13), r, t)
})

// ------------------------------------------------------------------ primary

test('1 + 2 + ... + n takes the last term', () => {
  assert.equal(S('1 + 2 + 3 + ... + 99 + 100 =', 10).total, 5050)
  assert.equal(S('1 + 2 + 3 + \\ldots + 98 + 99 + 100 = ', 8).total, 5050)
  assert.equal(S('1 + 2 + ... + 9 + 10 =', 10).total, 55)
  assert.equal(S('1 + 2 + ... + 100 =', 10).total, 5050)
  assert.deepEqual(detectScene('1 + 2 + ... + 100 ='), { kind: 'pairs', expression: '100' })
  assert.notEqual(S('1 + 2 + ... + 10n', 8)?.kind, 'pairs')
  assert.equal(S('1 + 2 + ... + 98 + 100', 8), null) // the terms written out don't go up by one
})

test('column addition up to the millions', () => {
  assert.equal(S('654321 + 456789 =', 10).result, 1111110)
  assert.equal(S('999999 + 1 =', 10).result, 1000000)
  assert.match(words(S('999999 + 1 =', 10)), /Millions/)
})

test('captions say 1 apple, 1 plate, 1 friend (singular)', () => {
  const t = [S('1 + 1 =', 6), S('5 - 1 =', 6), S('1 \\times 5 =', 7), S('5 \\times 1 =', 7), S('1 \\times 5 =', 14), S('7 \\div 1 =', 8), S('12 \\div 12 =', 14)].map(words).join(' || ')
  assert.doesNotMatch(t, /Here are 1 |\b1 more come along|\b1 go away|\b1 plates|Put 1 cookies|\b1 rows|between 1 friends|\b1 groups/)
  assert.match(words(S('1 + 1 =', 6)), /Here is 1 \S+\.\s+\|\s+1 more comes along/)
  assert.match(words(S('5 - 1 =', 6)), /1 goes away/)
  assert.match(words(S('3 + 4 =', 6)), /Here are 3 \S+\.\s+\|\s+4 more come along/)
})
