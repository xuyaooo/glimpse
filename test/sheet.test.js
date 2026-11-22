// "Check my whole sheet": every exercise on the page, counted and worded (server/engine/sheet.js).
import test from 'node:test'
import assert from 'node:assert/strict'
import { sheetReport, sheetVerdict } from '../server/engine/sheet.js'

const parts = [
  { id: 1, latex: '\\frac{3}{4}+\\frac{1}{2}=\\frac{4}{6}', verdict: 'wrong', note: 'added the tops and the bottoms' },
  { id: 2, latex: '2/3+1/6=5/6', verdict: 'correct' },
  { id: 3, latex: '3x+5=', verdict: 'unsure', note: 'not finished yet' },
  { id: 4, latex: '6 \\times 7 = 42', verdict: 'correct' },
  { id: 5, latex: '', verdict: 'reading' },
]

test('every exercise is counted: right, to fix, not finished', () => {
  const r = sheetReport(parts, { name: 'Luca' })
  assert.deepEqual([r.total, r.right, r.wrong, r.unfinished, r.unsure], [4, 2, 1, 1, 0])
  assert.deepEqual(r.items.map((x) => x.verdict), ['wrong', 'right', 'unfinished', 'right'])
  assert.equal(r.items[0].note, 'added the tops and the bottoms')
  assert.equal(r.items[2].note, null) // "not finished yet" is the verdict, not a note
  assert.equal(r.firstToFix, 1)
  assert.equal(r.message, '2 of 4 right, 1 to fix, 1 exercise not finished. Start with number 1.')
})

test('all right, and an empty sheet', () => {
  assert.equal(sheetReport([parts[1], parts[3]], { name: 'Luca' }).message, 'All 2 exercises are right. Brilliant, Luca!')
  assert.equal(sheetReport([]).total, 0)
  assert.match(sheetReport([]).message, /couldn't find any exercise/)
})

test('a wrong one comes before an unfinished one as the first to fix', () => {
  assert.equal(sheetReport([parts[2], parts[0]]).firstToFix, 1)
  assert.equal(sheetVerdict({ verdict: 'unsure' }), 'unsure')
})
