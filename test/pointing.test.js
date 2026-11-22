// What the student points at is taken from the OCR transcription (the model's copy can drop a
// "..." or add a number), and the rules behind the dice question and evenly spaced sums.
import test from 'node:test'
import assert from 'node:assert/strict'
import { closestLine } from '../server/engine/session.js'
import { sceneFor } from '../server/engine/scenes.js'

const lines = ['$1+2+3+4+...+100 =$', '$2+4+6+...+2x50 =$', 'Which is the probability of getting', '7 when 2 dice are launched']

test('the pointed line is the transcription, not the model\'s copy', () => {
  assert.equal(closestLine('9. $$2 + 4 + 6 + 2 \\times 50 =', lines), '2+4+6+...+2x50 =')
  assert.equal(closestLine('Which is the probability of getting 7 when 2 dice are launched', lines), 'Which is the probability of getting 7 when 2 dice are launched')
  assert.equal(closestLine('1 + 2 + 3 + 4 + \\cdots + 100 =', lines), '1+2+3+4+...+100 =')
  assert.equal(closestLine('\\int_0^1 \\sin x dx', lines), null)
})

test('the dice question in words, and evenly spaced sums', () => {
  const ans = (t) => sceneFor({ exercise: t, age: 12 })?.resultTex ?? null
  assert.equal(ans('Which is the probability of getting 7 when 2 dice are launched'), '\\frac{1}{6}')
  assert.equal(ans('probability of getting 7 when 2 dice are rolled'), '\\frac{1}{6}')
  assert.equal(ans('2+4+6+...+2x50 ='), '2550')
  assert.equal(ans('5 + 10 + 15 + ... + 100'), '1050')
  assert.equal(ans('1 + 2 + ... + 100 ='), '5050')
  assert.equal(ans('3 + 5 + 9 + ... + 20'), null)
})
