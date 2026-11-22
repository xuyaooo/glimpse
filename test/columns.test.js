// A sheet can mix sums written in columns with sums on a line: each column sum, in any of the
// shapes GLM-OCR writes it, becomes one exercise (with its label) that can be checked.
import test from 'node:test'
import assert from 'node:assert/strict'
import { joinColumnSums, squashedColumn } from '../server/engine/reader.js'
import { sheetReport } from '../server/engine/sheet.js'

test('column sums on lines of their own, each with its label, then sums on a line', () => {
  const ocr = ['Column addition, then line sums', 'a) 34', '+ 25', '59', 'b) 47', '+ 38', '75', 'c) 126', '+ 53', '179', 'd) $7 \\times 6 = 42$']
  assert.deepEqual(joinColumnSums(ocr), ['Column addition, then line sums', 'a) $34 + 25 = 59$', 'b) $47 + 38 = 75$', 'c) $126 + 53 = 179$', 'd) $7 \\times 6 = 42$'])
})

test('the bar read as a fraction bar: "34" over "\\frac{+25}{59}"', () => {
  assert.deepEqual(joinColumnSums(['a) $34$', '$\\frac{+25}{59}$', 'b) $47$', '$\\frac{-38}{9}$']), ['a) $34 + 25 = 59$', 'b) $47 - 38 = 9$'])
})

test('a bar line, a label on its own line, and an array block', () => {
  assert.deepEqual(joinColumnSums(['a)', '34', '+ 25', '---', '59']), ['a) $34 + 25 = 59$'])
  assert.deepEqual(joinColumnSums(['$$\\begin{array}{r} 34 \\\\ +25 \\\\ \\hline 59 \\end{array}$$']), ['$34 + 25 = 59$'])
})

test('not answered yet, and the next sum straight after', () => {
  assert.deepEqual(joinColumnSums(['34', '+25', '47', '+38', '75']), ['$34 + 25 =$', '$47 + 38 = 75$'])
  assert.deepEqual(joinColumnSums(['12', '+ 34', '+ 56', '102']), ['$12 + 34 + 56 = 102$'])
})

test('long multiplication: the total is the last number', () => {
  assert.deepEqual(joinColumnSums(['23', '× 14', '92', '230', '322', '$5 + 5 = 10$']), ['$23 \\times 14 = 322$', '$5 + 5 = 10$'])
})

test('lines that are not column sums are left alone', () => {
  const lines = ['Page 4', '$\\frac{3}{4} + \\frac{1}{4} = 1$', '4', '$x + 3 = 7$', '$\\frac{1}{2}$', 'Which is bigger?']
  assert.deepEqual(joinColumnSums(lines), lines)
})

test('a column sum squashed into a division is spotted (a real division with "=" is not)', () => {
  assert.equal(squashedColumn('a) $34 \\div 59$'), true)
  assert.equal(squashedColumn('$\\frac{+38}{75}$'), true)
  assert.equal(squashedColumn('$45 \\div 5 = 9$'), false)
  assert.equal(squashedColumn('$\\frac{3}{4}$'), false)
})

test('the sheet report keeps each exercise\'s label from the sheet', () => {
  const parts = [
    { id: 1, raw: 'a) $34 + 25 = 59$', latex: '34+25=59', verdict: 'correct' },
    { id: 2, raw: 'b) $47 + 38 = 75$', latex: '47+38=75', verdict: 'wrong', note: 'forgot to carry the ten' },
    { id: 3, raw: '$7 \\times 6 = 42$', latex: '7\\times 6=42', verdict: 'correct' },
  ]
  const r = sheetReport(parts)
  assert.deepEqual(r.items.map((x) => x.label), ['a', 'b', null])
  assert.equal(r.message, '2 of 3 right, 1 to fix. Start with b.')
})

test('a wrong sum on whole numbers: the slip, or a way to check it backwards, never the answer', async () => {
  const { arithmeticNote } = await import('../server/engine/maths.js')
  const note = (t) => arithmeticNote(t)?.note
  assert.equal(note('47+38=75'), 'forgot to carry the ten')
  assert.equal(note('8+8=61'), 'swapped the two digits of the answer round')
  assert.equal(note('52-17=45'), 'took the smaller digit from the bigger one in the ones')
  assert.equal(note('40-3=43'), 'added instead of taking away')
  assert.equal(note('6*7=13'), 'added instead of multiplying')
  assert.equal(note('45:5=8'), "it doesn't check out: 8 × 5 should make 45")
  assert.equal(note('3+4=7'), undefined) // right
  assert.equal(note('x+3=7'), undefined) // not two whole numbers
  // the right answer (85, 9, 7, 72, 42) is never in the note
  for (const [t, right] of [['47+38=75', 85], ['45:5=8', 9], ['12-5=9', 7], ['9*8=63', 72], ['23+19=32', 42]]) {
    assert.ok(note(t), t)
    assert.ok(!new RegExp(`(?<!\\d)${right}(?!\\d)`).test(note(t)), `${t}: ${note(t)}`)
  }
})

test('a maths "$" left open by the OCR is closed (a price is not)', async () => {
  const { cleanOcrLines } = await import('../server/engine/reader.js')
  assert.deepEqual(cleanOcrLines('e) $45 : 5 = 8$\nf) $15 - 6 ='), ['e) $45 : 5 = 8$', 'f) $15 - 6 =$'])
  assert.deepEqual(cleanOcrLines('$\\frac{1}{2} + \\frac{1}{3} ='), ['$\\frac{1}{2} + \\frac{1}{3} =$'])
  assert.deepEqual(cleanOcrLines('A pen costs $3 each, how much are four pens'), ['A pen costs $3 each, how much are four pens'])
  assert.deepEqual(cleanOcrLines('$$x^2$$'), ['$$x^2$$'])
})
