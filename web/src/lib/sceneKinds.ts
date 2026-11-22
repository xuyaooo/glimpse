// The names and icons of the animations (server/engine/scenes.js decides which one).
export const SCENE_LABEL: Record<string, string> = {
  count: 'Counting',
  number_line: 'Number line',
  columns: 'In columns',
  groups: 'Equal groups',
  area_model: 'Area model',
  sharing: 'Sharing out',
  fractions: 'Fractions',
  percent: 'Percentages',
  order_ops: 'Order of operations',
  powers: 'Powers',
  mean: 'The mean',
  balance: 'The balance',
  inequality: 'Inequality',
  pythagoras: 'Pythagoras',
  pairs: 'The pairing trick',
  quadratic: 'The parabola',
  system: 'Two lines',
  graph: 'The graph',
  trig: 'The unit circle',
  limit: 'The limit',
  derivative: 'The tangent',
  area: 'Area under the curve',
  chance: 'Chance',
  combinations: 'Choosing',
  tree: 'Tree diagram',
  syllables: 'Clap the syllables',
  phonics: 'Sound buttons',
  spelling: 'Spelling, letter by letter',
  plural: 'Plurals',
  sentence: 'Fix the sentence',
  units: 'The unit ladder',
  speed: 'Speed, distance, time',
  density: 'Float or sink',
  circuit: 'The circuit',
  states: 'Solid, liquid, gas',
  food_chain: 'Food chain',
}
export const SCENE_ICON: Record<string, string> = {
  count: '🍎', number_line: '🐸', columns: '🧮', groups: '🍪', area_model: '🟦', sharing: '🍬', fractions: '🍕', percent: '💯',
  order_ops: '🪜', powers: '🚀', mean: '📊', balance: '⚖️', inequality: '↔️', pythagoras: '📐', pairs: '🔢', quadratic: '🌈',
  system: '✖️', graph: '📉', trig: '⭕', limit: '🎯', derivative: '⛷️', area: '📈', chance: '🎲', combinations: '🧩', tree: '🌳',
  syllables: '👏', phonics: '🔤', spelling: '✏️', plural: '🦊', sentence: '📝', units: '📏', speed: '🚗', density: '⛵', circuit: '💡', states: '🧊', food_chain: '🐇',
}
export const sceneLabel = (kind?: string) => (kind ? (SCENE_LABEL[kind] ?? 'Animation') : 'Animation')
export const sceneIcon = (kind?: string) => (kind ? (SCENE_ICON[kind] ?? '✨') : '✨')

/** The topic each animation belongs to (the same names as the engine's topics). */
export const TOPIC: Record<string, string> = {
  count: 'Adding and subtracting', number_line: 'Adding and subtracting', columns: 'Adding and subtracting', groups: 'Multiplication',
  area_model: 'Multiplication', sharing: 'Division', fractions: 'Fractions', percent: 'Percentages', order_ops: 'Order of operations',
  powers: 'Powers and logarithms', mean: 'Averages', balance: 'Equations', inequality: 'Inequalities', pythagoras: 'Pythagoras',
  pairs: 'Number patterns', quadratic: 'Quadratic equations', system: 'Simultaneous equations', graph: 'Functions and graphs',
  trig: 'Trigonometry', limit: 'Limits', derivative: 'Derivatives', area: 'Integrals', chance: 'Probability', combinations: 'Probability', tree: 'Probability',
  syllables: 'Syllables', phonics: 'Phonics', spelling: 'Spelling', plural: 'Plurals', sentence: 'Sentences and punctuation',
  units: 'Units and conversions', speed: 'Speed, distance and time', density: 'Floating and sinking', circuit: 'Electric circuits', states: 'States of matter', food_chain: 'Food chains',
}
// free text from the summaries ("Integrals (area under a curve, e.g. ...)") -> one of the topics.
// Whole words where a part of a word would mislead: "Venn diagrams" is not grams (units),
// "Business maths" is not sine, "paragraph" is not a graph, "individual" is not division.
// The first rule that matches wins: "Sine, cosine and tangent" is trigonometry, not derivatives,
// and "what fractions mean" is fractions, not averages.
const MENTION: [RegExp, string][] = [
  [/integral|area under/i, 'area'], [/derivative|differentiat|tangent line|slope/i, 'derivative'], [/limit/i, 'limit'], [/\btrig|\bsines?\b|cosine|tangent (of|ratio)|unit circle/i, 'trig'],
  [/quadratic|parabola/i, 'quadratic'], [/simultaneous|system/i, 'system'], [/inequal/i, 'inequality'], [/pythag|right(-angled)? triangle|hypotenuse/i, 'pythagoras'],
  [/probab|chance|dice|coin|combination|factorial|tree diagram/i, 'chance'], [/percent/i, 'percent'], [/power|expon|logarithm/i, 'powers'],
  [/fraction|denominator|numerator/i, 'fractions'], [/\bmean\b|average|median/i, 'mean'], [/order of op|bracket/i, 'order_ops'],
  [/equation|solv(e|ing) for x|unknown/i, 'balance'], [/function|\bgraphs?\b/i, 'graph'], [/multipl|times table/i, 'groups'], [/\bdivi|\bshar/i, 'sharing'],
  [/syllable|clap/i, 'syllables'], [/phonic|sound button|digraph/i, 'phonics'], [/spell/i, 'spelling'], [/plural/i, 'plural'], [/sentence|punctuat|capital letter/i, 'sentence'],
  [/\bunits?\b|conver|metre|\b(?:kilo|milli)?grams?\b|litre/i, 'units'], [/speed|distance/i, 'speed'], [/densit|float|sink/i, 'density'], [/circuit|voltage|current|resist|ohm/i, 'circuit'],
  [/solid|liquid|\bgas\b|melt|boil|states? of matter/i, 'states'], [/food chain|predator|producer|consumer/i, 'food_chain'],
  [/\badd|subtract|\bsums?\b|column/i, 'columns'], [/pattern|1 \+ 2/i, 'pairs'],
]
export function topicOf(text: string): string | null {
  for (const [re, kind] of MENTION) if (re.test(text)) return TOPIC[kind]
  return null
}
export const topicIcon = (topic: string) => SCENE_ICON[Object.keys(TOPIC).find((k) => TOPIC[k] === topic) ?? ''] ?? '📘'

/** Every kind of exercise that has an animation, by level, with examples (the Animations page). */
// maxAge: older learners get another animation for these (counting becomes the number line at
// 13), so the card asks for the one it shows.
export const CATALOG: { level: string; kinds: { kind: string; what: string; examples: string[]; maxAge?: number }[] }[] = [
  {
    level: 'Primary school',
    kinds: [
      { kind: 'count', what: 'Adding and taking away small numbers, with things to count.', examples: ['3 + 4 =', '9 - 5 =', '0 + 6 ='], maxAge: 12 },
      { kind: 'number_line', what: 'Adding and subtracting with jumps on a number line (tens, then ones).', examples: ['27 + 15 =', '83 - 38 =', '3 - 8 ='] },
      { kind: 'columns', what: 'Big numbers in columns: carrying and borrowing, explained.', examples: ['345 + 278 =', '602 - 348 =', '1000 - 1 ='] },
      { kind: 'groups', what: 'Times tables as equal groups (plates of cookies, or a dot array).', examples: ['4 \\times 6 =', '6 x 7 = 42', '12 \\times 12 ='] },
      { kind: 'area_model', what: 'Big multiplications as a rectangle split into tens and ones.', examples: ['68 \\times 74 =', '125 \\times 12 =', '7 \\times 34 ='] },
      { kind: 'sharing', what: 'Division as sharing out, with what is left over.', examples: ['24 \\div 6 =', '13 \\div 4 =', '144 \\div 12 ='] },
      { kind: 'fractions', what: 'Adding and subtracting fractions: same-size pieces first. Works over 1 too.', examples: ['\\frac{1}{2} + \\frac{1}{3} =', '\\frac{5}{4} + \\frac{1}{2} =', '\\frac{3}{2} + \\frac{3}{2} ='] },
      { kind: 'pairs', what: 'The pairing trick for 1 + 2 + … + n.', examples: ['1 + 2 + ... + 100 =', '1 + 2 + ... + 10 ='] },
    ],
  },
  {
    level: 'Middle school',
    kinds: [
      { kind: 'percent', what: 'A percentage of an amount, on a 100-square grid.', examples: ['20\\% of 50', '75\\% of 120', '150\\% of 40'] },
      { kind: 'order_ops', what: 'Several operations: brackets, powers, × ÷, then + −, step by step.', examples: ['3 + 4 \\times 2 =', '(5 + 3) \\times 2 - 4 =', '2^3 + 1 ='] },
      { kind: 'powers', what: 'Powers as repeated multiplication; logarithms count them.', examples: ['2^5 =', '5^0 =', '\\log_2 32'] },
      { kind: 'mean', what: 'The mean: towers shared out until they are level (negatives too).', examples: ['mean of 3, 5, 7, 9', 'mean of -2, 4, 7'] },
      { kind: 'balance', what: 'Linear equations on a balance: do the same to both sides.', examples: ['3x + 5 = 20', '2x - 7 = 5x + 2', '-x + 4 = 10'] },
      { kind: 'inequality', what: 'Inequalities: solved like an equation, then a ray on the number line.', examples: ['2x + 3 > 7', '-3x \\ge 9', '5x - 4 \\le 11'] },
      { kind: 'pythagoras', what: 'Pythagoras with real squares on the three sides.', examples: ['3^2 + 4^2 = c^2', '5^2 + b^2 = 13^2', '1^2 + 1^2 = c^2'] },
    ],
  },
  {
    level: 'High school',
    kinds: [
      { kind: 'quadratic', what: 'Quadratic equations: the parabola, the discriminant, the roots.', examples: ['x^2 - 5x + 6 = 0', 'x^2 - 4x + 4 = 0', 'x^2 + 1 = 0'] },
      { kind: 'system', what: 'Two equations: two lines, and where they cross.', examples: ['2x + y = 5, x - y = 1', '3x + 2y = 12, x - y = -1'] },
      { kind: 'graph', what: 'Graphs of functions, where they cross the axes.', examples: ['y = x^2 - 4', 'y = 2x + 1', 'y = 1/x'] },
      { kind: 'trig', what: 'Sine, cosine and tangent on the unit circle (exact values).', examples: ['\\sin 30^\\circ', '\\cos 225^\\circ', '\\tan 90^\\circ'] },
      { kind: 'limit', what: 'Limits: closer and closer from both sides, holes, infinity, one side.', examples: ['\\lim_{x \\to 1} \\frac{x^2 - 1}{x - 1}', '\\lim_{x \\to 0} \\frac{\\sin x}{x}', '\\lim_{x \\to 0^+} \\ln x', '\\lim_{x \\to 0} \\frac{1}{x}'] },
      { kind: 'derivative', what: 'Derivatives: the tangent line, its slope, and the slope curve.', examples: ["f(x) = x^3, f'(2) =", "f(x) = x^2, f'(3) ="] },
      { kind: 'area', what: 'Definite integrals as the area under the curve.', examples: ['\\int_0^1 \\frac{1}{1+x} dx', '\\int_0^4 x^2 dx', '\\int_{\\pi}^{2\\pi} \\sin x dx'] },
    ],
  },
  {
    level: 'Probability',
    kinds: [
      { kind: 'chance', what: 'Chance: every outcome drawn, the good ones lit up.', examples: ['P(rolling a 6) with a die', 'sum of 7 with two dice', 'two coins: P(two heads)', 'bag with 3 red and 5 blue balls, P(red)'] },
      { kind: 'combinations', what: 'Choosing r out of n, and factorials.', examples: ['\\binom{5}{2}', '\\binom{4}{2}', '5! ='] },
      { kind: 'tree', what: 'Two independent events on a tree diagram.', examples: ['P(A) = 0.5, P(B) = 0.3, P(A and B) independent'] },
    ],
  },
  {
    level: 'Reading',
    kinds: [
      { kind: 'syllables', what: 'Clap the beats of a word: one vowel sound, one syllable.', examples: ['How many syllables in elephant?', 'Split butterfly into syllables', 'clap the word rabbit'] },
      { kind: 'phonics', what: 'Sound buttons: the letters that make one sound together (sh, igh, a…e), then blend.', examples: ['sound out ship', 'How many sounds in night?', 'phonics: cake'] },
      { kind: 'spelling', what: 'A misspelled word compared letter by letter with the right one, then in beats.', examples: ['becaus -> because', 'freind should be friend', 'Spell beautiful'] },
      { kind: 'plural', what: 'One, two: -s, -es, -ies, -ves, and the special words.', examples: ['plural of fox', 'plural of baby', 'plural of child', 'plural of knife'] },
      { kind: 'sentence', what: 'Capital letters, I, a or an, and the right mark at the end.', examples: ['Punctuate: i have a apple', 'correct the sentence: where is my book', 'fix: the the cat is big'] },
    ],
  },
  {
    level: 'Science',
    kinds: [
      { kind: 'units', what: 'Converting units on a ladder: down is ×, up is ÷.', examples: ['Convert 3.5 km to m', '2500 g in kg', '45 min = ? h', '3 L to mL'] },
      { kind: 'speed', what: 'Speed, distance and time: the triangle, then the car on the road.', examples: ['A car drives 120 km in 2 hours. What is its speed?', 'How long does it take to drive 150 km at 60 km/h?', 'How far do you go in 3 h at 80 km/h?'] },
      { kind: 'density', what: 'Density = mass ÷ volume, then into the water: float or sink.', examples: ['A block has a mass of 200 g and a volume of 250 cm3. Does it float?', 'Density of 500 g in 400 mL, float or sink?'] },
      { kind: 'circuit', what: 'V = I × R in a circuit, resistors in series or in parallel, current flowing.', examples: ['A 9 V battery and a 3 ohm resistor: what is the current?', 'Resistors of 2 ohms and 4 ohms in series with 12 V. Current?', '6 V across two 6 ohm resistors in parallel, current?'] },
      { kind: 'states', what: 'Solid, liquid or gas at a temperature: the thermometer and the particles.', examples: ['Water at 120 °C: solid, liquid or gas?', 'ice at -5 °C', 'What state is iron at 1600°C?'] },
      { kind: 'food_chain', what: 'Who eats whom: the energy from the producer to the top predator.', examples: ['grass -> rabbit -> fox', 'food chain: sun → grass → grasshopper → frog → snake → hawk', 'Owls eat mice and mice eat seeds'] },
    ],
  },
]

// A kind's subject (server/engine/domains.js): the reading and science animations, the rest maths.
const READING_KINDS = ['syllables', 'phonics', 'spelling', 'plural', 'sentence']
const SCIENCE_KINDS = ['units', 'speed', 'density', 'circuit', 'states', 'food_chain']
export function subjectOfKind(kind: string | undefined | null): 'maths' | 'reading' | 'science' {
  return READING_KINDS.includes(kind ?? '') ? 'reading' : SCIENCE_KINDS.includes(kind ?? '') ? 'science' : 'maths'
}
