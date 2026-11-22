import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeOcrMath, isBareMathLine } from '../server/ocrText.js'

test('bare math lines get $...$ (GLM-OCR on newer Ollama)', () => {
  assert.equal(
    normalizeOcrMath('x^{2}+3x-4=0\nx=(-b \\pm \\sqrt{b^{2}-4ac})/2a'),
    '$x^{2}+3x-4=0$\n$x=(-b \\pm \\sqrt{b^{2}-4ac})/2a$',
  )
})

test('text and already-delimited math are left alone', () => {
  const t = 'Homework 3\nSolve: $ 2 x+5=1 1 $\nso $ x=3 $'
  assert.equal(normalizeOcrMath(t), t)
  assert.equal(normalizeOcrMath('$$\n\\begin{array}{l} x=1 \\end{array}\n$$'), '$$\n\\begin{array}{l} x=1 \\end{array}\n$$')
})

test('which lines count as bare math', () => {
  assert.equal(isBareMathLine('x = 5'), true)
  assert.equal(isBareMathLine('3x + 7 = 22'), true)
  assert.equal(isBareMathLine('\\frac{1}{3} + \\frac{1}{4}'), true)
  assert.equal(isBareMathLine('a_1 + a_2'), true)
  assert.equal(isBareMathLine('Homework 3'), false)
  assert.equal(isBareMathLine('Area = 50 cm'), false)
  assert.equal(isBareMathLine('1) Solve for x:'), false)
  assert.equal(isBareMathLine('Find the area.'), false)
  assert.equal(isBareMathLine(''), false)
})
