// Reading and Science animations (server/engine/domains.js): read by code, every answer computed.
import test from 'node:test'
import assert from 'node:assert/strict'
import { alignLetters, buildDomain, detectDomain, fixSentence, pluralOf, practiceWord, sounds, syllabify, wordRule } from '../server/engine/domains.js'

const scene = (text, skin = 'kid') => {
  const r = detectDomain(text)
  return r && buildDomain(r, skin)
}
const clean = (s) => !/undefined|NaN|Infinity|\[object/.test(JSON.stringify(s))

test('syllables: the rules, the suffixes and the exceptions', () => {
  const want = {
    tiger: 'ti·ger', rabbit: 'rab·bit', basket: 'bas·ket', hamster: 'ham·ster', children: 'chil·dren', pocket: 'pock·et', table: 'ta·ble',
    happy: 'hap·py', crying: 'cry·ing', playing: 'play·ing', wanted: 'want·ed', jumped: 'jumped', running: 'run·ning', cake: 'cake',
    elephant: 'el·e·phant', butterfly: 'but·ter·fly', yesterday: 'yes·ter·day', bicycle: 'bi·cy·cle', boxes: 'box·es', makes: 'makes',
  }
  for (const [w, parts] of Object.entries(want)) assert.equal(syllabify(w).join('·'), parts, w)
  assert.equal(syllabify('h3llo'), null)
})

test('phonics: digraphs, trigraphs and the split digraph (magic e)', () => {
  const g = (w) => sounds(w).map((s) => s.g).join('·')
  assert.equal(g('ship'), 'sh·i·p')
  assert.equal(g('night'), 'n·igh·t')
  assert.equal(g('cake'), 'c·a_e·k')
  assert.equal(g('chair'), 'ch·air')
  assert.equal(g('queen'), 'qu·ee·n')
  assert.equal(scene('How many sounds in thumb?').count, 3)
})

test('spelling: compared letter by letter, never shown with the wrong spelling as the answer', () => {
  const s = scene('becaus -> because')
  assert.equal(s.kind, 'spelling')
  assert.equal(s.word, 'because')
  assert.deepEqual(s.ops.filter((o) => o.op !== 'same'), [{ op: 'add', b: 'e' }])
  assert.match(s.stages.map((x) => x.caption).join(' '), /add e/)
  assert.equal(alignLetters('freind', 'friend').distance, 2)
  // a bare word: the right spelling isn't known yet (the tutor gives it), so no scene
  assert.equal(buildDomain(wordRule('becaus', 'spelling'), 'kid'), null)
  assert.equal(buildDomain({ ...wordRule('becaus', 'spelling'), word: 'because' }, 'kid').ops.at(-1).op, 'add')
  // a different word altogether is not a misspelling
  assert.equal(scene('cat -> elephant'), null)
})

test('plurals: the rule and the irregular words', () => {
  const p = (w) => pluralOf(w).plural
  assert.deepEqual(['fox', 'baby', 'day', 'knife', 'wolf', 'roof', 'potato', 'piano', 'child', 'mouse', 'sheep', 'tooth'].map(p), ['foxes', 'babies', 'days', 'knives', 'wolves', 'roofs', 'potatoes', 'pianos', 'children', 'mice', 'sheep', 'teeth'])
  assert.equal(scene('one mouse, two ...').plural, 'mice')
  assert.equal(scene('make box plural').rule, 'es')
})

test('sentences: capital letter, I, a/an, repeated word, the end mark', () => {
  const c = (t) => fixSentence(t).corrected
  assert.equal(c('i like apples'), 'I like apples.')
  assert.equal(c('what is your name'), 'What is your name?')
  assert.equal(c('she has an dog'), 'She has a dog.')
  assert.equal(c('he ate a apple'), 'He ate an apple.')
  assert.equal(c('the the cat is big'), 'The cat is big.')
  assert.equal(c('Is it raining.'), 'Is it raining?')
  assert.equal(c('we went to a university'), 'We went to a university.')
  assert.equal(fixSentence('The dog barked.').fixes.length, 0)
})

test('units: conversions in every quantity', () => {
  const r = (t) => scene(t).result
  assert.equal(r('Convert 3.5 km to m'), 3500)
  assert.equal(r('2500 g in kg'), 2.5)
  assert.equal(r('45 min = ? h'), 0.75)
  assert.equal(r('how many cm in 2 m'), 200)
  assert.equal(r('3 L to mL'), 3000)
  assert.equal(r('90 s to min'), 1.5)
  assert.equal(scene('3 kg to m'), null) // not the same quantity
})

test('speed, density, circuits: the unknown is worked out', () => {
  assert.equal(scene('A car drives 120 km in 2 hours. What is its speed?').resultTex, '60\\text{ km/h}')
  assert.equal(scene('How long does it take to drive 150 km at 60 km/h?').result, 2.5)
  assert.equal(scene('How far do you go in 3 h at 80 km/h?').result, 240)
  assert.equal(scene('A runner covers 400 m in 50 s. What is the speed?').resultTex, '8\\text{ m/s}')
  const d = scene('A block has a mass of 200 g and a volume of 250 cm3. Does it float?')
  assert.equal(d.rho, 0.8)
  assert.equal(d.verdict, 'floats')
  assert.equal(scene('Density of 500 g in 400 mL, float or sink?').verdict, 'sinks')
  assert.equal(scene('A 9 V battery and a 3 ohm resistor: what is the current?').I, 3)
  assert.equal(scene('Resistors of 2 ohms and 4 ohms in series with 12 V. Current?').I, 2)
  assert.equal(scene('6 V across two 6 ohm resistors in parallel, current?').I, 2)
  assert.equal(scene('A current of 2 A through 5 ohms. Voltage?').V, 10)
})

test('states of matter and food chains', () => {
  assert.equal(scene('Water at 120 °C: solid, liquid or gas?').state, 'gas')
  assert.equal(scene('ice at -5 °C').state, 'solid')
  assert.equal(scene('Water at 100 °C').state, 'boiling')
  assert.equal(scene('What state is iron at 1600°C?').state, 'liquid')
  const f = (t) => scene(t).items.map((x) => x.name).join(' > ')
  assert.equal(f('grass -> rabbit -> fox'), 'grass > rabbit > fox')
  assert.equal(f('The fox eats the rabbit and the rabbit eats grass.'), 'grass > rabbit > fox')
  assert.equal(f('Owls eat mice, mice eat seeds'), 'seeds > mice > owls')
  assert.equal(f('Which is the producer: hawk, bird, caterpillar, leaves?'), 'leaves > caterpillar > bird > hawk')
  assert.equal(scene('grass -> rabbit -> fox').items[0].role, 'producer')
})

test('maths, dates and words are left alone', () => {
  for (const t of ['3x + 5 = 20', '\\frac{1}{2} + \\frac{1}{3}', 'What time is it?', 'Exercise 2', '21/11/2026', 'A → B', 'Name: Noor', '6 x 7 = 42']) assert.equal(detectDomain(t), null, t)
})

test('every scene is complete at every skin', () => {
  const texts = ['How many syllables in elephant?', 'sound out ship', 'becaus -> because', 'plural of baby', 'Punctuate: i have a apple', 'Convert 3.5 km to m',
    'A car drives 120 km in 2 hours. What is its speed?', 'Density of 500 g in 400 mL, float or sink?', 'A 9 V battery and a 3 ohm resistor: what is the current?',
    'Water at 120 °C: solid, liquid or gas?', 'food chain: sun → grass → grasshopper → frog → snake → hawk']
  for (const t of texts)
    for (const skin of ['kid', 'junior', 'grown']) {
      const s = scene(t, skin)
      assert.ok(s && s.stages.length >= 3 && s.resultTex && s.skin === skin, t)
      assert.ok(clean(s), `${t}: ${JSON.stringify(s).slice(0, 200)}`)
      for (const st of s.stages) assert.ok(st.caption && st.show, t)
    }
})

test('practice words: another word with the same thing to practise', () => {
  let i = 0
  const rand = () => (i++ * 0.37) % 1
  assert.equal(syllabify(practiceWord('syllables', 'elephant', rand)).length, 3)
  assert.equal(pluralOf(practiceWord('plural', 'baby', rand)).rule, 'ies')
  assert.notEqual(practiceWord('plural', 'baby', rand), 'baby')
})
