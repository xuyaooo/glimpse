// Hints help the child try it alone: none may give the answer away.
import test from 'node:test'
import assert from 'node:assert/strict'
import { safeHints } from '../server/engine/session.js'

test('a hint holding the answer is dropped, the others kept in order', () => {
  const out = safeHints(['Look at the denominators: what number do 3 and 4 both go into?', 'Turn both into twelfths.', 'So it is 17/12.'], '\\frac{17}{12}')
  assert.deepEqual(out, ['Look at the denominators: what number do 3 and 4 both go into?', 'Turn both into twelfths.'])
})

test('a short answer said outright is dropped ("is 4", "= 4"), but the same digit elsewhere is fine', () => {
  const out = safeHints(['Count the groups of 2 in 8.', 'The answer is 4.', 'So 8 ÷ 2 = 4', 'Share 8 sweets between 2 friends.'], '4')
  assert.deepEqual(out, ['Count the groups of 2 in 8.', 'Share 8 sweets between 2 friends.'])
})

test('an equation answer: its value is what may not be said', () => {
  const out = safeHints(['Take 3 away from both sides.', 'Then divide by 2.', 'You get x = 5.', 'x is 5'], 'x = 5')
  assert.deepEqual(out, ['Take 3 away from both sides.', 'Then divide by 2.'])
})

test('at most three, and nothing that is not text', () => {
  assert.deepEqual(safeHints(['a', 'b', 'c', 'd'], '42'), ['a', 'b', 'c'])
  assert.deepEqual(safeHints([null, 7, '', 'Think about place value.'], '42'), ['Think about place value.'])
  assert.deepEqual(safeHints(undefined, '42'), [])
})
