// Suggested review after a session (server/engine/review.js): the student's exercises again, or
// with new numbers, every answer worked out by code.
import test from 'node:test'
import assert from 'node:assert/strict'
import { questionOf, reviewKey, suggestReview, variantOf } from '../server/engine/review.js'
import { sceneFor } from '../server/engine/scenes.js'

const answerOf = (tex) => sceneFor({ exercise: tex })?.resultTex ?? null

test('the exercise without the student answer; an equation keeps its "="', () => {
  assert.equal(questionOf('6 \\times 7 = 48'), '6 \\times 7')
  assert.equal(questionOf('\\frac{3}{4} + \\frac{1}{8} = \\frac{4}{12}'), '\\frac{3}{4} + \\frac{1}{8}')
  assert.equal(questionOf('\\int_0^2 x^2 dx = 3'), '\\int_0^2 x^2 dx')
  assert.equal(questionOf('3x + 5 = 20'), '3x + 5 = 20')
  assert.equal(questionOf('x^2 - 5x + 6 = 0'), 'x^2 - 5x + 6 = 0')
  assert.equal(questionOf('345 + 278 ='), '345 + 278')
})

test('a wrong line comes back first, to try again, with the right answer (not the student\'s)', () => {
  const r = suggestReview({ seed: 't1', lines: [{ latex: '6 \\times 7 = 42', verdict: 'correct' }, { latex: '\\frac{3}{4} + \\frac{1}{8} = \\frac{4}{12}', verdict: 'wrong', note: 'added the tops and the bottoms' }] })
  assert.ok(r.length >= 3 && r.length <= 5, `3 to 5 exercises, got ${r.length}`)
  assert.equal(r[0].level, 'again')
  assert.equal(r[0].exercise, '\\frac{3}{4} + \\frac{1}{8}')
  assert.equal(r[0].answer, '\\frac{7}{8}')
  assert.match(r[0].why, /added the tops and the bottoms/)
  assert.ok(!/you you/i.test(r[0].why))
})

test('every answer is the one the code works out, and each exercise is new', () => {
  const lines = [
    { latex: '345 + 278 = 623', verdict: 'correct' },
    { latex: '84 \\div 7 = 12', verdict: 'correct' },
    { latex: '3x + 5 = 20', verdict: 'wrong' },
    { latex: '\\lim_{x \\to 0} \\frac{\\sin 3x}{x} = 3', verdict: 'correct' },
    { latex: '\\sin 30^\\circ = \\frac{1}{2}', verdict: 'unsure' },
  ]
  const r = suggestReview({ seed: 't2', lines, age: 12 })
  assert.ok(r.length >= 3 && r.length <= 5)
  const keys = r.map((x) => reviewKey(x.exercise))
  assert.equal(new Set(keys).size, keys.length, 'no exercise twice')
  for (const x of r) {
    assert.ok(x.id && x.why && x.level, JSON.stringify(x))
    if (x.answer !== null) assert.equal(x.answer, answerOf(x.exercise), x.exercise)
  }
})

test('new numbers keep the kind of maths and a whole-number answer stays whole', () => {
  for (const q of ['3x + 5 = 20', '6 \\times 7', '84 \\div 7', '\\frac{3}{4} + \\frac{1}{8}', '20\\% \\text{ of } 150', '2^5', 'x^2 - 5x + 6 = 0']) {
    const v = variantOf(q, { seed: 'k' })
    assert.ok(v, `a variant of ${q}`)
    assert.notEqual(reviewKey(v.exercise), reviewKey(q))
    const orig = sceneFor({ exercise: q })
    assert.ok(!/\\frac|\\approx|\./.test(v.scene.resultTex) || /\\frac/.test(orig.resultTex), `${v.exercise} -> ${v.scene.resultTex}`)
  }
})

test('the same session always gets the same suggestions', () => {
  const lines = [{ latex: '7 + 5 = 12', verdict: 'correct' }, { latex: '\\frac{2}{3} + \\frac{1}{6}', verdict: 'unsure' }]
  assert.deepEqual(suggestReview({ seed: 's', lines }), suggestReview({ seed: 's', lines }))
})

test("the tutor's ideas: kept with a checked answer; without one only if there is nothing else", () => {
  const r = suggestReview({ seed: 'i', lines: [{ latex: '2^5 = 32', verdict: 'correct' }], ideas: [{ exercise: '5/6 - 1/3', why: 'Different bottoms.' }, { exercise: 'Explain why 0.999... = 1', why: 'Think.' }] })
  const idea = r.find((x) => x.level === 'idea' && x.answer)
  assert.ok(idea, 'the checked idea is kept')
  assert.equal(idea.answer, '\\frac{1}{2}')
  assert.ok(r.length >= 3)
})

test('words only, or nothing written: nothing made up', () => {
  assert.deepEqual(suggestReview({ seed: 'w', lines: [{ latex: 'hello world', verdict: 'unsure' }] }), [])
  assert.deepEqual(suggestReview({ seed: 'n' }), [])
})
