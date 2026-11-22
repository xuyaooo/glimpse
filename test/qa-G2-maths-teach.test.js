// QA regressions for exact maths (server/engine/maths.js) and teaching (server/engine/teach.js).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { F, BUGS, toPlain, parseSum, evaluate, checkSum, checkEquation, diagnose, plainToLatex, addExact, sumLatex, flatex, reduce } from '../server/engine/maths.js'
import { explainWrongSum, chooseStyle, similarExercises, hint, styleName, styleNames } from '../server/engine/teach.js'

// What the engine says about a typed or read line: the same path as session.js judge().
function verdict(text) {
  const plain = toPlain(text)
  const sum = parseSum(plain)
  if (sum) return checkSum(sum.a, sum.b, sum.ans) === 'wrong' ? 'wrong' : 'correct'
  const eq = plain ? checkEquation(plain) : null
  return eq === null ? 'unsure' : eq ? 'correct' : 'wrong'
}
const latexOf = (text) => plainToLatex(toPlain(text))

test('toPlain runs in linear time on a \\frac with no closing brace', () => {
  for (const text of ['\\frac{' + ' '.repeat(4000) + 'x', '\\frac{1}{' + ' '.repeat(4000) + 'x', '\\frac{' + ' '.repeat(200000) + '}' + ' '.repeat(200000)]) {
    const t0 = performance.now()
    toPlain(text)
    assert.ok(performance.now() - t0 < 200, `took ${performance.now() - t0} ms`)
  }
  assert.equal(toPlain('$\\frac{ 3 }{ 4 }+\\frac{1}{2}=\\frac{4}{6}$'), '3/4+1/2=4/6')
})

test('mixed numbers are a whole plus a fraction, never glued into one number', () => {
  for (const t of ['3/4 + 1/2 = 1 1/4', '1½ + ½ = 2', '1 1/2 + 1/2 = 2', '1\\frac{1}{2}+\\frac{1}{2}=2', '1½ + ¼ = 1¾', '$\\frac{3}{4}+\\frac{1}{2}=1\\frac{1}{4}$', '2 3/4 - 1 1/4 = 1 1/2'])
    assert.equal(verdict(t), 'correct', t)
  assert.equal(verdict('1 1/2 + 1/4 = 1 2/4'), 'wrong')
  assert.equal(toPlain('1 1/2 + 1/4 = 1 3/4'), '(1+1/2)+1/4=(1+3/4)')
  assert.equal(parseSum(toPlain('1 1/2 + 1/2 = 1 2/2')), null) // not "Right! 12/2 is 6/1"
  assert.equal(latexOf('1 1/2 + 1/4 = 1 3/4'), '1\\frac{1}{2}+\\frac{1}{4}=1\\frac{3}{4}')
  assert.equal(latexOf('3 - 1 1/2 = 1 1/2'), '3-1\\frac{1}{2}=1\\frac{1}{2}')
  assert.equal(verdict('3 - 1 1/2 = 1 1/2'), 'correct')
})

test('dividing by a fraction keeps the fraction whole (÷, \\div, :)', () => {
  for (const t of ['1/2 ÷ 1/4 = 2', '\\frac{1}{2} \\div \\frac{1}{4} = 2', '½ ÷ ¼ = 2', '6 ÷ 2/3 = 9', '2 ÷ 1/2 = 4', '$6 \\div \\frac{2}{3} = 9$', '6 ÷ 3 = 2', '12 ÷ 3 ÷ 2 = 2', '12\\div 3+1=5'])
    assert.equal(verdict(t), 'correct', t)
  assert.equal(verdict('1/2 ÷ 1/4 = 1/8'), 'wrong')
  assert.equal(latexOf('6 ÷ 2/3 = 9'), '6\\div \\frac{2}{3}=9')
  assert.equal(latexOf('6 ÷ 3 = 2'), '6\\div 3=2') // a division, not redrawn as a fraction
  assert.equal(latexOf('½ ÷ ¼ = 2'), '\\frac{1}{2}\\div \\frac{1}{4}=2')
})

test('\\frac with an expression on top or bottom keeps its grouping', () => {
  for (const t of ['\\frac{3+5}{2} = 4', '\\frac{6}{2+1} = 2', '\\frac{10-4}{3}=2', '$\\frac{1}{2}+\\frac{1}{3}=\\frac{3+2}{6}$', '$\\frac{3\\times2}{4\\times2}=\\frac{6}{8}$', '6 \\div \\frac{3+1}{2} = 3'])
    assert.equal(verdict(t), 'correct', t)
  assert.equal(verdict('\\frac{3+5}{2} = 5'), 'wrong')
  assert.equal(latexOf('\\frac{3+5}{2} = 4'), '\\frac{3+5}{2}=4')
  assert.equal(latexOf('$\\frac{3\\times2}{4\\times2}=\\frac{6}{8}$'), '\\frac{3\\times 2}{4\\times 2}=\\frac{6}{8}')
})

test('colon division is checked, and exercise labels are still stripped', () => {
  for (const t of ['8: 2 = 4', '8: 4 = 2', '12: 4 = 3', '8 : 4 = 2', '8:4=2', '$ 8: 4 = 2 $', '6: 1/2 = 12']) assert.equal(verdict(t), 'correct', t)
  assert.equal(verdict('8: 4 = 3'), 'wrong')
  assert.equal(latexOf('8 : 4 = 2'), '8\\div 4=2')
  // labels
  assert.equal(toPlain('1) 3+4=7'), '3+4=7')
  assert.equal(toPlain('2. 3+4=7'), '3+4=7')
  assert.equal(toPlain('3: 2+2=4'), '2+2=4')
  assert.equal(toPlain('3: 2+2=5'), '2+2=5')
  assert.equal(toPlain('1: 1/2 + 1/4 = 3/4'), '1/2+1/4=3/4')
})

test('letter labels are stripped like number labels', () => {
  for (const t of ['a) 1/2 + 1/4 = 3/4', 'b. 1/2 + 1/4 = 3/4', '(c) 1/2 + 1/4 = 3/4', 'a) $\\frac{1}{2}+\\frac{1}{4}=\\frac{3}{4}$', 'd: 1/2 + 1/4 = 3/4'])
    assert.equal(toPlain(t), '1/2+1/4=3/4', t)
  assert.equal(toPlain('a) 2x + 5 = 11'), '')
  assert.equal(toPlain('Solve 2x + 5 = 11'), '')
})

test('decimals are checked exactly and drawn as written', () => {
  const cases = [['2.5 + 1.5 = 4', 'correct'], ['2.5 + 1.5 = 5', 'wrong'], ['0.5 + 0.25 = 0.75', 'correct'], ['0.5 + 0.25 = 0.7', 'wrong'], ['0.1 + 0.2 = 0.3', 'correct'], ['1/2 = 0.5', 'correct'], ['2 + 2 = 4.', 'correct'], ['1.5 ÷ 0.5 = 3', 'correct'], ['.5 + .5 = 1', 'correct']]
  for (const [t, v] of cases) assert.equal(verdict(t), v, t)
  assert.equal(latexOf('1.5 ÷ 0.5 = 3'), '1.5\\div 0.5=3')
  assert.ok(!plainToLatex('0.5/2=0.25').includes('\\frac{5}'))
  assert.deepEqual(evaluate('0.25'), { n: 1, d: 4 })
})

test('numbers too big to be exact are not judged', () => {
  assert.notEqual(checkEquation('99999999*99999999=9999999800000000'), true)
  assert.notEqual(checkEquation('123456789*987654321=121932631112635270'), true)
  assert.equal(parseSum('1/99999999+1/99999999=2/99999999'), null)
  assert.equal(checkEquation('3*4=12'), true) // small numbers still fine
})

test('the LaTeX shown always means the same as the line that was checked', () => {
  const atoms = ['1', '2', '12', '0.5', '-1', '1/2', '3/4', '(1+1/2)', '(2+3)', '(1+2)/3', '6/(2+1)']
  const ops = ['+', '-', '*', ':', '/']
  for (const a of atoms)
    for (const op of ops)
      for (const b of atoms)
        for (const op2 of ops) {
          const p = `${a}${op}${b}${op2}${atoms[(a.length + b.length) % atoms.length]}`
          const v = evaluate(p)
          if (!v) continue
          const back = evaluate(toPlain(`$${plainToLatex(p)}$`))
          assert.deepEqual(back, v, `${p} -> ${plainToLatex(p)}`)
        }
})

const teach = (a, b, ans, style, lang = 'en') => explainWrongSum({ partId: 1, a, b, ans, bug: diagnose(a, b, ans)[0] || null, style, why: 'x', iteration: 1, lang })
const all = (r) => [r.teaching.title, ...r.teaching.steps, r.hint.text, ...(r.teaching.visual.rows || []).map((x) => x.note || '')].join(' | ')

test('same-bottom sums get "add the tops, keep the bottom", not "turn 2/5 into 2/5"', () => {
  for (const [a, b, ans] of [[F(1, 5), F(2, 5), F(3, 10)], [F(1, 4), F(2, 4), F(3, 8)], [F(1, 2), F(1, 2), F(2, 4)], [F(1, 3), F(1, 3), F(2, 6)]]) {
    for (const style of ['pictures', 'bars', 'steps']) {
      const text = all(teach(a, b, ans, style))
      assert.ok(!/Turn (\d+\/\d+) into \1\b|(\d+\/\d+) is the same as \2\b|(\d+\/\d+) is \3\b|same size first/.test(text), text)
    }
  }
  const bars = teach(F(1, 5), F(2, 5), F(3, 10), 'bars')
  assert.deepEqual(bars.teaching.visual.rows.map((r) => `${r.n}/${r.d}`), ['1/5', '2/5', '3/5'])
  assert.equal(bars.hint.text, 'The pieces are already the same size: add the tops and keep the bottom, 5.')
  assert.ok(teach(F(1, 5), F(2, 5), F(3, 10), 'pictures').teaching.steps.some((s) => s.includes('1/5 + 2/5 = 3/5')))
  const fr = teach(F(1, 5), F(2, 5), F(3, 10), 'bars', 'fr')
  assert.equal(fr.hint.lang, 'fr')
  assert.ok(fr.hint.text.includes('5'))
  // the worked example is a same-bottom one too, and not the child's sum
  const worked = teach(F(1, 5), F(2, 5), F(3, 10), 'steps').teaching.visual.lines
  assert.deepEqual(worked, ['\\frac{2}{7}+\\frac{3}{7}', '=\\frac{5}{7}'])
})

test('the pictures title matches the comparison', () => {
  for (const [a, b, ans] of [[F(1, 2), F(1, 4), F(2, 4)], [F(1, 3), F(1, 6), F(2, 6)], [F(1, 2), F(1, 3), F(2, 3)], [F(3, 4), F(1, 2), F(4, 4)]]) {
    const t = teach(a, b, ans, 'pictures').teaching
    assert.equal(t.visual.relation, '<')
    assert.equal(t.title, 'Is that enough?')
  }
  const big = teach(F(1, 2), F(1, 3), F(6, 6), 'pictures').teaching
  assert.equal(big.visual.relation, '>')
  assert.equal(big.title, 'Is it really that much?')
})

test('bars say halves, thirds, 21sts, 22nds', () => {
  const steps = (a, b, ans) => all(teach(a, b, ans, 'bars'))
  assert.match(steps(F(1, 3), F(1, 7), F(2, 10)), /into 21sts/)
  assert.match(steps(F(1, 2), F(1, 11), F(2, 13)), /into 22nds/)
  assert.match(steps(F(1, 2), F(1, 3), F(2, 5)), /into sixths/)
  assert.match(steps(F(1, 3), F(1, 4), F(2, 7)), /into twelfths/)
  assert.ok(!/\d(1|2|3)ths\b|\b(1|2|3)ths\b/.test(steps(F(1, 3), F(1, 7), F(2, 10))))
  assert.match(steps(F(3, 4), F(1, 2), F(4, 6)), /3\/4 stays 3\/4, and 1\/2 is 2\/4/)
})

test('chooseStyle never repeats the style that just failed', () => {
  const allFailed = { pictures: { tries: 1, wins: 0 }, bars: { tries: 1, wins: 0 }, steps: { tries: 1, wins: 0 } }
  const c = chooseStyle(allFailed, 3, ['bars', 'steps'])
  assert.equal(c.style, 'pictures')
  assert.equal(c.why, "The worked example didn't click yet, so this time: pictures.")
  assert.notEqual(chooseStyle(allFailed, 4, ['pictures', 'bars', 'steps']).style, 'steps')
  assert.notEqual(chooseStyle(allFailed, 5, ['pictures', 'bars', 'steps', 'pictures']).style, 'pictures')
  // unchanged behaviour
  assert.equal(chooseStyle({}, 1).style, 'pictures')
  assert.equal(chooseStyle({ pictures: { tries: 1, wins: 0 } }, 2, ['pictures']).style, 'bars')
  assert.equal(chooseStyle({ bars: { tries: 1, wins: 1 } }, 1).style, 'bars')
})

test('targeted exercises are diagnosed as the targeted mistake', () => {
  for (const bug of BUGS) {
    const ex = similarExercises({ bug, count: 20 })
    assert.ok(ex.length >= 3, bug.id)
    for (const e of ex) assert.equal(diagnose(e.a, e.b, bug.fn(e.a, e.b))[0]?.id, bug.id, `${bug.id}: ${e.id}`)
  }
})

test('no exercise is the same sum in swapped order', () => {
  const ex = similarExercises({ count: 50 })
  const keys = ex.map((e) => [e.a, e.b].map((f) => `${f.n}/${f.d}`).sort().join('+'))
  assert.equal(new Set(keys).size, keys.length)
  assert.ok(!similarExercises({ seen: new Set(['1/6+2/3']), count: 50 }).some((e) => e.id === '2/3+1/6'))
})

test('the worked example is never the child’s own sum or answer', () => {
  for (const [a, b] of [[F(1, 6), F(1, 3)], [F(1, 3), F(2, 12)], [F(2, 6), F(1, 6)], [F(1, 3), F(1, 6)], [F(1, 5), F(3, 10)], [F(2, 5), F(1, 5)]]) {
    const lines = teach(a, b, F(a.n + b.n, a.d + b.d), 'steps').teaching.visual.lines
    const total = reduce(addExact(a, b))
    assert.notEqual(lines[0], sumLatex(a, b))
    assert.notEqual(lines[0], sumLatex(b, a))
    assert.notEqual(lines[lines.length - 1], `=${flatex(total)}`, lines.join(' ')) // the last line is the reduced total
  }
})

test('an unknown language like "constructor" falls back to English', () => {
  for (const lang of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
    assert.deepEqual(hint('right', lang), { text: 'Right!', lang: 'en' })
    assert.equal(hint('clicked', lang, { style: styleNames('bars') }).text, 'Well done! The fraction bars did it.')
    assert.equal(styleName('pictures', lang), 'The pictures')
  }
  assert.equal(hint('clicked', 'de', { style: styleNames('bars') }).text, 'Super! Mit den Bruchstreifen hat es geklappt.')
})
