import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseArithmetic, planFromArithmetic, checkPlan } from '../server/animate.js'

test('reads exercises in many forms', () => {
  assert.deepEqual(parseArithmetic('1/2 + 1/4'), [
    { sign: 1, n: 1, d: 2 },
    { sign: 1, n: 1, d: 4 },
  ])
  assert.deepEqual(parseArithmetic('Add: $\\frac{2}{3} - \\frac{1}{3}$'), [
    { sign: 1, n: 2, d: 3 },
    { sign: -1, n: 1, d: 3 },
  ])
  assert.deepEqual(parseArithmetic('3 + 4 = ?'), [
    { sign: 1, n: 3, d: 1 },
    { sign: 1, n: 4, d: 1 },
  ])
  assert.deepEqual(parseArithmetic('12 − 5 + 2'), [
    { sign: 1, n: 12, d: 1 },
    { sign: -1, n: 5, d: 1 },
    { sign: 1, n: 2, d: 1 },
  ])
  assert.equal(parseArithmetic('Solve 3x + 7 = 22'), null) // equation, not plain arithmetic
  assert.equal(parseArithmetic('Tom has some apples'), null)
})

test('fractions become chocolate pieces with the right total', () => {
  const p = planFromArithmetic(parseArithmetic('1/2 + 1/4'))
  assert.equal(p.scene, 'chocolate')
  assert.equal(p.whole, 4)
  assert.equal(p.start, 2)
  assert.deepEqual(p.steps.map((s) => [s.op, s.amount]), [['add', 1]])
  assert.equal(p.result.label, '3/4')
  assert.equal(p.bars, 1)
})

test('taking away and going over one whole', () => {
  const take = planFromArithmetic(parseArithmetic('2/3 - 1/3'))
  assert.deepEqual(take.steps.map((s) => [s.op, s.amount]), [['take', 1]])
  assert.equal(take.result.label, '1/3')
  const over = planFromArithmetic(parseArithmetic('3/4 + 1/2'))
  assert.equal(over.whole, 4)
  assert.equal(over.bars, 2) // 5 pieces of 4 -> two bars
  assert.equal(over.result.label, '5/4')
  assert.equal(planFromArithmetic(parseArithmetic('1/2 + 1/2')).result.label, '1')
})

test('small numbers become objects, bigger ones a number line', () => {
  const obj = planFromArithmetic(parseArithmetic('3 + 4'))
  assert.equal(obj.scene, 'objects')
  assert.equal(obj.result.value, 7)
  const line = planFromArithmetic(parseArithmetic('18 + 7'))
  assert.equal(line.scene, 'number_line')
  assert.equal(line.result.value, 25)
  assert.equal(planFromArithmetic(parseArithmetic('2 - 5')).scene, 'number_line') // goes below zero
})

test('cases that cannot be shown nicely are refused', () => {
  assert.equal(planFromArithmetic(parseArithmetic('1/7 + 1/9')), null) // 63 pieces
  assert.equal(planFromArithmetic(parseArithmetic('500 + 300')), null)
})

test('model-proposed plans must add up', () => {
  const ok = checkPlan({ scene: 'objects', start: 5, steps: [{ op: 'take', amount: 2, label: '− 2' }], result: {} })
  assert.equal(ok.result.value, 3)
  assert.equal(checkPlan({ scene: 'objects', start: 2, steps: [{ op: 'take', amount: 5, label: '' }], result: {} }), null)
  assert.equal(checkPlan({ scene: 'chocolate', whole: 4, start: 1, steps: [{ op: 'add', amount: 2, label: '' }], result: {} }).result.label, '3/4')
  assert.equal(checkPlan({ scene: 'dragons', start: 1, steps: [] }), null)
})
