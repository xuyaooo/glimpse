// Three answers that used to be wrong: "not picking" a colour, a limit that swings (sampled only
// where the wave is 0), and an integral that is only part of the exercise.
import test from 'node:test'
import assert from 'node:assert/strict'
import { sceneFor } from '../server/engine/scenes.js'

const answer = (exercise) => sceneFor({ exercise, age: 15 })?.resultTex ?? null

test('"not picking red", "isn\'t blue", "not a blue" are the other colour', () => {
  assert.equal(answer('bag with 3 red and 5 blue balls, probability of not picking red'), '\\frac{5}{8}')
  assert.equal(answer("bag with 3 red and 5 blue balls, P(the ball isn't blue)"), '\\frac{3}{8}')
  assert.equal(answer('bag with 3 red and 5 blue balls, P(not a blue)'), '\\frac{3}{8}')
  assert.equal(answer('bag with 3 red and 5 blue balls, P(red)'), '\\frac{3}{8}')
})

test('a limit that keeps swinging has no limit; real limits are kept', () => {
  assert.equal(answer('\\lim_{x \\to 0} \\sin(\\pi/x)'), '\\text{does not exist}')
  assert.equal(answer('\\lim_{x \\to \\infty} \\sin(\\pi x)'), '\\text{does not exist}')
  assert.equal(answer('\\lim_{x \\to 0} \\frac{\\sin x}{x}'), '1')
  assert.equal(answer('\\lim_{x \\to 0} x \\sin(1/x)'), '0')
  assert.equal(answer('\\lim_{x \\to 0^+} \\frac{1}{\\ln x}'), '0')
  assert.equal(answer('\\lim_{x \\to \\infty} \\frac{3x}{x+1}'), '3')
  assert.match(sceneFor({ exercise: '\\lim_{x \\to 0} \\sin(\\pi/x)', age: 15 }).stages.at(-1).caption, /swinging/)
})

test('an integral is the whole exercise, or no animation (never half of it)', () => {
  assert.equal(answer('\\int_0^1 x dx + \\int_1^2 x dx'), null)
  assert.equal(answer('2\\int_0^1 x dx'), null)
  assert.equal(answer('\\int_0^1 x dx = 0.5'), '\\approx 0.5')
  assert.equal(answer('Compute \\int_0^2 x^2 dx'), '\\approx 2.667')
})
