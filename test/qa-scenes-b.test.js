// Regression tests for the animation library's rules (a rule fires only when the whole exercise is
// that kind), the probability scenes and the middle-school scenes (QA group G1b). Each test names
// the bug it pins down.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compile, detectScene, buildScene, sceneFor } from '../server/engine/scenes.js'

const S = (exercise, age = 12, kind) => sceneFor({ exercise, age, kind })
const R = (exercise, age = 12, kind) => S(exercise, age, kind)?.resultTex ?? null
const K = (exercise, age = 12, kind) => S(exercise, age, kind)?.kind ?? null
const words = (s) => (s?.stages || []).map((x) => `${x.caption} ${x.math ?? ''}`).join(' | ')

// ------------------------------------------------------------------ rules: the whole exercise only

test('a special rule never answers part of a longer exercise', () => {
  for (const t of ['log_2 8 + log_2 4', 'log_2 1/8', '2 \\times \\log_2 8', '\\log_{2}(8) - 1', 'log_3 9^2', 'log_2 8.5', '\\log_2 8 + \\log_2 4']) assert.notEqual(K(t, 14), 'powers', t)
  for (const t of ['20% of 50 + 10 =', '100 - 20% of 50', '20% of 50 + 5', '20 + 30 \\% of 10']) assert.notEqual(K(t), 'percent', t)
  for (const t of ['\\frac{\\binom{4}{2}}{\\binom{10}{2}}', '\\binom{5}{2} \\times \\binom{3}{1}', '\\binom{5}{2} \\times 2']) assert.notEqual(K(t, 16), 'combinations', t)
  for (const t of ['2^3 + 1 =', '2 \\times 2^3 =']) assert.notEqual(K(t), 'powers', t)
  // the whole exercise, with words before it or the answer after it, still works
  assert.equal(R('\\log_2 32', 14), '5')
  assert.equal(R('\\log_{2}(8) =', 14), '3')
  assert.equal(R('Evaluate \\log_3 27', 14), '3')
  assert.equal(R('log_2 8 = 3', 14), '3')
  assert.equal(R('What is 2^5?'), '32')
  assert.equal(R('20% of 50 = 10'), '10')
  assert.equal(R('\\binom{6}{3} = 20', 16), '20')
  assert.equal(R('5C2', 16), '10')
})

test('C(x, y) next to other points is a point, not a combination', () => {
  for (const t of ['Triangle with A(0, 0), B(4, 0), C(4, 3). Find AC.', 'Plot the points A(1, 4), B(3, 1) and C(6, 2).', 'C(7, 2) is a point on the line y = 2x - 12', 'Plot the point C(6, 2).']) assert.notEqual(K(t, 14), 'combinations', t)
  assert.equal(R('C(5, 2)', 16), '10')
  assert.equal(R('C(5,2) =', 16), '10')
})

test('labels and instruction words in front of the exercise are not part of it', () => {
  assert.equal(R('Solve: $2x+5=11$'), 'x = 3')
  assert.equal(R('a) $3x + 5 = 20$'), 'x = 5')
  assert.equal(R('1) $5 + 3 =$', 7), '8')
  assert.equal(R('Work out $6 \\times 7$', 9), '42')
  assert.equal(R('Solve 2x + 3 = 11'), 'x = 4')
  assert.equal(R('Q2. 34 + 18 =', 9), '52')
  assert.equal(R('Find x: 2x + 3 = 11'), 'x = 4') // not "x / 2x + 3 = 11", a quadratic
  assert.equal(R('Solve for x: 3x = 9'), 'x = 3')
  assert.equal(R('2.5 + 1.5 ='), null) // a decimal is no label
  assert.equal(detectScene('Solve the Riemann hypothesis'), null)
})

test('² and ³, \\text{ of }, Unicode minus signs and \\mathrm{d}x are read', () => {
  assert.equal(R('2³ ='), '8')
  assert.equal(R('20\\% \\text{ of } 50'), '10')
  assert.equal(R('mean of −2, 4, 7'), '3')
  assert.equal(R('mean of –2, 4, 7'), '3')
  assert.equal(R('mean of 3, −2, 5'), '2')
  assert.equal(R('\\int_{0}^{1} x^{2} \\mathrm{d}x', 16), '\\approx 0.333')
  assert.equal(R('$AC^2 = 3^2 + 4^2$', 13), '5')
})

test('mixed numbers are sums, and a handwritten x between numbers and brackets is times', () => {
  assert.equal(compile('1\\frac{1}{2}', [])(), 1.5)
  assert.equal(compile('-2\\frac{1}{4}', [])(), -2.25)
  assert.equal(compile('x^2\\frac{1}{2}')(2), 2) // an exponent is no whole part
  assert.equal(R('x + 1\\frac{1}{2} = 5'), 'x = 3.5') // not 4.5 (1 × 1/2)
  assert.equal(R('2x = 3\\frac{1}{2}'), 'x = 1.75') // not 0.75
  assert.equal(R('(2+3) x 4 = 20'), '20')
  assert.equal(R('2 x (3 + 4) = 14'), '14')
  assert.equal(R('3 x -2 = -6'), '-6')
  assert.equal(K('\\frac{1}{2} x 4 = 2'), null) // not the equation 2x = 2
  // the unknown x stays an unknown
  assert.equal(R('3 x + 5 = 20'), 'x = 5')
  assert.equal(R('3 x - 2 = 7'), 'x = 3')
  assert.equal(R('3x - 2 = 7'), 'x = 3')
})

test('scene detection stays fast on long input', () => {
  const t0 = performance.now()
  for (const t of ['1'.repeat(999), '1% of '.repeat(160), '1 red '.repeat(160), 'probability ' + '1 red 2 blue '.repeat(70), 'P(A) = 0.1, '.repeat(80), 'mean ' + '1, '.repeat(330), '-'.repeat(990) + '3^2']) detectScene(t)
  assert.ok(performance.now() - t0 < 300, `${Math.round(performance.now() - t0)} ms`)
})

// ------------------------------------------------------------------ middle school

test('complex fractions are not a sum of two fractions; spaced fractions are', () => {
  for (const t of ['\\frac{1}{2 + \\frac{3}{4}}', '\\frac{\\frac{1}{2}+1}{3}', '(1/2 + 1)/3', '1/(2+3/4)', '\\frac{1}{2 + \\frac{3}{4}} =']) assert.notEqual(K(t), 'fractions', t)
  assert.equal(buildScene({ kind: 'fractions', expression: '1/(2+3/4)' }, { age: 12 }), null)
  assert.equal(R('(1/2 + 1)/3'), '0.5') // as a division, worked exactly
  assert.equal(R('1 / 2 + 1 / 4 ='), '\\frac{3}{4}')
  assert.equal(K('1 / 2 + 1 / 4 ='), 'fractions')
  assert.equal(R('(1/2) + (1/4) ='), '\\frac{3}{4}')
  assert.equal(R('\\frac{1}{2}+\\frac{1}{4}=\\frac{3}{4}'), '\\frac{3}{4}')
})

test('fractions with × or ÷ are not worked as decimals with brackets nobody wrote', () => {
  for (const t of ['\\frac{1}{2} \\times \\frac{1}{4} =', '\\frac{1}{2} \\times 42 = 21', '\\frac{2}{3} \\div \\frac{1}{3} =', '1/2 ÷ 1/4 + 1 =', '1/2 \\div 1/4 =']) {
    assert.notEqual(K(t), 'order_ops', t)
    assert.doesNotMatch(words(S(t)), /Brackets first: 1 ÷ 2/, t)
  }
  assert.equal(R('7 / 2 + 1 \\times 2 ='), '5.5') // '/' alone is a division
})

test('a minus sign in front is not a subtraction, and comes after the power: -3^2 = -9', () => {
  assert.equal(R('-3^2'), '-9')
  assert.equal(R('-3^2 ='), '-9')
  assert.equal(R('-2^2 + 1'), '-3')
  assert.equal(R('10 - 2 × -3^2'), '28')
  assert.equal(R('5 - -2^2'), '9')
  assert.equal(R('(-2)^3 + 1'), '-7')
  assert.equal(R('-(2+3)^2'), '-25')
  assert.match(words(S('-3^2')), /The minus sign in front makes it -9/)
  for (const t of ['-3 + 4 × 2', '5 - (-2) × 3', '2^{-1} + 1', '3 + -2 × 4', '-3^2', '2 \\times -3 + 1']) assert.doesNotMatch(words(S(t)), /\b0 − |0 - /, t)
  assert.equal(S('-3 + 4 × 2').stages.length, 3)
  assert.equal(R('5 - (-2) × 3'), '11')
  assert.equal(R('3 - (-2) ='), '5') // one operation with a negative number has no other animation
})

test('a negative base keeps its brackets after the brackets step', () => {
  const s = S('(2 - 5)^2 + 1')
  assert.equal(s.resultTex, '10')
  assert.equal(s.stages[1].math, '\\underbrace{\\left(-3\\right)^{2}}_{9} + 1')
  assert.match(s.stages[1].caption, /\(-3\) to the power 2 = 9/)
  assert.match(S('3 × (1 − 4)^2').stages[1].math, /\\left\(-3\\right\)\^\{2\}/)
  assert.match(S('10 - 2 × -3^2').stages[1].math, /2 \\times \\left\(-9\\right\)/)
})

test('two operations of the same level are worked left to right', () => {
  const a = S('8 ÷ 2 × 4 =')
  assert.equal(a.resultTex, '16')
  assert.match(a.stages[0].caption, /left to right: 8 ÷ 2 = 4/)
  assert.doesNotMatch(words(a), /before plus and minus/)
  assert.equal(R('10 − 3 + 2 ='), '9')
  assert.equal(R('100 \\div 10 \\times 2 ='), '20')
  assert.equal(K('2 + 2 + 2 ='), null) // the same operation again: nothing to order
  assert.equal(R('(5 + 3) \\times 2 - 4 ='), '12')
})

test('results are exact, never rounded and shown with "="', () => {
  const a = S('0.25 × 0.25 + 1')
  assert.equal(a.resultTex, '1.0625')
  assert.match(a.stages[0].caption, /0\.25 × 0\.25 = 0\.0625/)
  assert.equal(R('17.5% of 2.5'), '0.4375')
  assert.equal(R('2.5% of 1.5'), '0.0375')
  assert.equal(R('12.345% of 6.789'), '\\approx 0.838') // too long to write: ≈
  assert.match(words(S('12.345% of 6.789')), /about 0\.838.*\\approx 0\.838/)
  assert.equal(R('mean of 1, 2, 2'), '\\frac{5}{3} \\approx 1.667')
  assert.match(words(S('mean of 1, 2, 2')), /5 ÷ 3 ≈ 1\.667/)
  assert.equal(R('mean of 1.5, 2, 2'), '\\approx 1.833')
  assert.equal(R('mean of 1, 2, 3, 4'), '2.5')
  assert.equal(K('1 \\div 3 + 1 ='), null) // 0.333... can't be written exactly
})

test('percentages of amounts with thousands separators or a currency', () => {
  assert.equal(R('20% of 1,000'), '200')
  assert.equal(R('25% of 1,200'), '300')
  assert.equal(R('20% of 2 500'), '500')
  assert.equal(R('What is 30% of 2,000?'), '600')
  assert.equal(R('20% of 1\\,000'), '200')
  assert.equal(R('Find 20% of £45'), '9')
  assert.equal(R('10% of €250'), '25')
  assert.equal(R('20% of 50.'), '10')
  assert.equal(R('150\\% of 40'), '60')
})

test('mean: the whole list, and not a missing-value exercise', () => {
  assert.equal(R('mean of 10, 20, and 30', 11), '20')
  assert.equal(R('Find the average of 4, 8, and 12.', 11), '8')
  assert.equal(R('The mean of 4 and 6'), '5')
  assert.equal(R('mean of 3, 5, 7, 9'), '6')
  assert.equal(S('The mean of 5, 8 and x is 7. Find x.'), null)
  assert.equal(S('mean of 5, 8 and x'), null)
  assert.equal(S('mean of 1,200, 1,500 and 1,800'), null) // thousands or a list? Not guessed
})

test('log base b of 1 is explained with the powers going down', () => {
  const s = S('log_5 1', 14)
  assert.equal(s.resultTex, '0')
  assert.equal(s.descending, true)
  assert.deepEqual(s.chain, [125, 25, 5, 1])
  assert.doesNotMatch(words(s), /0 5s make 1/)
  assert.match(s.stages.at(-1).caption, /log base 5 of 1 is 0/)
  assert.equal(R('5^0 =', 13), '1')
})

// ------------------------------------------------------------------ probability

test('two dice: the sum compared with a number, "2 dice" is not the sum', () => {
  const want = [
    ['Two dice: P(sum > 8)', '\\frac{5}{18}'],
    ['What is the probability that the sum of the 2 dice is 7?', '\\frac{1}{6}'],
    ['Two dice are rolled. What is the probability that the sum is greater than 10?', '\\frac{1}{12}'],
    ['Two dice are rolled. What is the probability that the sum is more than 9?', '\\frac{1}{6}'],
    ['Two dice are rolled. What is the probability that the sum is less than 5?', '\\frac{1}{6}'],
    ['Two dice: P(sum ≥ 10)', '\\frac{1}{6}'],
    ['Two dice: P(total < 5)', '\\frac{1}{6}'],
    ['Two dice: probability of a sum less than 5', '\\frac{1}{6}'],
    ['Two dice are rolled. What is the probability that the sum is 7 or more?', '\\frac{7}{12}'],
    ['The scores on two dice are added. What is the probability of a total of 9?', '\\frac{1}{9}'],
    ['sum of 7 with two dice', '\\frac{1}{6}'],
  ]
  for (const [t, r] of want) assert.equal(R(t), r, t)
  assert.match(words(S('Two dice: P(sum > 8)')), /a sum of more than 8 with two dice: 10/)
  // what can't be read is no animation (and never a one-die scene)
  for (const t of ['Two dice: P(sum is 7 or 11)', 'Two dice are rolled. What is the probability that both are even?', 'Roll two dice. What is the probability of a 6 on both dice?', 'Roll 3 dice. What is the probability that the sum is 18?', 'Two dice are thrown. Probability of a double six?']) assert.equal(S(t), null, t)
})

test('one die: not, or more, or less, a 3 or a 4; other dice and repeated rolls are no animation', () => {
  const want = [
    ['What is the probability of NOT rolling a 6 on a die?', '\\frac{5}{6}'],
    ['What is the probability of not getting a 6 on a die?', '\\frac{5}{6}'],
    ['Roll a die. What is the probability of rolling a 5 or more?', '\\frac{1}{3}'],
    ['Roll a die. What is the probability of rolling a 4 or higher?', '\\frac{1}{2}'],
    ['Roll a die. What is the probability of rolling a 1 or a 2?', '\\frac{1}{3}'],
    ['Probability of rolling a 3 or a 4 on a die', '\\frac{1}{3}'],
    ['Roll a die. What is the probability of getting a number less than or equal to 3?', '\\frac{1}{2}'],
    ['P(rolling a 6) with a die', '\\frac{1}{6}'],
    ['roll a die: P(even)', '\\frac{1}{2}'],
    ['roll a die: P(more than 4)', '\\frac{1}{3}'],
    ['A die is rolled. Find P(5).', '\\frac{1}{6}'],
    ['A fair six-sided die is rolled. Find the probability of rolling a 7.', '0'],
  ]
  for (const [t, r] of want) assert.equal(R(t), r, t)
  for (const t of ['A 4-sided die is rolled. What is the probability of rolling a 3?', 'What is the probability of rolling a 6 twice?', 'A die is rolled 60 times. How many times would you expect a 6?', 'Roll a die. What is the probability of a prime number?']) assert.equal(S(t), null, t)
})

test('coins: how many coins, heads or tails, at least, and an order', () => {
  const want = [
    ['Toss two coins. What is the probability of getting at least one head?', '\\frac{3}{4}'],
    ['Toss two coins. What is the probability of getting two tails?', '\\frac{1}{4}'],
    ['Toss two coins. P(HH)', '\\frac{1}{4}'],
    ['Toss two coins. P(HT)', '\\frac{1}{4}'],
    ['Toss three coins. P(at least 2 heads)', '\\frac{1}{2}'],
    ['Toss 3 coins. P(at least one head)', '\\frac{7}{8}'],
    ['Toss 2 coins. P(2 tails)', '\\frac{1}{4}'],
    ['Toss 2 coins. P(no heads)', '\\frac{1}{4}'],
    ['Flip a coin 3 times. What is the probability of exactly 1 head?', '\\frac{3}{8}'],
    ['A coin is tossed 3 times. Probability of exactly one head?', '\\frac{3}{8}'],
    ['Toss three fair coins. What is the probability of exactly one head?', '\\frac{3}{8}'],
    ['A coin is tossed twice. Find the probability of getting two heads.', '\\frac{1}{4}'],
    ['Toss two coins. What is the probability of getting a head and a tail?', '\\frac{1}{2}'],
    ['two coins: P(two heads)', '\\frac{1}{4}'],
    ['Flip a coin. P(tails)', '\\frac{1}{2}'],
  ]
  for (const [t, r] of want) assert.equal(R(t), r, t)
  assert.match(words(S('Flip a coin. P(tails)')), /1 tail with 1 coin/)
  assert.equal(S('Toss two coins. P(getting a head)'), null) // exactly one, or at least one?
})

test('coins and coloured things in word problems are not probability', () => {
  for (const [t, age] of [['There are 3 red cars and 5 blue cars. How many cars are there altogether?', 7], ['Sam has 3 coins of 20p. How much money does he have?', 7], ['I have 3 coins: 10p, 20p and 50p. How much money do I have?', 9], ['3 red cars + 4 blue cars =', 7], ['Sam has 5 red balloons and 3 blue balloons. How many balloons?', 7], ['There are 4 red cars and 6 blue cars in the car park. How many cars are there?', 10], ['Mia buys 3 coins for 50p each. How much does she pay?', 10], ['I have 3 coins in my pocket.', 10]]) {
    assert.notEqual(K(t, age), 'chance', t)
    assert.notEqual(K(t, age, 'chance'), 'chance', t) // not even when the classifier says so
  }
})

test('a bag: the colour asked, or no animation', () => {
  const want = [
    ['A bag has 3 red and 5 blue marbles. What is the probability of drawing a blue marble?', '\\frac{5}{8}'],
    ['A bag has 3 red and 5 blue balls. One is taken at random. Find the probability that it is blue.', '\\frac{5}{8}'],
    ['A bag has 3 red and 5 blue balls. Find the probability that the ball is blue', '\\frac{5}{8}'],
    ['A bag has 4 red and 6 blue balls. Find the probability that the ball taken out is blue.', '\\frac{3}{5}'],
    ['A bag has 3 red and 5 blue balls. P(not red)', '\\frac{5}{8}'],
    ['bag with 3 red and 5 blue balls, P(red)', '\\frac{3}{8}'],
    ['There are 5 red and 3 blue sweets in a jar. One is chosen at random. What is the probability it is blue?', '\\frac{3}{8}'],
  ]
  for (const [t, r] of want) assert.equal(R(t), r, t)
  for (const t of ['A bag has 3 red, 5 blue and 2 green marbles. What is the probability of picking a red one?', 'A bag holds 3 red, 5 blue and 2 green balls. P(green)?', 'A bag has 4 red and 6 blue balls. Two are taken without replacement. P(both red)?', 'A bag has 3 red and 5 blue balls. What is the probability of red or blue?']) assert.equal(S(t), null, t)
})

test('tree: exact products, fractions kept as fractions', () => {
  const a = S('P(A) = 0.25 and P(B) = 0.35 are independent. Find P(A and B).', 15)
  assert.equal(a.resultTex, '0.0875')
  assert.match(a.stages.at(-1).caption, /0\.25 × 0\.35 = 0\.0875/)
  assert.equal(R('P(A) = 0.35, P(B) = 0.45, independent, P(A and B)', 15), '0.1575')
  const b = S('P(A) = 1/4, P(B) = 1/3, independent, find P(A and B)', 15)
  assert.equal(b.resultTex, '\\frac{1}{12}')
  assert.match(b.stages[1].caption, /1\/3, or not 2\/3/)
  assert.deepEqual(b.labels, { A: '1/4', notA: '3/4', B: '1/3', notB: '2/3', paths: ['1/12', '1/6', '1/4', '1/2'] })
  assert.equal(R('P(A) = 1/4, P(B) = 2/5, P(A and B) independent', 15), '0.1') // a decimal when it ends
  assert.equal(R('P(A) = \\dfrac{1}{4}, P(B) = \\dfrac{1}{2}, independent, P(A \\cap B)', 15), '0.125')
  assert.equal(R('P(A) = 1 / 4, P(B) = 1 / 2, independent, find P(A and B)', 15), '0.125')
  assert.equal(S('P(A) = 0.5, P(B) = 0.3, P(A and B) independent', 15).both, 0.15)
})

test('tree: only P(A and B) of the two events asked', () => {
  for (const t of ['P(A) = 0.5 and P(B) = 0.3, A and B independent. Find P(A or B).', 'P(A) = 0.3, P(B) = 0.5, P(A \\cap B) = 0.1. Find P(A \\cup B)', 'P(A) = 0.5 and P(B) = 0.4. Find P(A or B)', 'P(A)=0.3, P(B)=0.5, P(A ∩ B)=0.1, find P(A ∪ B)', 'P(A) = 0.6, P(B) = 0.5. A and B are mutually exclusive. Find P(A and B)', 'P(A) = 0.6, P(B) = 0.5. Find P(B | A)']) assert.notEqual(K(t, 15), 'tree', t)
  const c = S('P(A) = 0.5, P(B) = 0.3, P(C) = 0.2. A and C are independent. Find P(A and C).', 15)
  assert.equal(c.resultTex, '0.1')
  assert.deepEqual([c.nameA, c.nameB], ['A', 'C'])
})

test('combinations: choosing none, and 1!', () => {
  const a = S('\\binom{5}{0}', 15)
  assert.equal(a.resultTex, '1')
  assert.deepEqual(a.groups, [])
  assert.doesNotMatch(words(a), /groups: \./)
  assert.match(words(a), /one way to choose nothing/)
  const b = S('1! =')
  assert.equal(b.resultTex, '1')
  assert.doesNotMatch(words(b), /1 things|1 choices|0 for the next|1 orders/)
  assert.match(words(S('2! =')), /2 choices for the first place, then 1 for the last/)
  assert.deepEqual(S('\\binom{4}{2}', 15).groups, ['AB', 'AC', 'AD', 'BC', 'BD', 'CD'])
})
