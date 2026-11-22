// The animations for Reading and Science, next to the maths ones in scenes.js. Same rules:
// the text is read by code (no eval, no model), every answer is worked out here, and a builder
// returns null when it isn't sure (then no animation is shown, only the written explanation).
//
// Reading: syllables, phonics (sounds), spelling, plural, sentence (capitals, punctuation).
// Science: units (conversions), speed (distance, time), density (floating and sinking),
//          circuit (V = I × R), states (solid, liquid, gas), food_chain.

export const READING_KINDS = ['syllables', 'phonics', 'spelling', 'plural', 'sentence']
export const SCIENCE_KINDS = ['units', 'speed', 'density', 'circuit', 'states', 'food_chain']
export const DOMAIN_KINDS = [...READING_KINDS, ...SCIENCE_KINDS]
export const SUBJECT_OF = Object.fromEntries([...READING_KINDS.map((k) => [k, 'reading']), ...SCIENCE_KINDS.map((k) => [k, 'science'])])
/** How advanced each kind is (the look with the child's age, as in scenes.js). */
export const DOMAIN_LEVEL = { syllables: 1, phonics: 1, plural: 1, spelling: 1, food_chain: 1, sentence: 2, units: 2, states: 2, speed: 3, density: 3, circuit: 3 }
/** The kinds that work on one word: Laya can pick them for a bare word on a reading page. */
export const WORD_KINDS = ['syllables', 'phonics', 'spelling', 'plural']

const round = (v, d = 6) => Math.round(v * 10 ** d) / 10 ** d
const fmt = (v) => {
  if (!Number.isFinite(v)) return String(v)
  const r = round(v, 4)
  return Math.abs(r) >= 1e6 ? r.toExponential(3).replace('e+', ' × 10^') : String(r)
}
const tex = (t) => `\\text{${String(t).replace(/[{}\\$%#&_^~]/g, (c) => (c === '%' ? '\\%' : c === '$' ? '\\$' : c === '#' ? '\\#' : c === '&' ? '\\&' : c === '_' ? '\\_' : ''))}}`
const clean = (text) =>
  String(text ?? '')
    .replace(/\$/g, ' ')
    .replace(/\\text\{([^}]*)\}/g, '$1')
    .replace(/\\(?:quad|qquad|[,;:! ])/g, ' ')
    .replace(/\\(?:to|rightarrow|longrightarrow)\b/g, '→')
    .replace(/\\(?:Omega)\b/g, 'Ω')
    .replace(/\\(?:degree|circ)\b/g, '°')
    .replace(/\^\s*\{?\s*\\circ\s*\}?/g, '°')
    .replace(/\\,|\\ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
const num = (s) => {
  const v = Number(String(s).replace(',', '.').replace(/\s/g, ''))
  return Number.isFinite(v) ? v : null
}
const NUM = String.raw`(-?\d+(?:[.,]\d+)?)`

// ======================================================================== READING

const VOWELS = 'aeiouy'
// y is a vowel inside or at the end of a word (gym, happy), a consonant before a vowel (yes, playing)
const before = (w, i) => i + 1 < w.length && 'aeiou'.includes(w[i + 1])
const isVowel = (w, i) => 'aeiou'.includes(w[i]) || (w[i] === 'y' && i > 0 && !('aeiou'.includes(w[i - 1]) && before(w, i)))
// Words schools split another way than the rules below, and words that break them
const SYLLABLES = {
  elephant: ['el', 'e', 'phant'], crocodile: ['croc', 'o', 'dile'], animal: ['an', 'i', 'mal'], lemon: ['lem', 'on'], seven: ['sev', 'en'],
  river: ['riv', 'er'], camel: ['cam', 'el'], planet: ['plan', 'et'], family: ['fam', 'i', 'ly'], every: ['ev', 'ery'], different: ['dif', 'fer', 'ent'],
  chocolate: ['choc', 'o', 'late'], vegetable: ['veg', 'e', 'ta', 'ble'], beautiful: ['beau', 'ti', 'ful'], people: ['peo', 'ple'],
  lion: ['li', 'on'], piano: ['pi', 'an', 'o'], radio: ['ra', 'di', 'o'], video: ['vid', 'e', 'o'], idea: ['i', 'de', 'a'], create: ['cre', 'ate'],
  poem: ['po', 'em'], quiet: ['qui', 'et'], science: ['sci', 'ence'], giant: ['gi', 'ant'], diary: ['di', 'a', 'ry'], violin: ['vi', 'o', 'lin'],
  hippopotamus: ['hip', 'po', 'pot', 'a', 'mus'], caterpillar: ['cat', 'er', 'pil', 'lar'], kangaroo: ['kan', 'ga', 'roo'], spaghetti: ['spa', 'ghet', 'ti'],
  computer: ['com', 'pu', 'ter'], dinosaur: ['di', 'no', 'saur'], butterfly: ['but', 'ter', 'fly'], banana: ['ba', 'nan', 'a'], tomato: ['to', 'ma', 'to'],
  potato: ['po', 'ta', 'to'], umbrella: ['um', 'brel', 'la'], alligator: ['al', 'li', 'ga', 'tor'], helicopter: ['hel', 'i', 'cop', 'ter'],
  watermelon: ['wa', 'ter', 'mel', 'on'], strawberry: ['straw', 'ber', 'ry'], fire: ['fire'], hour: ['hour'], orange: ['or', 'ange'],
}
const BLENDS = new Set(['bl', 'br', 'ch', 'cl', 'cr', 'dr', 'fl', 'fr', 'gl', 'gr', 'pl', 'pr', 'sc', 'sh', 'sk', 'sl', 'sm', 'sn', 'sp', 'st', 'sw', 'th', 'tr', 'tw', 'wh', 'wr', 'ph', 'qu', 'scr', 'spr', 'str', 'thr', 'shr', 'chr', 'spl', 'squ'])

/** The syllables of one word: ['but', 'ter', 'fly']. Rules (closed and open syllables, blends, -le, silent e) + a list of exceptions. */
export function syllabify(word) {
  const w = String(word).toLowerCase()
  if (!/^[a-z]+$/.test(w)) return null
  if (SYLLABLES[w]) return SYLLABLES[w]
  // the vowel groups, each one beat (a final silent e, -ed and -es are not beats)
  let groups = []
  for (let i = 0; i < w.length; ) {
    if (isVowel(w, i)) {
      let j = i
      // a vowel y before another vowel is a beat of its own (cry·ing, fly·er)
      while (j < w.length && isVowel(w, j) && !(j > i && w[j - 1] === 'y')) j++
      groups.push([i, j])
      i = j
    } else i++
  }
  const last = groups[groups.length - 1]
  const silentE = groups.length > 1 && last && last[0] === w.length - 1 && w.endsWith('e') && !/[^aeiouy]le$/.test(w)
  const silentEd = groups.length > 1 && /[^aeiouytd]ed$/.test(w) && last[0] === w.length - 2
  const silentEs = groups.length > 1 && /[^aeiouy]es$/.test(w) && !/(s|x|z|ch|sh|ce|ge)es$/.test(w) && last[0] === w.length - 2
  if (silentE || silentEd || silentEs) groups = groups.slice(0, -1)
  if (groups.length <= 1) return [w]
  // where to cut between two beats
  const cuts = []
  for (let g = 0; g < groups.length - 1; g++) {
    const end = groups[g][1]
    const next = groups[g + 1][0]
    const between = w.slice(end, next)
    let cut
    if (between.length === 0) cut = end // two vowels heard apart
    else if (g === groups.length - 2 && /[^aeiouy]le$/.test(w) && next === w.length - 1) cut = w.length - 3 // -ble, -tle, -dle: the consonant goes with -le
    else if (between.length === 1) cut = between === 'x' ? next : end // open syllable (ti-ger); x stays (tax-i)
    else if (between === 'ck') cut = next // pock-et
    else if (between.length === 2) cut = BLENDS.has(between) && !['st', 'sk', 'sp', 'sc'].includes(between) ? end : end + 1 // mo-ther? keep th/ch/sh together; rab-bit
    else cut = BLENDS.has(between.slice(1)) ? end + 1 : end + between.length - 1 // ham-ster, chil-dren
    cuts.push(cut)
  }
  // suffixes: -ed after t or d (want·ed) and -ing (jump·ing) are a beat of their own, unless the
  // consonant before them is doubled (pat·ted, run·ning: the rule above already cuts between the two)
  const suffix = /[td]ed$/.test(w) ? 2 : /ing$/.test(w) ? 3 : 0
  if (suffix && cuts.length && w[w.length - suffix - 1] !== w[w.length - suffix - 2]) cuts[cuts.length - 1] = w.length - suffix
  const parts = []
  let from = 0
  for (const c of cuts) {
    parts.push(w.slice(from, c))
    from = c
  }
  parts.push(w.slice(from))
  return parts.filter(Boolean)
}

function buildSyllables({ word }, skin) {
  const parts = syllabify(word)
  if (!parts || word.length > 24) return null
  const w = word.toLowerCase()
  const vowels = [...w].map((_, i) => i).filter((i) => isVowel(w, i))
  const n = parts.length
  const dotted = parts.join('·')
  const stages = [
    { caption: `Let's clap the word "${w}".`, show: 'word', math: tex(w) },
    { caption: `Listen for the vowel sounds: each one is a beat.`, show: 'vowels', math: tex(w) },
    { caption: n === 1 ? `Only one beat: "${w}" is one syllable.` : `Split it between the beats: ${parts.join(' · ')}.`, show: 'split', math: tex(dotted) },
    { caption: `Clap it: ${parts.map((p) => `${p} (clap)`).join(', ')}. That's ${n} syllable${n === 1 ? '' : 's'}!`, show: 'clap', math: `${tex(dotted)} \\;(${n})` },
  ]
  return { kind: 'syllables', skin, word: w, parts, vowels, count: n, stages, resultTex: `${tex(dotted)}\\;(${n})` }
}

// Graphemes, longest first: the letters that make one sound together
const GRAPHEMES = ['tch', 'dge', 'igh', 'air', 'ear', 'eer', 'ure', 'sh', 'ch', 'th', 'ph', 'wh', 'ck', 'ng', 'qu', 'kn', 'wr', 'gn', 'mb', 'll', 'ss', 'ff', 'zz', 'ee', 'ea', 'oa', 'ai', 'ay', 'oo', 'ou', 'ow', 'oi', 'oy', 'ar', 'or', 'er', 'ir', 'ur', 'ew', 'aw', 'au', 'ie', 'ue', 'ey']

/** The sounds of a word: [{ g: 'sh', type: 'digraph' }, { g: 'i' }, ...]; a_e (cake) is one sound across a consonant. */
export function sounds(word) {
  const w = String(word).toLowerCase()
  if (!/^[a-z]+$/.test(w)) return null
  // split digraph (magic e): vowel + one consonant + final e, as in cake, bike, home, cube, these
  const magic = w.length >= 3 && /[aeiou][^aeiouwxy]e$/.test(w) && !/(ee|ie|oe|ue)$/.test(w) ? w.length - 3 : -1
  const out = []
  for (let i = 0; i < w.length; ) {
    if (i === magic) {
      out.push({ g: `${w[i]}_e`, type: 'split', at: i, end: w.length - 1 })
      i++
      continue
    }
    if (magic >= 0 && i === w.length - 1) break // the e of a_e is already a sound
    const g = GRAPHEMES.find((x) => w.startsWith(x, i) && !(magic >= 0 && i + x.length > magic && i < magic))
    if (g) {
      out.push({ g, type: g.length === 3 ? 'trigraph' : 'digraph', at: i })
      i += g.length
    } else {
      out.push({ g: w[i], type: 'single', at: i })
      i++
    }
  }
  return out
}

function buildPhonics({ word }, skin) {
  const w = String(word).toLowerCase()
  const ss = sounds(w)
  if (!ss || !ss.length || w.length > 16) return null
  const said = ss.map((s) => s.g.replace('_e', '-e')).join(' – ')
  const special = ss.filter((s) => s.type !== 'single')
  const stages = [
    { caption: `"${w}" has ${w.length} letters. How many sounds?`, show: 'word', math: tex(w) },
    { caption: special.length ? `Some letters work together: ${special.map((s) => (s.type === 'split' ? `${s.g[0]}…e (the e makes the ${s.g[0]} say its name)` : `"${s.g}"`)).join(', ')} make${special.length === 1 ? 's' : ''} one sound.` : 'Each letter makes its own sound.', show: 'buttons', math: tex(ss.map((s) => s.g).join(' · ')) },
    { caption: `Say each sound: ${said}.`, show: 'say', math: tex(said) },
    { caption: `Blend them together: ${w}! ${ss.length} sound${ss.length === 1 ? '' : 's'}, ${w.length} letters.`, show: 'blend', math: `${tex(w)}\\;(${ss.length}\\text{ sounds})` },
  ]
  return { kind: 'phonics', skin, word: w, sounds: ss, count: ss.length, stages, resultTex: `${tex(ss.map((s) => s.g).join('·'))}\\;(${ss.length}\\text{ sounds})` }
}

/** Letter by letter from what was written to the right word: same, swap, add, drop. */
export function alignLetters(attempt, word) {
  const a = attempt.toLowerCase()
  const b = word.toLowerCase()
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)))
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  const ops = []
  let i = a.length
  let j = b.length
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) {
      ops.unshift(a[i - 1] === b[j - 1] ? { op: 'same', b: b[j - 1] } : { op: 'swap', a: a[i - 1], b: b[j - 1] })
      i--
      j--
    } else if (j > 0 && d[i][j] === d[i][j - 1] + 1) {
      ops.unshift({ op: 'add', b: b[j - 1] })
      j--
    } else {
      ops.unshift({ op: 'drop', a: a[i - 1] })
      i--
    }
  }
  return { ops, distance: d[a.length][b.length] }
}

function buildSpelling({ word, attempt }, skin) {
  const w = String(word ?? '').toLowerCase()
  if (!/^[a-z]{2,20}$/.test(w)) return null
  const tried = attempt && /^[a-z]{1,24}$/i.test(attempt) ? attempt.toLowerCase() : null
  const parts = syllabify(w) ?? [w]
  if (tried && tried !== w) {
    const { ops, distance } = alignLetters(tried, w)
    if (distance > Math.max(3, Math.ceil(w.length / 2))) return null // another word, not a misspelling
    const said = ops
      .map((o) => (o.op === 'add' ? `add ${o.b}` : o.op === 'drop' ? `no ${o.a}` : o.op === 'swap' ? `${o.b}, not ${o.a}` : null))
      .filter(Boolean)
    const stages = [
      { caption: `You wrote "${tried}".`, show: 'attempt', math: tex(tried) },
      { caption: `The word is "${w}". Let's compare, letter by letter.`, show: 'compare', math: tex(w) },
      { caption: `${said.length === 1 ? 'One letter to fix' : `${said.length} letters to fix`}: ${said.join('; ')}.`, show: 'fix', math: tex(w) },
      { caption: parts.length > 1 ? `Say it in beats to remember it: ${parts.join(' – ')}.` : `Say it slowly, letter by letter: ${[...w].join('-')}.`, show: 'parts', math: tex(parts.join('·')) },
      { caption: `Now write it: ${[...w].join(' ')}.`, show: 'write', math: tex(w) },
    ]
    return { kind: 'spelling', skin, word: w, attempt: tried, ops, parts, stages, resultTex: tex(w) }
  }
  const stages = [
    { caption: `Let's spell "${w}".`, show: 'word', math: tex(w) },
    { caption: parts.length > 1 ? `Break it into beats: ${parts.join(' – ')}.` : `It's one beat: ${w}.`, show: 'parts', math: tex(parts.join('·')) },
    { caption: `Letter by letter: ${[...w].join(' ')}.`, show: 'write', math: tex(w) },
  ]
  return { kind: 'spelling', skin, word: w, attempt: tried, ops: [...w].map((b) => ({ op: 'same', b })), parts, stages, resultTex: tex(w) }
}

const IRREGULAR = {
  child: 'children', man: 'men', woman: 'women', mouse: 'mice', louse: 'lice', foot: 'feet', tooth: 'teeth', goose: 'geese', person: 'people',
  ox: 'oxen', die: 'dice', cactus: 'cacti', fungus: 'fungi', nucleus: 'nuclei', crisis: 'crises', analysis: 'analyses', phenomenon: 'phenomena',
}
const SAME = new Set(['sheep', 'fish', 'deer', 'moose', 'salmon', 'trout', 'aircraft', 'series', 'species', 'bison', 'swine'])
const F_S = new Set(['roof', 'chief', 'belief', 'chef', 'cliff', 'proof', 'reef', 'safe', 'giraffe', 'staff', 'sniff', 'cuff', 'puff'])
const O_ES = new Set(['potato', 'tomato', 'hero', 'echo', 'veto', 'torpedo', 'domino', 'mosquito'])

/** The plural and the rule that makes it. */
export function pluralOf(word) {
  const w = String(word).toLowerCase()
  if (!/^[a-z]{2,20}$/.test(w)) return null
  if (IRREGULAR[w]) return { plural: IRREGULAR[w], rule: 'irregular' }
  if (SAME.has(w)) return { plural: w, rule: 'same' }
  if (/(s|x|z|ch|sh)$/.test(w)) return { plural: `${w}es`, rule: 'es', add: 'es' }
  if (/[^aeiou]y$/.test(w)) return { plural: `${w.slice(0, -1)}ies`, rule: 'ies', drop: 'y', add: 'ies' }
  if (!F_S.has(w) && /(fe|[^f]f)$/.test(w)) return { plural: w.replace(/fe?$/, 'ves'), rule: 'ves', drop: w.endsWith('fe') ? 'fe' : 'f', add: 'ves' }
  if (O_ES.has(w)) return { plural: `${w}es`, rule: 'oes', add: 'es' }
  return { plural: `${w}s`, rule: 's', add: 's' }
}
const RULE_WORDS = {
  es: (w) => `"${w}" ends in ${w.match(/(ch|sh|s|x|z)$/)[0]}: after s, x, z, ch and sh we add -es (you can hear the extra beat).`,
  ies: (w) => `"${w}" ends in a consonant and y: change the y to i, then add -es.`,
  ves: (w) => `"${w}" ends in ${w.endsWith('fe') ? 'fe' : 'f'}: the f changes to v, then add -es.`,
  oes: (w) => `"${w}" is one of the words ending in o that take -es.`,
  s: (w) => `Most words just add -s, and "${w}" is one of them.`,
  irregular: (w) => `"${w}" is a special word: its plural doesn't follow the rule, you learn it by heart.`,
  same: (w) => `"${w}" stays the same: one ${w}, two ${w}.`,
}
const PICTURE = { fox: '🦊', cat: '🐱', dog: '🐶', baby: '👶', box: '📦', bus: '🚌', leaf: '🍃', knife: '🔪', wolf: '🐺', child: '🧒', mouse: '🐭', tooth: '🦷', foot: '🦶', sheep: '🐑', fish: '🐟', apple: '🍎', book: '📕', story: '📖', city: '🏙️', potato: '🥔', tomato: '🍅', piano: '🎹', church: '⛪', dish: '🍽️', glass: '🥛', watch: '⌚', lady: '👩', toy: '🧸', key: '🔑', day: '☀️', goose: '🪿', man: '👨', woman: '👩', star: '⭐', tree: '🌳', car: '🚗', bird: '🐦', horse: '🐴', cherry: '🍒', puppy: '🐶', berry: '🫐', hero: '🦸', shelf: '🗄️', half: '🌗', wife: '👰', calf: '🐮', person: '🧑', deer: '🦌', ox: '🐂', life: '🌱' }

function buildPlural({ word }, skin) {
  const p = pluralOf(word)
  if (!p) return null
  const w = word.toLowerCase()
  const stages = [
    { caption: `One ${w}, two …?`, show: 'one', math: tex(`one ${w}`) },
    { caption: RULE_WORDS[p.rule](w), show: 'rule', math: p.rule === 'irregular' || p.rule === 'same' ? tex(`${w} → ${p.plural}`) : tex(`${p.drop ? `${w.slice(0, -p.drop.length)}~~${p.drop}~~` : w} + ${p.add}`).replace(/~~([a-z]+)~~/, '') },
    { caption: `So it's "${p.plural}".`, show: 'build', math: tex(`${w} → ${p.plural}`) },
    { caption: `One ${w}, two ${p.plural}!`, show: 'two', math: tex(`two ${p.plural}`) },
  ]
  return { kind: 'plural', skin, word: w, ...p, picture: PICTURE[w] ?? null, stages, resultTex: tex(p.plural) }
}

const QUESTION_START = /^(who|what|where|when|why|how|which|whose|is|are|am|was|were|do|does|did|can|could|will|would|shall|should|may|might|have|has|had)\b/i
const AN_EXCEPTIONS = /^(uni|use|usu|eu|one|once|ur)/i
const A_EXCEPTIONS = /^(hour|honest|honou?r|heir)/i

/** The sentence corrected, with each fix and why. */
export function fixSentence(text) {
  const original = String(text).replace(/\s+/g, ' ').trim()
  if (!/^[A-Za-z][A-Za-z ,'’;:!?.-]*$/.test(original)) return null
  const words = original.replace(/[.!?]+$/, '').split(' ').filter(Boolean)
  if (words.length < 3 || words.length > 30) return null
  const fixes = []
  const out = words.map((w) => ({ w, fixed: w, why: null }))
  // repeated word: "the the"
  for (let i = out.length - 1; i > 0; i--)
    if (out[i].w.toLowerCase().replace(/[,;:]$/, '') === out[i - 1].w.toLowerCase()) {
      fixes.push({ at: i, what: `"${out[i].w}" is written twice` })
      out.splice(i, 1)
    }
  out.forEach((x, i) => {
    if (x.w === 'i' || x.w.startsWith("i'")) {
      x.fixed = `I${x.w.slice(1)}`
      x.why = '"I" is always a capital letter'
    }
    const next = out[i + 1]?.w ?? ''
    if (/^a$/i.test(x.w) && /^[aeiou]/i.test(next) && !AN_EXCEPTIONS.test(next)) {
      x.fixed = x.w[0] === 'A' ? 'An' : 'an'
      x.why = `"${next}" starts with a vowel sound, so "a" becomes "an"`
    } else if (/^an$/i.test(x.w) && next && (!/^[aeiou]/i.test(next) || AN_EXCEPTIONS.test(next)) && !A_EXCEPTIONS.test(next)) {
      x.fixed = x.w[0] === 'A' ? 'A' : 'a'
      x.why = `"${next}" starts with a consonant sound, so "an" becomes "a"`
    }
  })
  if (out[0] && out[0].fixed[0] !== out[0].fixed[0].toUpperCase()) {
    out[0].fixed = out[0].fixed[0].toUpperCase() + out[0].fixed.slice(1)
    out[0].why = 'a sentence starts with a capital letter'
  }
  const ending = original.match(/[.!?]+$/)?.[0] ?? ''
  const question = QUESTION_START.test(words[0])
  const end = question ? '?' : ending === '!' ? '!' : '.'
  const endWhy = ending === end ? null : question ? 'it asks something, so it ends with a question mark' : ending ? `it tells something, so it ends with "${end}", not "${ending}"` : 'a sentence ends with a full stop'
  for (const x of out) if (x.why) fixes.push({ word: x.w, fixed: x.fixed, what: x.why })
  if (endWhy) fixes.push({ end, what: endWhy })
  const corrected = `${out.map((x) => x.fixed).join(' ')}${end}`
  return { original, corrected, words: out, end, ending, fixes }
}

function buildSentence({ sentence }, skin) {
  const f = fixSentence(sentence)
  if (!f) return null
  const stages = [{ caption: `Let's check the sentence: "${f.original}"`, show: 'original', math: tex(f.original) }]
  if (!f.fixes.length) stages.push({ caption: 'It starts with a capital letter and ends with the right mark: it is correct!', show: 'done', math: tex(f.corrected) })
  for (const x of f.fixes.slice(0, 5)) stages.push({ caption: x.end ? `At the end: ${x.what}.` : x.fixed ? `${x.word} → ${x.fixed}: ${x.what}.` : `${x.what[0].toUpperCase()}${x.what.slice(1)}.`, show: 'fix', math: tex(x.fixed ?? (x.end ? `… ${x.end}` : '')) })
  if (f.fixes.length) stages.push({ caption: `Now it reads: "${f.corrected}"`, show: 'done', math: tex(f.corrected) })
  return { kind: 'sentence', skin, ...f, stages, resultTex: tex(f.corrected) }
}

// ======================================================================== SCIENCE

// Units: a factor to the base unit of each quantity
const UNITS = {
  length: { mm: 0.001, cm: 0.01, dm: 0.1, m: 1, km: 1000 },
  mass: { mg: 0.001, g: 1, kg: 1000, t: 1e6 },
  capacity: { ml: 0.001, cl: 0.01, dl: 0.1, l: 1 },
  time: { s: 1, min: 60, h: 3600, day: 86400 },
}
const UNIT_WORDS = [
  [/^(millimet(?:re|er)s?|mm)$/i, 'mm'], [/^(centimet(?:re|er)s?|cm)$/i, 'cm'], [/^(decimet(?:re|er)s?|dm)$/i, 'dm'], [/^(met(?:re|er)s?|m)$/i, 'm'], [/^(kilomet(?:re|er)s?|km)$/i, 'km'],
  [/^(milligrams?|mg)$/i, 'mg'], [/^(grams?|grammes?|g)$/i, 'g'], [/^(kilograms?|kilos?|kg)$/i, 'kg'], [/^(tonnes?|tons?|t)$/i, 't'],
  [/^(millilit(?:re|er)s?|ml)$/i, 'ml'], [/^(centilit(?:re|er)s?|cl)$/i, 'cl'], [/^(decilit(?:re|er)s?|dl)$/i, 'dl'], [/^(lit(?:re|er)s?|l)$/i, 'l'],
  [/^(seconds?|secs?|s)$/i, 's'], [/^(minutes?|mins?|min)$/i, 'min'], [/^(hours?|hrs?|h)$/i, 'h'], [/^(days?)$/i, 'day'],
]
const unitOf = (u) => UNIT_WORDS.find(([re]) => re.test(String(u).trim()))?.[1] ?? null
const quantityOf = (u) => Object.keys(UNITS).find((q) => u in UNITS[q])
const UNIT_TEX = { ml: 'mL', cl: 'cL', dl: 'dL', l: 'L' }
const unitTex = (u) => `\\text{ ${UNIT_TEX[u] ?? u}}`
const unitName = (u) => UNIT_TEX[u] ?? u

function buildUnits({ value, from, to }, skin) {
  const q = quantityOf(from)
  if (value === null || !q || q !== quantityOf(to) || from === to || Math.abs(value) > 1e9) return null
  const factor = UNITS[q][from] / UNITS[q][to]
  const result = round(value * factor, 9)
  const ladder = Object.keys(UNITS[q]).sort((a, b) => UNITS[q][b] - UNITS[q][a])
  const bigger = UNITS[q][from] > UNITS[q][to]
  const op = factor >= 1 ? `\\times ${fmt(factor)}` : `\\div ${fmt(1 / factor)}`
  const why = q === 'time' ? `${unitName(bigger ? from : to)} is ${fmt(bigger ? factor : 1 / factor)} ${unitName(bigger ? to : from)}` : `1 ${unitName(bigger ? from : to)} = ${fmt(bigger ? factor : 1 / factor)} ${unitName(bigger ? to : from)}`
  const stages = [
    { caption: `${fmt(value)} ${unitName(from)} into ${unitName(to)}: ${bigger ? 'to a smaller unit, so there will be more of them' : 'to a bigger unit, so there will be fewer of them'}.`, show: 'ladder', math: `${fmt(value)}${unitTex(from)} = \\;?${unitTex(to)}` },
    { caption: `${why}, so we ${factor >= 1 ? 'multiply' : 'divide'} by ${fmt(factor >= 1 ? factor : 1 / factor)}.`, show: 'steps', math: `${fmt(value)} ${op}` },
    { caption: `${fmt(value)} ${unitName(from)} = ${fmt(result)} ${unitName(to)}.`, show: 'result', math: `${fmt(value)}${unitTex(from)} = ${fmt(result)}${unitTex(to)}` },
  ]
  return { kind: 'units', skin, quantity: q, value, from, to, factor, result, ladder, stages, resultTex: `${fmt(result)}${unitTex(to)}` }
}

// Speed, distance, time
const DIST = { km: 1000, m: 1, mile: 1609.344, miles: 1609.344 }
const TIME = { h: 3600, hour: 3600, hours: 3600, hr: 3600, hrs: 3600, min: 60, mins: 60, minute: 60, minutes: 60, s: 1, sec: 1, secs: 1, second: 1, seconds: 1 }
function buildSpeed({ d, dUnit, t, tUnit, v, vUnit, unknown }, skin) {
  const known = [d, t, v].filter((x) => x !== null && x !== undefined).length
  if (known !== 2) return null
  if ([d, t, v].some((x) => x !== null && x !== undefined && !(x > 0))) return null
  // work in the units of the exercise: km and h -> km/h; m and s -> m/s
  const outUnit = vUnit ?? (dUnit === 'm' && (tUnit === 's' || TIME[tUnit] === 1) ? 'm/s' : dUnit === 'm' ? 'm/min' : 'km/h')
  const [vd, vt] = outUnit === 'm/s' ? ['m', 's'] : outUnit === 'm/min' ? ['m', 'min'] : outUnit === 'mph' ? ['mile', 'h'] : ['km', 'h']
  const toD = (x, u) => (x * DIST[u ?? vd]) / DIST[vd]
  const toT = (x, u) => (x * TIME[u ?? vt]) / TIME[vt]
  const D = d !== null && d !== undefined ? toD(d, dUnit) : null
  const T = t !== null && t !== undefined ? toT(t, tUnit) : null
  const want = unknown ?? (v === null || v === undefined ? 'v' : t === null || t === undefined ? 't' : 'd')
  let res
  let math
  const V = v ?? null
  if (want === 'v') {
    res = round(D / T, 4)
    math = `\\text{speed} = \\frac{\\text{distance}}{\\text{time}} = \\frac{${fmt(D)}}{${fmt(T)}} = ${fmt(res)}\\text{ ${outUnit}}`
  } else if (want === 't') {
    res = round(D / V, 4)
    math = `\\text{time} = \\frac{\\text{distance}}{\\text{speed}} = \\frac{${fmt(D)}}{${fmt(V)}} = ${fmt(res)}\\text{ ${vt}}`
  } else {
    res = round(V * T, 4)
    math = `\\text{distance} = \\text{speed} \\times \\text{time} = ${fmt(V)} \\times ${fmt(T)} = ${fmt(res)}\\text{ ${vd}}`
  }
  if (!Number.isFinite(res)) return null
  const unit = want === 'v' ? outUnit : want === 't' ? vt : vd
  const minutes = want === 't' && vt === 'h' && !Number.isInteger(res) ? ` (${fmt(Math.floor(res))} h ${fmt(round((res % 1) * 60, 1))} min)` : ''
  const stages = [
    { caption: 'Speed, distance and time are linked: distance = speed × time.', show: 'triangle', math: '\\text{distance} = \\text{speed} \\times \\text{time}' },
    { caption: `We know ${[D !== null ? `the distance, ${fmt(D)} ${vd}` : null, T !== null ? `the time, ${fmt(T)} ${vt}` : null, V !== null ? `the speed, ${fmt(V)} ${outUnit}` : null].filter(Boolean).join(', and ')}.`, show: 'known', math: [D !== null ? `d = ${fmt(D)}\\text{ ${vd}}` : null, T !== null ? `t = ${fmt(T)}\\text{ ${vt}}` : null, V !== null ? `v = ${fmt(V)}\\text{ ${outUnit}}` : null].filter(Boolean).join(',\\; ') },
    { caption: want === 'v' ? 'Cover "speed" on the triangle: distance ÷ time.' : want === 't' ? 'Cover "time": distance ÷ speed.' : 'Cover "distance": speed × time.', show: 'formula', math },
    { caption: `So the ${want === 'v' ? 'speed' : want === 't' ? 'time' : 'distance'} is ${fmt(res)} ${unit}${minutes}.`, show: 'drive', math: `${want} = ${fmt(res)}\\text{ ${unit}}` },
  ]
  return { kind: 'speed', skin, d: D ?? (want === 'd' ? res : null), t: T ?? (want === 't' ? res : null), v: V ?? (want === 'v' ? res : null), dUnit: vd, tUnit: vt, vUnit: outUnit, unknown: want, result: res, stages, resultTex: `${fmt(res)}\\text{ ${unit}}` }
}

// Density: grams per cubic centimetre, compared with water
const MASS_G = { mg: 0.001, g: 1, kg: 1000 }
const VOL_CM3 = { cm3: 1, ml: 1, l: 1000, m3: 1e6, dm3: 1000 }
function buildDensity({ m, mUnit, V, vUnit, liquid = 'water' }, skin) {
  if (!(m > 0) || !(V > 0) || !(mUnit in MASS_G) || !(vUnit in VOL_CM3)) return null
  const g = m * MASS_G[mUnit]
  const cm3 = V * VOL_CM3[vUnit]
  const rho = round(g / cm3, 4)
  const water = liquid === 'oil' ? 0.92 : liquid === 'sea water' ? 1.03 : 1
  const verdict = Math.abs(rho - water) < 1e-9 ? 'neither' : rho < water ? 'floats' : 'sinks'
  const stages = [
    { caption: 'Density tells how heavy something is for its size: mass ÷ volume.', show: 'formula', math: '\\rho = \\frac{m}{V}' },
    { caption: `${fmt(g)} g in ${fmt(cm3)} cm³: ${fmt(g)} ÷ ${fmt(cm3)} = ${fmt(rho)} g per cm³.`, show: 'compute', math: `\\rho = \\frac{${fmt(g)}\\text{ g}}{${fmt(cm3)}\\text{ cm}^3} = ${fmt(rho)}\\text{ g/cm}^3` },
    { caption: `${liquid[0].toUpperCase()}${liquid.slice(1)} is ${fmt(water)} g per cm³.`, show: 'compare', math: `${fmt(rho)} ${verdict === 'floats' ? '<' : verdict === 'sinks' ? '>' : '='} ${fmt(water)}` },
    { caption: verdict === 'floats' ? `It is lighter than the same amount of ${liquid}: it floats!` : verdict === 'sinks' ? `It is heavier than the same amount of ${liquid}: it sinks.` : `Exactly as dense as ${liquid}: it neither floats up nor sinks.`, show: 'tank', math: `\\text{it ${verdict === 'neither' ? 'stays where it is' : verdict}}` },
  ]
  return { kind: 'density', skin, mass: g, volume: cm3, rho, liquid, liquidRho: water, verdict, stages, resultTex: `${fmt(rho)}\\text{ g/cm}^3\\text{, it ${verdict === 'neither' ? 'stays put' : verdict}}` }
}

// Circuits: V = I × R, resistors in series or in parallel
function buildCircuit({ V, I, resistors = [], arrangement = 'single' }, skin) {
  const R = resistors.length ? (arrangement === 'parallel' ? 1 / resistors.reduce((t, r) => t + 1 / r, 0) : resistors.reduce((t, r) => t + r, 0)) : null
  const known = [V, I, R].filter((x) => x !== null && x !== undefined).length
  if (known !== 2 || [V, I, R].some((x) => x !== null && x !== undefined && !(x > 0)) || resistors.length > 6) return null
  const want = V === null || V === undefined ? 'V' : I === null || I === undefined ? 'I' : 'R'
  const res = round(want === 'V' ? I * R : want === 'I' ? V / R : V / I, 4)
  const rWord = resistors.length > 1 ? (arrangement === 'parallel' ? `In parallel: 1/R = ${resistors.map((r) => `1/${fmt(r)}`).join(' + ')}, so R = ${fmt(round(R, 4))} Ω.` : `In series the resistances add up: ${resistors.map(fmt).join(' + ')} = ${fmt(R)} Ω.`) : null
  const stages = [
    { caption: 'In a circuit, the voltage pushes the current through the resistance: V = I × R.', show: 'circuit', math: 'V = I \\times R' },
    ...(rWord ? [{ caption: rWord, show: 'resistors', math: arrangement === 'parallel' ? `\\frac{1}{R} = ${resistors.map((r) => `\\frac{1}{${fmt(r)}}`).join(' + ')}` : `R = ${resistors.map(fmt).join(' + ')} = ${fmt(R)}\\,\\Omega` }] : []),
    { caption: want === 'I' ? 'We want the current: I = V ÷ R.' : want === 'V' ? 'We want the voltage: V = I × R.' : 'We want the resistance: R = V ÷ I.', show: 'formula', math: want === 'I' ? `I = \\frac{${fmt(V)}}{${fmt(round(R, 4))}}` : want === 'V' ? `V = ${fmt(I)} \\times ${fmt(round(R, 4))}` : `R = \\frac{${fmt(V)}}{${fmt(I)}}` },
    { caption: `${want === 'I' ? 'The current is' : want === 'V' ? 'The voltage is' : 'The resistance is'} ${fmt(res)} ${want === 'I' ? 'amps' : want === 'V' ? 'volts' : 'ohms'}.`, show: 'flow', math: `${want} = ${fmt(res)}\\,${want === 'I' ? '\\text{A}' : want === 'V' ? '\\text{V}' : '\\Omega'}` },
  ]
  return { kind: 'circuit', skin, V: want === 'V' ? res : V, I: want === 'I' ? res : I, R: want === 'R' ? res : round(R, 4), resistors, arrangement, unknown: want, stages, resultTex: `${want} = ${fmt(res)}\\,${want === 'I' ? '\\text{A}' : want === 'V' ? '\\text{V}' : '\\Omega'}` }
}

// States of matter: melting and boiling points (°C, at normal pressure)
const SUBSTANCES = {
  water: { melt: 0, boil: 100, names: { solid: 'ice', liquid: 'water', gas: 'steam' } },
  ice: { alias: 'water' }, steam: { alias: 'water' },
  iron: { melt: 1538, boil: 2862 }, gold: { melt: 1064, boil: 2856 }, copper: { melt: 1085, boil: 2562 }, aluminium: { melt: 660, boil: 2470 }, aluminum: { alias: 'aluminium' },
  lead: { melt: 327, boil: 1749 }, mercury: { melt: -39, boil: 357 }, salt: { melt: 801, boil: 1465 },
  ethanol: { melt: -114, boil: 78 }, alcohol: { alias: 'ethanol' }, oxygen: { melt: -218, boil: -183 }, nitrogen: { melt: -210, boil: -196 },
  'carbon dioxide': { melt: -78, boil: -78, sublimes: true }, chocolate: { melt: 34, boil: null }, butter: { melt: 35, boil: null }, wax: { melt: 60, boil: 370 },
}
function buildStates({ substance, T }, skin) {
  let name = String(substance).toLowerCase()
  let s = SUBSTANCES[name]
  if (s?.alias) s = SUBSTANCES[(name = s.alias)]
  if (!s || T === null || !Number.isFinite(T) || T < -273.15 || T > 10000) return null
  const state = s.sublimes ? (T < s.melt ? 'solid' : 'gas') : T < s.melt ? 'solid' : T === s.melt ? 'melting' : s.boil === null || T < s.boil ? 'liquid' : T === s.boil ? 'boiling' : 'gas'
  const named = (st) => s.names?.[st] ?? `${name}, a ${st}`
  const word = state === 'melting' ? `melting: solid and liquid together` : state === 'boiling' ? 'boiling: liquid turning into gas' : `a ${state}`
  const facts = s.sublimes ? `${name} turns straight from solid to gas at ${fmt(s.melt)} °C` : `${name} melts at ${fmt(s.melt)} °C${s.boil !== null ? ` and boils at ${fmt(s.boil)} °C` : ''}`
  const stages = [
    { caption: `${facts[0].toUpperCase()}${facts.slice(1)}.`, show: 'thermometer', math: s.sublimes ? `${fmt(s.melt)}\\,^{\\circ}\\text{C}` : `\\text{melts at } ${fmt(s.melt)}\\,^{\\circ}\\text{C}${s.boil !== null ? `,\\; \\text{boils at } ${fmt(s.boil)}\\,^{\\circ}\\text{C}` : ''}` },
    { caption: `At ${fmt(T)} °C, ${T < s.melt ? `it is colder than ${fmt(s.melt)} °C` : s.boil !== null && T > s.boil ? `it is hotter than ${fmt(s.boil)} °C` : state === 'liquid' ? 'it is between the two' : 'it is right at the change'}.`, show: 'temperature', math: `${fmt(T)}\\,^{\\circ}\\text{C}` },
    { caption: `So it is ${word}${['solid', 'liquid', 'gas'].includes(state) && s.names ? ` (${named(state)})` : ''}. ${state === 'solid' ? 'The particles are packed tight and only wiggle.' : state === 'liquid' ? 'The particles touch but slide past each other.' : state === 'gas' ? 'The particles fly apart, fast.' : 'The particles are breaking free.'}`, show: 'particles', math: tex(state) },
  ]
  return { kind: 'states', skin, substance: name, T, melt: s.melt, boil: s.boil, state, names: s.names ?? null, stages, resultTex: tex(state === 'gas' && s.names ? `gas (${s.names.gas})` : state === 'solid' && s.names ? `solid (${s.names.solid})` : state) }
}

// Food chains: who eats whom, from the producer (a plant) to the top
const PRODUCERS = /^(the\s+)?(sun|grass|plants?|trees?|leaf|leaves|seeds?|algae|phytoplankton|flowers?|corn|wheat|berries|fruits?|lettuce|carrots?|kelp|seaweed|nectar|acorns?|cabbages?|clover|oak|nuts?)$/i
const ANIMAL = { grass: '🌿', plant: '🌱', plants: '🌱', leaves: '🍃', leaf: '🍃', seeds: '🌾', algae: '🟢', rabbit: '🐇', fox: '🦊', mouse: '🐭', owl: '🦉', snake: '🐍', hawk: '🦅', eagle: '🦅', caterpillar: '🐛', bird: '🐦', frog: '🐸', fly: '🪰', insect: '🐞', deer: '🦌', wolf: '🐺', lion: '🦁', zebra: '🦓', fish: '🐟', shark: '🦈', seal: '🦭', bear: '🐻', squirrel: '🐿️', acorns: '🌰', nuts: '🌰', cow: '🐄', human: '🧑', sun: '☀️', snail: '🐌', hedgehog: '🦔', worm: '🪱', beetle: '🪲', spider: '🕷️', berries: '🫐', carrot: '🥕', lettuce: '🥬', corn: '🌽', tree: '🌳', flower: '🌸', flowers: '🌸', krill: '🦐', whale: '🐋', penguin: '🐧', grasshopper: '🦗', lizard: '🦎', cat: '🐱', bee: '🐝', nectar: '🌼', kelp: '🌿', seaweed: '🌿', 'sea urchin': '🦔', 'sea otter': '🦦' }
function buildFoodChain({ chain }, skin) {
  const names = chain.map((c) => c.toLowerCase().replace(/^(the|a|an)\s+/, '').trim()).filter(Boolean)
  if (names.length < 2 || names.length > 7 || names.some((n) => !/^[a-z][a-z ]{2,24}$/.test(n))) return null
  const hasSun = names[0] === 'sun'
  const living = hasSun ? names.slice(1) : names
  const role = (i) => {
    if (i === 0 && PRODUCERS.test(living[0])) return 'producer'
    const k = PRODUCERS.test(living[0]) ? i : i + 1
    if (i === living.length - 1 && living.length > 2) return 'top predator'
    return k === 1 ? 'primary consumer' : k === 2 ? 'secondary consumer' : k === 3 ? 'tertiary consumer' : 'consumer'
  }
  const items = [...(hasSun ? [{ name: 'sun', role: 'energy source', emoji: '☀️' }] : []), ...living.map((n, i) => ({ name: n, role: role(i), emoji: ANIMAL[n] ?? ANIMAL[n.replace(/s$/, '')] ?? null }))]
  const stages = [
    { caption: 'A food chain shows who eats whom. The arrow points the way the energy goes: from the food to the eater.', show: 'start', math: tex(items.map((x) => x.name).join(' → ')) },
    ...items.slice(0, -1).map((x, i) => ({ caption: x.role === 'energy source' ? `The sun gives its energy to the ${items[i + 1].name}.` : `The ${items[i + 1].name} eats the ${x.name}: the energy goes from the ${x.name} to the ${items[i + 1].name}.`, show: `link${i}`, math: tex(`${x.name} → ${items[i + 1].name}`) })),
    { caption: `${items.filter((x) => x.role !== 'energy source').map((x) => `The ${x.name} is ${/^[aeiou]/.test(x.role) ? 'an' : 'a'} ${x.role}`).join('. ')}.`, show: 'roles', math: tex(items.map((x) => x.name).join(' → ')) },
  ]
  return { kind: 'food_chain', skin, items, stages, resultTex: items.map((x) => tex(x.name)).join(' \\to ') }
}

// ======================================================================== reading the exercise

const WORD = String.raw`["“']?([A-Za-z]{2,24})["”']?`
/** The rule for a Reading or Science exercise in the text, or null. { kind, ...what the builder needs }. */
export function detectDomain(text) {
  const t = clean(text)
  if (!t || t.length > 400) return null
  let m
  // ---- reading
  if ((m = new RegExp(String.raw`(?:syllables?|clap|beats?)\b.*?(?:in|of|for|:)?\s+${WORD}\s*\??\s*$`, 'i').exec(t)) && /syllable|clap|beat/i.test(t)) return { kind: 'syllables', word: m[1] }
  if ((m = new RegExp(String.raw`^(?:split|break|divide|clap)\s+(?:the\s+word\s+)?${WORD}\s+(?:into|in)\s+(?:syllables|beats)`, 'i').exec(t))) return { kind: 'syllables', word: m[1] }
  if ((m = new RegExp(String.raw`(?:sounds?|phonemes?|phonics|sound\s+out|sound\s+buttons)\b(?:.*?\b(?:in|of|for)\b|\s*:)?\s*(?:the\s+word\s+)?${WORD}\s*\??\s*$`, 'i').exec(t)) && /sound|phonem|phonics/i.test(t)) return { kind: 'phonics', word: m[1] }
  if ((m = new RegExp(String.raw`(?:plural\s+(?:of|for)|make\s+plural:?|plural:)\s*(?:the\s+word\s+)?(?:a\s+|an\s+|one\s+)?${WORD}`, 'i').exec(t))) return { kind: 'plural', word: m[1] }
  if ((m = new RegExp(String.raw`^${WORD}\s*(?:->|→|=>)\s*plural\b`, 'i').exec(t))) return { kind: 'plural', word: m[1] }
  if ((m = new RegExp(String.raw`^(?:make|write|put)\s+(?:the\s+word\s+)?${WORD}\s+(?:in(?:to)?\s+the\s+)?plural\b`, 'i').exec(t))) return { kind: 'plural', word: m[1] }
  if ((m = /^one\s+([a-z]{2,20}),?\s+(?:two|three|four|five|many|some|lots of)\s+(?:\.\.\.|…|_+|\?+)\s*$/i.exec(t))) return { kind: 'plural', word: m[1] }
  if ((m = new RegExp(String.raw`^${WORD}\s*(?:->|→|=>|should\s+be|is\s+spelt|is\s+spelled)\s*${WORD}\s*\.?$`, 'i').exec(t)) && !/plural/i.test(t)) return { kind: 'spelling', attempt: m[1], word: m[2] }
  if ((m = new RegExp(String.raw`^(?:spell|how\s+do\s+you\s+spell|spelling(?:\s+of)?:?)\s+(?:the\s+word\s+)?${WORD}\s*\??$`, 'i').exec(t))) return { kind: 'spelling', word: m[1] }
  if ((m = /^(?:punctuate|correct|fix|check|capitali[sz]e|rewrite|add\s+(?:the\s+)?(?:capital\s+letters?|punctuation|full\s+stops?)(?:\s+and\s+(?:capital\s+letters?|punctuation|full\s+stops?|question\s+marks?))?)(?:\s+(?:the|this)\s+sentence)?(?:\s+correctly)?\s*:\s*(.+)$/i.exec(t))) return { kind: 'sentence', sentence: m[1] }
  // ---- science
  const U = String.raw`([A-Za-zµ]+)`
  if ((m = new RegExp(String.raw`(?:convert\s+)?${NUM}\s*${U}\s+(?:to|in|into|=\s*\?)\s*${U}\s*\??$`, 'i').exec(t)) || (m = new RegExp(String.raw`^${NUM}\s*${U}\s*=\s*(?:\?|_+|…)\s*${U}$`, 'i').exec(t))) {
    const [from, to] = [unitOf(m[2]), unitOf(m[3])]
    if (from && to && quantityOf(from) === quantityOf(to)) return { kind: 'units', value: num(m[1]), from, to }
  }
  if ((m = new RegExp(String.raw`how\s+many\s+${U}\s+(?:are\s+)?in\s+${NUM}\s*${U}`, 'i').exec(t))) {
    const [to, from] = [unitOf(m[1]), unitOf(m[3])]
    if (from && to && quantityOf(from) === quantityOf(to)) return { kind: 'units', value: num(m[2]), from, to }
  }
  if (/speed|how\s+fast|how\s+long|how\s+far|km\/h|m\/s|mph|\bkph\b/i.test(t)) {
    const d = new RegExp(String.raw`${NUM}\s*(km|kilomet(?:re|er)s?|m|met(?:re|er)s?|miles?)\b(?!\s*/)`, 'i').exec(t)
    const tm = new RegExp(String.raw`${NUM}\s*(h|hours?|hrs?|min|mins|minutes?|s|secs?|seconds?)\b`, 'i').exec(t)
    const v = new RegExp(String.raw`${NUM}\s*(km\/h|kph|m\/s|mph|km per hour|metres per second|meters per second|miles per hour)`, 'i').exec(t)
    const dU = d && (/^k/i.test(d[2]) ? 'km' : /^mile/i.test(d[2]) ? 'mile' : 'm')
    const tU = tm && (/^h/i.test(tm[2]) ? 'h' : /^min/i.test(tm[2]) ? 'min' : 's')
    const vU = v && (/km/i.test(v[2]) || /kph/i.test(v[2]) ? 'km/h' : /mph|miles/i.test(v[2]) ? 'mph' : 'm/s')
    const unknown = /what\s+is\s+(?:its|the|his|her)?\s*speed|how\s+fast|average\s+speed|speed\s*\?/i.test(t) ? 'v' : /how\s+long|how\s+much\s+time|time\s*\?/i.test(t) ? 't' : /how\s+far|distance\s*\?/i.test(t) ? 'd' : undefined
    const given = { d: d ? num(d[1]) : null, dUnit: dU, t: tm ? num(tm[1]) : null, tUnit: tU, v: v ? num(v[1]) : null, vUnit: vU }
    const count = [given.d, given.t, given.v].filter((x) => x !== null).length
    if (count === 2 && (!unknown || given[unknown] === null)) return { kind: 'speed', ...given, unknown }
  }
  if (/densit|float|sink/i.test(t)) {
    const mm = new RegExp(String.raw`${NUM}\s*(mg|g|grams?|kg|kilograms?)\b`, 'i').exec(t)
    const vv = new RegExp(String.raw`${NUM}\s*(cm\^?3|cm³|cubic\s+cent\w+|ml|millilit\w+|l|lit(?:re|er)s?|m\^?3|m³|dm\^?3|dm³)`, 'i').exec(t)
    if (mm && vv) {
      const mU = /^mg/i.test(mm[2]) ? 'mg' : /^k/i.test(mm[2]) ? 'kg' : 'g'
      const vu = vv[2].toLowerCase()
      const vU = /^cm|cubic/.test(vu) ? 'cm3' : /^ml|milli/.test(vu) ? 'ml' : /^dm/.test(vu) ? 'dm3' : /^m/.test(vu) ? 'm3' : 'l'
      return { kind: 'density', m: num(mm[1]), mUnit: mU, V: num(vv[1]), vUnit: vU, liquid: /\boil\b/i.test(t) ? 'oil' : /sea\s*water|salt\s*water/i.test(t) ? 'sea water' : 'water' }
    }
  }
  if (/volt|ohm|Ω|amp|current|resist|circuit|\bV\b|\bA\b/.test(t) && /\d/.test(t)) {
    const V = new RegExp(String.raw`${NUM}\s*(?:V|volts?)\b`).exec(t)
    const I = new RegExp(String.raw`${NUM}\s*(?:A|amps?|amperes?|mA)\b`).exec(t)
    // "two 6 ohm resistors" is two of them
    const COUNT = { two: 2, three: 3, four: 4, five: 5, six: 6 }
    const rs = [...t.matchAll(new RegExp(String.raw`(?:\b(two|three|four|five|six|[2-6])\s+(?:identical\s+|equal\s+)?)?${NUM}\s*(?:Ω|ohms?|Ohms?)`, 'gi'))].flatMap((x) => Array(x[1] ? (COUNT[x[1].toLowerCase()] ?? Number(x[1])) : 1).fill(num(x[2])))
    const arrangement = rs.length > 1 ? (/parallel/i.test(t) ? 'parallel' : 'series') : 'single'
    const I0 = I ? num(I[1]) * (/mA/.test(I[0]) ? 0.001 : 1) : null
    const known = [V, I, rs.length ? 1 : null].filter(Boolean).length
    if (known === 2) return { kind: 'circuit', V: V ? num(V[1]) : null, I: I0, resistors: rs, arrangement }
  }
  if ((m = new RegExp(String.raw`\b(water|ice|steam|iron|gold|copper|alumin(?:i)?um|lead|mercury|salt|ethanol|alcohol|oxygen|nitrogen|carbon dioxide|chocolate|butter|wax)\b.*?(?:at|is|heated to|cooled to|=)\s*${NUM}\s*°?\s*C\b`, 'i').exec(t)) || (m = new RegExp(String.raw`${NUM}\s*°?\s*C\b.*?\b(water|ice|steam|iron|gold|copper|alumin(?:i)?um|lead|mercury|salt|ethanol|alcohol|oxygen|nitrogen|carbon dioxide|chocolate|butter|wax)\b`, 'i').exec(t))) {
    const [subst, T] = /^-?\d/.test(m[1]) ? [m[2], m[1]] : [m[1], m[2]]
    return { kind: 'states', substance: subst.toLowerCase().replace('aluminum', 'aluminium'), T: num(T) }
  }
  if (/(?:->|→)/.test(t) && !/\d/.test(t)) {
    const chain = t.replace(/^.*?food\s*chain\s*:?\s*/i, '').split(/\s*(?:->|→)\s*/).map((x) => x.trim().replace(/[.?!]$/, ''))
    if (chain.length >= 2 && chain.every((x) => /^[A-Za-z][A-Za-z ]{2,24}$/.test(x.replace(/^(the|a|an)\s+/i, '')))) return { kind: 'food_chain', chain }
  }
  if ((m = /(?:food\s*chain\s+(?:with|from|using)|producer\s*(?:in|of)?\s*:?|order\s+(?:these|this)?\s*(?:in\s+a\s+food\s+chain)?\s*:)\s*([a-z][a-z ,]+?)\s*[?.]?\s*$/i.exec(t)) && m[1].includes(',')) {
    let chain = m[1].split(/\s*,\s*(?:and\s+)?|\s+and\s+/).map((x) => x.trim()).filter(Boolean)
    if (chain.length >= 2 && PRODUCERS.test(chain[chain.length - 1]) && !PRODUCERS.test(chain[0])) chain = chain.reverse()
    if (chain.length >= 2) return { kind: 'food_chain', chain }
  }
  if (/\beats?\b/i.test(t)) {
    const name = (x) => x.trim().toLowerCase().replace(/^(?:(?:and|then|but|so|while)\s+)?(?:(?:the|a|an|some)\s+)?/, '').trim()
    const pairs = [...t.matchAll(/([a-z][a-z ]{1,30}?)\s+eats?\s+([a-z][a-z ]{1,30}?)(?=[,.;]|\s+and\b|\s+but\b|$)/gi)].map((x) => [name(x[2]), name(x[1])])
    if (pairs.length) {
      // order the chain: start from the one nobody eats... the food nobody else is (the producer)
      const eaten = new Set(pairs.map((p) => p[0]))
      const eaters = new Set(pairs.map((p) => p[1]))
      let start = [...eaten].find((x) => !eaters.has(x))
      const chain = []
      const seen = new Set()
      while (start && !seen.has(start) && chain.length < 7) {
        seen.add(start)
        chain.push(start)
        start = pairs.find((p) => p[0] === start)?.[1]
      }
      if (chain.length >= 2) return { kind: 'food_chain', chain }
    }
  }
  return null
}

/** A word-only exercise ("elephant") when the decision model says which reading kind it is. */
export function wordRule(text, kind) {
  const w = clean(text).replace(/[.?!:]+$/, '')
  if (!WORD_KINDS.includes(kind) || !/^[A-Za-z]{2,24}$/.test(w)) return null
  // a word alone to spell: the right spelling comes from the tutor (sceneFor's `answer`), never
  // the word as written, which may be the misspelling
  return kind === 'spelling' ? { kind, attempt: w } : { kind, word: w }
}

/** Builds a Reading or Science scene from a rule (the shape detectDomain returns). */
export function buildDomain(rule, skin) {
  try {
    switch (rule?.kind) {
      case 'syllables': return buildSyllables(rule, skin)
      case 'phonics': return buildPhonics(rule, skin)
      case 'spelling': return buildSpelling(rule, skin)
      case 'plural': return buildPlural(rule, skin)
      case 'sentence': return buildSentence(rule, skin)
      case 'units': return buildUnits(rule, skin)
      case 'speed': return buildSpeed(rule, skin)
      case 'density': return buildDensity(rule, skin)
      case 'circuit': return buildCircuit(rule, skin)
      case 'states': return buildStates(rule, skin)
      case 'food_chain': return buildFoodChain(rule, skin)
      default: return null
    }
  } catch {
    return null
  }
}

// ======================================================================== practise again

// Words to practise the same thing on (review.js): same number of syllables, same sound, same plural rule
const PRACTICE_WORDS = [
  'cat', 'dog', 'ship', 'chip', 'shop', 'fish', 'moon', 'rain', 'boat', 'tree', 'night', 'light', 'cake', 'bike', 'home', 'cube', 'frog', 'duck', 'king', 'ring', 'queen', 'chair', 'teeth', 'thumb', 'phone', 'whale',
  'rabbit', 'basket', 'napkin', 'tiger', 'robot', 'pencil', 'kitten', 'monkey', 'garden', 'window', 'sister', 'table', 'little', 'bottle', 'candle', 'hamster', 'children', 'pocket', 'rocket', 'apple',
  'banana', 'tomato', 'potato', 'elephant', 'dinosaur', 'butterfly', 'computer', 'umbrella', 'kangaroo', 'animal', 'family', 'crocodile', 'strawberry', 'caterpillar', 'helicopter', 'watermelon', 'alligator',
  'fox', 'box', 'bus', 'dish', 'church', 'watch', 'glass', 'baby', 'story', 'city', 'lady', 'cherry', 'puppy', 'toy', 'key', 'day', 'leaf', 'knife', 'wolf', 'shelf', 'life', 'half', 'calf', 'hero', 'piano', 'zoo', 'radio', 'mouse', 'tooth', 'foot', 'child', 'goose', 'sheep', 'deer',
]

/** Another word to practise the same thing on (a different word, chosen by `rand`), or null. */
export function practiceWord(kind, word, rand) {
  const w = String(word).toLowerCase()
  const same = {
    syllables: (x) => syllabify(x)?.length === syllabify(w)?.length,
    phonics: (x) => {
      const a = new Set((sounds(w) ?? []).filter((s) => s.type !== 'single').map((s) => s.g))
      return a.size ? (sounds(x) ?? []).some((s) => a.has(s.g)) : sounds(x)?.length === sounds(w)?.length
    },
    plural: (x) => pluralOf(x)?.rule === pluralOf(w)?.rule,
    spelling: (x) => syllabify(x)?.length === syllabify(w)?.length && x.length >= 4,
  }[kind]
  if (!same) return null
  const pool = PRACTICE_WORDS.filter((x) => x !== w && same(x))
  return pool.length ? pool[Math.floor(rand() * pool.length)] : null
}
