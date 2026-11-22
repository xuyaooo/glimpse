// Every animation on tricky inputs (values over 1, zero, negatives, decimals, infinity...):
// is it built, is the result right, and does nothing read "NaN" or "undefined"?   npm run sweep
// Every animation on tricky inputs: is it built, is the result right, does any text say NaN/undefined?
import { sceneFor } from '../server/engine/scenes.js'
const cases = [
  // [exercise, age, expected kind, expected resultTex or null (just must build)]
  ['0 + 5 =', 6, 'count', '5'], ['5 - 5 =', 6, 'count', '0'], ['3 - 8 =', 9, 'number_line', '-5'],
  ['999 + 1 =', 9, 'columns', '1000'], ['1000 - 1 =', 9, 'columns', '999'], ['100 - 100 =', 9, 'columns', '0'],
  ['1 \\times 1 =', 7, 'groups', '1'], ['12 \\times 12 =', 9, 'groups', '144'], ['100 \\times 25 =', 10, 'area_model', '2500'], ['10 \\times 10 =', 10, 'groups', '100'],
  ['7 \\div 7 =', 7, 'sharing', '1'], ['13 \\div 4 =', 8, 'sharing', '3\\text{ r }1'], ['144 \\div 12 =', 10, 'sharing', '12'],
  ['\\frac{5}{4} + \\frac{1}{2} =', 9, 'fractions', '\\frac{7}{4}'], ['\\frac{3}{2} + \\frac{3}{2} =', 9, 'fractions', '3'], ['\\frac{1}{2} - \\frac{1}{2} =', 9, 'fractions', '0'],
  ['\\frac{7}{3} - \\frac{1}{3} =', 11, 'fractions', '2'], ['\\frac{3}{4} + \\frac{1}{2} =', 9, 'fractions', '\\frac{5}{4}'],
  ['150\\% of 40', 12, 'percent', '60'], ['0\\% of 40', 12, 'percent', '0'],
  ['7 / 2 + 1 \\times 2 =', 12, 'order_ops', '5.5'], ['2^3 + 1 =', 13, 'order_ops', '9'],
  ['5^0 =', 13, 'powers', '1'], ['10^3 =', 13, 'powers', '1000'], ['\\log_10 1000', 15, 'powers', '3'],
  ['mean of -2, 4, 7', 13, 'mean', '3'], ['mean of 2.5, 3.5', 12, 'mean', '3'],
  ['3x + 1 = 8', 14, 'balance', null], ['-x + 4 = 10', 14, 'balance', 'x = -6'],
  ['2x + 1 > 6', 14, 'inequality', 'x > 2.5'], ['-3x \\ge 9', 14, 'inequality', 'x \\le -3'],
  ['1^2 + 1^2 = c^2', 14, 'pythagoras', '\\approx 1.414'],
  ['x^2 - 4x + 4 = 0', 16, 'quadratic', 'x = 2'], ['-x^2 + 9 = 0', 16, 'quadratic', 'x = -3,\\ x = 3'],
  ['x + y = 2, 2x + 2y = 4', 16, null, null],
  ['\\sin 0°', 16, 'trig', '0'], ['\\cos 225°', 16, 'trig', '-\\frac{\\sqrt{2}}{2}'], ['\\sin(-30°)', 16, 'trig', '-\\frac{1}{2}'], ['\\tan 90°', 16, 'trig', '\\text{undefined}'],
  ['\\lim_{x \\to 0} \\frac{1}{x^2}', 17, 'limit', '\\infty'], ['\\lim_{x \\to 0} \\frac{|x|}{x}', 17, null, null], ['\\lim_{x \\to 2} x^2', 17, 'limit', '4'],
  ['\\frac{d}{dx} x^2', 17, 'derivative', "f'(1) = 2"], ["f(x) = x^2, f'(0) =", 17, 'derivative', "f'(0) = 0"],
  ['\\int_{\\pi}^{2\\pi} \\sin x dx', 17, 'area', '\\approx -2'], ['\\int_1^0 x dx', 17, 'area', '\\approx -0.5'],
  ['roll a die: P(more than 4)', 13, 'chance', '\\frac{1}{3}'], ['\\binom{10}{3}', 15, 'combinations', '120'], ['\\binom{5}{0}', 15, 'combinations', '1'],
  ['P(A) = 1/4, P(B) = 2/5, P(A and B) independent', 15, 'tree', '0.1'], ['1 + 2 + ... + 10 =', 10, 'pairs', '55'], ['y = 1/x', 16, 'graph', null],
]
let bad = 0
for (const [t, age, kind, want] of cases) {
  let s
  try { s = sceneFor({ exercise: t, age }) } catch (e) { s = { error: e.message } }
  // only what is read and spoken: the captions and the maths
  const text = s?.stages ? s.stages.map((x) => `${x.caption} ${x.math ?? ''}`).join(' ').replace(/\\text\{undefined\}|is undefined/g, '') : ''
  const nonsense = /NaN|undefined|Infinity|null/.test(text)
  const ok = s?.error ? false : kind === null ? !s || want === null : s && s.kind === kind && (want === null || s.resultTex === want) && !nonsense
  if (!ok) bad++
  console.log(`${ok ? ' ok ' : 'FAIL'} ${t.padEnd(46)} -> ${s?.error ? 'ERROR ' + s.error : s ? `${s.kind}/${s.skin} = ${s.resultTex}${nonsense ? '  [NaN/undefined in the text]' : ''}` : 'no animation'}${ok ? '' : `   (want ${kind} = ${want})`}`)
}
console.log(`\n${cases.length - bad}/${cases.length} make sense`)
