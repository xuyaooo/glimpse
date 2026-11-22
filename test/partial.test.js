// The hints, then each step, are shown while the tutor is still writing its answer.
import test from 'node:test'
import assert from 'node:assert/strict'
import { partialArray } from '../server/engine/partial.js'
import { safeHints } from '../server/engine/session.js'

test('the complete items of an array still being written', () => {
  const full = '{"hints": ["Look at the ones: 7 + 8.", "Carry the \\"ten\\" over."], "steps": [{"say": "Add the ones", "math": "7+8=15"}, {"say": "Add the tens", "math": "4+3+1=8"}], "result": "85"}'
  assert.deepEqual(partialArray('{"hints": ["Look at', 'hints'), { items: [], closed: false })
  assert.deepEqual(partialArray('{"hints": ["Look at the ones: 7 + 8.", "Car', 'hints'), { items: ['Look at the ones: 7 + 8.'], closed: false })
  assert.deepEqual(partialArray(full, 'hints'), { items: ['Look at the ones: 7 + 8.', 'Carry the "ten" over.'], closed: true })
  const cut = full.slice(0, full.indexOf('{"say": "Add the tens"') + 12)
  assert.deepEqual(partialArray(cut, 'steps').items, [{ say: 'Add the ones', math: '7+8=15' }])
  assert.equal(partialArray(full, 'steps').items.length, 2)
  assert.deepEqual(partialArray('{"result": "85"', 'steps'), { items: [], closed: false })
  // braces inside strings don't end a step early
  assert.deepEqual(partialArray('{"steps": [{"say": "a } b", "math": "\\\\frac{1}{2}"}', 'steps').items, [{ say: 'a } b', math: '\\frac{1}{2}' }])
})

test('a hint that says what the answer is goes, even before the answer is known', () => {
  assert.deepEqual(safeHints(['Start with the ones.', 'The answer is a bit more than 80.', 'Check that 2x + 5 = 17 still holds.'], ''), ['Start with the ones.', 'Check that 2x + 5 = 17 still holds.'])
})
