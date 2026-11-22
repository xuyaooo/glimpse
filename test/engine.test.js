import { test } from 'node:test'
import assert from 'node:assert/strict'
import { F, toPlain, parseSum, evaluate, checkSum, checkEquation, diagnose, plainToLatex } from '../server/engine/maths.js'
import { explainWrongSum, chooseStyle, similarExercises, hint } from '../server/engine/teach.js'

test('OCR text -> plain arithmetic', () => {
  assert.equal(toPlain('$ \\frac{3}{4}+\\frac{1}{2}=\\frac{4}{6} $'), '3/4+1/2=4/6')
  assert.equal(toPlain('3/4 + 1/2 = 4/6'), '3/4+1/2=4/6')
  assert.equal(toPlain('¾ + ½ = 4/6'), '3/4+1/2=4/6')
  assert.equal(toPlain('2) \\dfrac{1}{5} + \\dfrac{2}{5} = \\dfrac{3}{5}'), '1/5+2/5=3/5')
  assert.equal(toPlain('3 × 4 = 12'), '3*4=12')
  assert.equal(toPlain('Homework 3'), '')
  assert.equal(toPlain('Solve 2x + 5 = 11'), '')
})

test('exact checking keeps the written form', () => {
  const s = parseSum('3/4+1/2=4/6')
  assert.deepEqual(s, { a: F(3, 4), b: F(1, 2), ans: F(4, 6) })
  assert.equal(checkSum(s.a, s.b, s.ans), 'wrong')
  assert.equal(checkSum(F(1, 5), F(2, 5), F(3, 5)), 'correct')
  assert.equal(checkSum(F(1, 4), F(1, 4), F(2, 4)), 'unsimplified')
  assert.equal(checkEquation('3*4=12'), true)
  assert.equal(checkEquation('7-2=4'), false)
  assert.equal(checkEquation('(1+2)/3=1'), true)
  assert.deepEqual(evaluate('1/2+1/3'), { n: 5, d: 6 })
  assert.equal(plainToLatex('3/4+1/2=4/6'), '\\frac{3}{4}+\\frac{1}{2}=\\frac{4}{6}')
})

test('misconceptions only when they reproduce the exact answer', () => {
  assert.deepEqual(diagnose(F(3, 4), F(1, 2), F(4, 6)).map((b) => b.id), ['adds_across'])
  assert.deepEqual(diagnose(F(1, 2), F(1, 3), F(2, 6)).map((b) => b.id), ['no_scaling', 'lcd_no_scaling'])
  assert.deepEqual(diagnose(F(1, 2), F(1, 3), F(1, 6)).map((b) => b.id), ['multiplies'])
  assert.deepEqual(diagnose(F(1, 2), F(1, 3), F(7, 9)), []) // no known bug
})

test('teaching scenes have correct numbers', () => {
  const bug = diagnose(F(3, 4), F(1, 2), F(4, 6))[0]
  const pics = explainWrongSum({ partId: 2, a: F(3, 4), b: F(1, 2), ans: F(4, 6), bug, style: 'pictures', why: 'x', iteration: 1, lang: 'fr' })
  assert.equal(pics.teaching.visual.kind, 'compare_pies')
  assert.deepEqual([pics.teaching.visual.left.n, pics.teaching.visual.left.d], [4, 6])
  assert.deepEqual([pics.teaching.visual.right.n, pics.teaching.visual.right.d], [3, 4])
  assert.equal(pics.teaching.misconception.name, 'added the tops and the bottoms')
  assert.equal(pics.hint.lang, 'fr')
  assert.ok(pics.hint.translation.startsWith('Look: 4/6 is smaller than 3/4'))

  const bars = explainWrongSum({ partId: 3, a: F(2, 5), b: F(1, 3), ans: F(3, 8), bug, style: 'bars', why: 'x', iteration: 2, lang: 'en' })
  assert.deepEqual(bars.teaching.visual.rows.map((r) => `${r.n}/${r.d}`), ['2/5', '1/3', '6/15', '5/15'])

  const worked = explainWrongSum({ partId: 4, a: F(2, 5), b: F(1, 3), ans: F(3, 8), bug, style: 'steps', why: 'x', iteration: 3, lang: 'en' })
  assert.equal(worked.teaching.visual.kind, 'worked')
  assert.deepEqual(worked.teaching.visual.lines, ['\\frac{1}{3}+\\frac{1}{6}', '=\\frac{2}{6}+\\frac{1}{6}', '=\\frac{3}{6}', '=\\frac{1}{2}'])
})

test('teaching style follows what works for this child', () => {
  assert.equal(chooseStyle({}, 1).style, 'pictures')
  assert.equal(chooseStyle({ pictures: { tries: 1, wins: 0 } }, 2, ['pictures']).style, 'bars')
  assert.equal(chooseStyle({ pictures: { tries: 1, wins: 0 }, bars: { tries: 1, wins: 0 } }, 3, ['pictures', 'bars']).style, 'steps')
  assert.equal(chooseStyle({ bars: { tries: 1, wins: 1 } }, 1).style, 'bars') // worked before
})

test('similar exercises reveal the mistake and are not repeats', () => {
  const bug = diagnose(F(3, 4), F(1, 2), F(4, 6))[0]
  const ex = similarExercises({ bug, seen: new Set(['2/5+1/3']) })
  assert.equal(ex.length, 3)
  assert.ok(!ex.some((e) => e.id === '2/5+1/3'))
  assert.ok(ex.every((e) => e.target === 'adds_across' && e.latex.includes('\\frac')))
})

test('hints fall back to English with no translation', () => {
  assert.deepEqual(hint('right', 'tr'), { text: 'Right!', lang: 'en' })
  assert.equal(hint('right', 'it').text, 'Giusto!')
})
