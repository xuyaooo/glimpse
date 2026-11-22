// Turning a diagnosis into teaching (ported and extended from engine/.../explain.py).
//
// The scene is DATA (docs/protocol.md "Visual scenes"); the web app draws it. No model writes
// drawing code, and every number here is computed, not generated.
// Styles: pictures (compare_pies) -> bars (bar_model) -> steps (worked example). A style that
// didn't work for this child is skipped next time; one that worked is tried first.
import { F, fstr, flatex, lcm, less, sameValue, addExact, reduce, sumLatex, diagnose } from './maths.js'

const HINTS = {
  smaller: {
    fr: "Regarde : {ans}, c'est plus petit que {big}. Est-ce qu'on peut ajouter et obtenir moins ?",
    en: 'Look: {ans} is smaller than {big}. Can adding give you less?',
    de: 'Schau: {ans} ist kleiner als {big}. Kann Addieren etwas kleiner machen?',
    it: 'Guarda: {ans} è più piccolo di {big}. Sommando si può ottenere di meno?',
  },
  same_size: {
    fr: "Les morceaux ont-ils la même taille ? Transforme d'abord {part} en {scaled}.",
    en: 'Are the pieces the same size? Turn {part} into {scaled} first.',
    de: 'Sind die Stücke gleich gross? Mach zuerst aus {part} {scaled}.',
    it: 'I pezzi sono della stessa grandezza? Trasforma prima {part} in {scaled}.',
  },
  keep_bottom: {
    fr: 'Les morceaux ont déjà la même taille : additionne les nombres du haut et garde celui du bas, {d}.',
    en: 'The pieces are already the same size: add the tops and keep the bottom, {d}.',
    de: 'Die Stücke sind schon gleich gross: Zähl die oberen Zahlen zusammen und behalte die untere, {d}.',
    it: 'I pezzi sono già della stessa grandezza: somma i numeri sopra e tieni quello sotto, {d}.',
  },
  worked: {
    fr: "Regarde l'exemple résolu, puis essaie le tien de la même façon.",
    en: 'Look at the worked example, then try yours the same way.',
    de: 'Schau dir das gelöste Beispiel an und versuch deins genauso.',
    it: "Guarda l'esempio svolto, poi prova il tuo allo stesso modo.",
  },
  look_again: {
    fr: 'Regarde encore cette ligne.',
    en: 'Have another look at this line.',
    de: 'Schau dir diese Zeile noch einmal an.',
    it: 'Guarda ancora questa riga.',
  },
  right: {
    fr: 'Juste !',
    en: 'Right!',
    de: 'Richtig!',
    it: 'Giusto!',
  },
  right_unsimplified: {
    fr: 'Juste ! Et {ans}, ça peut aussi s’écrire {simple}.',
    en: 'Right! And {ans} can also be written {simple}.',
    de: 'Richtig! Und {ans} kann man auch {simple} schreiben.',
    it: 'Giusto! E {ans} si può scrivere anche {simple}.',
  },
  clicked: {
    fr: 'Bravo ! Avec {style}, ça a marché.',
    en: 'Well done! {style} did it.',
    de: 'Super! Mit {style} hat es geklappt.',
    it: 'Bravo! Con {style} ha funzionato.',
  },
  streak: {
    fr: 'Deux de suite ! On passe à un peu plus difficile.',
    en: 'Two in a row! Let’s try something a little harder.',
    de: 'Zwei hintereinander! Jetzt etwas Schwierigeres.',
    it: 'Due di fila! Proviamo qualcosa di un po’ più difficile.',
  },
  no_new_line: {
    fr: "Je ne vois pas de nouvelle ligne. Écris-la, puis lève ton crayon.",
    en: "I can't see a new line yet. Write it, then lift your pencil.",
    de: 'Ich sehe noch keine neue Zeile. Schreib sie und heb dann den Stift.',
    it: 'Non vedo ancora una nuova riga. Scrivila, poi alza la matita.',
  },
  not_maths: {
    fr: 'Je lis : {text}. Ce n’est pas un calcul que je sais vérifier.',
    en: "I read: {text}. That's not a sum I can check yet.",
    de: 'Ich lese: {text}. Das kann ich noch nicht prüfen.',
    it: 'Leggo: {text}. Non è un calcolo che so controllare.',
  },
  wrong_generic: {
    fr: 'Pas encore. Vérifie ton calcul.',
    en: 'Not yet. Check your working.',
    de: 'Noch nicht. Prüf deine Rechnung.',
    it: 'Non ancora. Controlla il calcolo.',
  },
}

const STYLE_NAME = {
  pictures: { fr: 'les images', en: 'The pictures', de: 'den Bildern', it: 'le immagini' },
  bars: { fr: 'les barres', en: 'The fraction bars', de: 'den Bruchstreifen', it: 'le barre' },
  steps: { fr: "l'exemple résolu", en: 'The worked example', de: 'dem Beispiel', it: "l'esempio" },
}

// Slots can be plain values or { fr, en, ... } objects (picked per language).
export function hint(key, lang, slots = {}) {
  const table = HINTS[key]
  const fill = (t, l) =>
    t.replace(/\{(\w+)\}/g, (_, k) => {
      const v = slots[k]
      return String(v && typeof v === 'object' ? ((Object.hasOwn(v, l) ? v[l] : v.en) ?? '') : (v ?? ''))
    })
  // only the table's own languages: "constructor" or "__proto__" must fall back to English too
  const has = Object.hasOwn(table, lang)
  const out = { text: fill(has ? table[lang] : table.en, has ? lang : 'en'), lang: has ? lang : 'en' }
  if (has && lang !== 'en') out.translation = fill(table.en, 'en')
  return out
}

const own = (o, k) => (Object.hasOwn(o, k) ? o[k] : undefined)
export const styleName = (style, lang) => own(own(STYLE_NAME, style) || {}, lang) || own(STYLE_NAME, style)?.en || style
export const styleNames = (style) => own(STYLE_NAME, style) || { en: style }

const ORDER = ['pictures', 'bars', 'steps']

// Which style now: one that already worked for this child first; never repeat one that
// failed; otherwise one not tried for this mistake yet; otherwise the next after the last one
// (never the style that just failed again).
export function chooseStyle(profile, iteration, triedThisTime = []) {
  const worked = ORDER.find((s) => (profile[s]?.wins || 0) > 0 && !triedThisTime.includes(s))
  if (worked) return { style: worked, why: `${styleName(worked, 'en')} worked for you before, so let's use them again.` }
  const failed = (s) => (profile[s]?.tries || 0) > (profile[s]?.wins || 0)
  const prev = triedThisTime[triedThisTime.length - 1]
  const style =
    ORDER.find((s) => !triedThisTime.includes(s) && !failed(s)) ||
    ORDER.find((s) => !triedThisTime.includes(s)) ||
    (prev ? ORDER[(ORDER.indexOf(prev) + 1) % ORDER.length] : ORDER[(iteration - 1) % ORDER.length])
  const why =
    iteration === 1
      ? `First time with this mistake, so starting with ${style === 'pictures' ? 'pictures' : style === 'bars' ? 'fraction bars' : 'a worked example'}.`
      : `${styleName(prev || 'pictures', 'en')} didn't click yet, so this time: ${style === 'bars' ? 'fraction bars' : style === 'steps' ? 'a worked example' : 'pictures'}.`
  return { style, why }
}

const piece = (f, label, tone, note) => ({ n: f.n, d: f.d, label, tone, ...(note ? { note } : {}) })

// The operand that needs smaller pieces, and how it looks with the common bottom.
function rescale(a, b) {
  const d = lcm(a.d, b.d)
  return { d, as: F(a.n * (d / a.d), d), bs: F(b.n * (d / b.d), d) }
}

// Pieces of size 1/d in words, for "cut both into ...": halves, thirds, ..., 21sts, 22nds.
const PIECE_NAMES = { 1: 'wholes', 2: 'halves', 3: 'thirds', 4: 'quarters', 5: 'fifths', 6: 'sixths', 7: 'sevenths', 8: 'eighths', 9: 'ninths', 10: 'tenths', 11: 'elevenths', 12: 'twelfths' }
function pieceName(d) {
  if (Object.hasOwn(PIECE_NAMES, d)) return PIECE_NAMES[d]
  const t = d % 100
  const u = d % 10
  return `${d}${t >= 11 && t <= 13 ? 'ths' : u === 1 ? 'sts' : u === 2 ? 'nds' : u === 3 ? 'rds' : 'ths'}`
}

// Worked examples: the same kind of sum as the child's (same or different bottoms), other numbers.
const EXAMPLES = {
  different: [
    [F(1, 3), F(1, 6)],
    [F(1, 2), F(1, 4)],
    [F(2, 3), F(1, 9)],
    [F(1, 4), F(3, 8)],
    [F(1, 5), F(3, 10)],
  ],
  same: [
    [F(1, 5), F(2, 5)],
    [F(2, 7), F(3, 7)],
    [F(1, 8), F(5, 8)],
    [F(2, 9), F(4, 9)],
  ],
}

function workedExample(a, b) {
  const same = a.d === b.d
  const pool = same ? EXAMPLES.same : EXAMPLES.different
  const total = addExact(a, b)
  // never the child's own sum (in either order, or written another way), nor one with its answer
  const givesAway = ([p, q]) => (sameValue(p, a) && sameValue(q, b)) || (sameValue(p, b) && sameValue(q, a)) || sameValue(addExact(p, q), total)
  const [x, y] = pool.find((e) => !givesAway(e)) || pool[0]
  const { d, as, bs } = rescale(x, y)
  const sum = F(as.n + bs.n, d)
  const lines = same ? [sumLatex(x, y), `=${flatex(sum)}`] : [sumLatex(x, y), `=${flatex(as)}+${flatex(bs)}`, `=${flatex(sum)}`]
  if (reduce(sum).d !== sum.d) lines.push(`=${flatex(reduce(sum))}`)
  return { x, y, same, lines }
}

// Teaching for a wrong sum a + b = ans. Returns { teaching, hint }.
export function explainWrongSum({ partId, a, b, ans, bug, style, why, iteration, lang }) {
  const right = addExact(a, b)
  const bigger = less(a, b) ? b : a
  const other = bigger === a ? b : a
  const { d, as, bs } = rescale(a, b)
  const total = F(as.n + bs.n, d)
  // Same bottoms: the pieces already match, so nothing is turned into anything; only the tops add.
  const sameBottom = a.d === b.d
  const scaledPart = a.d !== d ? { from: a, to: as } : { from: b, to: bs }
  const misconception = bug ? { id: bug.id, name: bug.label } : { id: 'unknown', name: 'not the right total' }
  const sameSizeStep = sameBottom
    ? `The pieces are already the same size (${pieceName(d)}), so add the tops and keep the bottom: ${fstr(a)} + ${fstr(b)} = ${fstr(total)}.`
    : `Make the pieces the same size first: ${fstr(scaledPart.from)} is the same as ${fstr(scaledPart.to)}.`
  const sizeHint = () => (sameBottom ? hint('keep_bottom', lang, { d }) : hint('same_size', lang, { part: fstr(scaledPart.from), scaled: fstr(scaledPart.to) }))
  let title
  let visual
  let steps
  let h

  if (style === 'pictures') {
    if (less(ans, bigger)) {
      title = 'Can adding make something smaller?'
      visual = { kind: 'compare_pies', left: piece(ans, `your answer, ${fstr(ans)}`, 'marker'), relation: '<', right: piece(bigger, `${fstr(bigger)} on its own`, 'pen') }
      steps = [
        `Your answer, ${fstr(ans)}, is smaller than ${fstr(bigger)}.`,
        `But you added ${fstr(other)} to ${fstr(bigger)}, so the answer must be bigger than ${fstr(bigger)}.`,
        sameSizeStep,
      ]
      h = hint('smaller', lang, { ans: fstr(ans), big: fstr(bigger) })
    } else {
      const rel = less(ans, right) ? '<' : sameValue(ans, right) ? '=' : '>'
      const rr = reduce(total)
      const simpler = rr.d !== d ? ` (or ${rr.d === 1 ? rr.n : fstr(rr)})` : ''
      // the question fits the picture: too much, or not enough
      title = rel === '>' ? 'Is it really that much?' : 'Is that enough?'
      visual = { kind: 'compare_pies', left: piece(ans, `your answer, ${fstr(ans)}`, 'marker'), relation: rel, right: piece(total, `${fstr(a)} + ${fstr(b)} = ${fstr(total)}`, 'pen') }
      steps = [
        `Let's compare your answer, ${fstr(ans)}, with what ${fstr(a)} + ${fstr(b)} really makes.`,
        sameBottom ? `The pieces are already the same size: both are ${pieceName(d)}.` : sameSizeStep,
        sameBottom ? `So add the tops and keep the bottom: ${fstr(a)} + ${fstr(b)} = ${fstr(total)}${simpler}.` : `Then ${as.n}/${d} + ${bs.n}/${d} = ${fstr(total)}${simpler}.`,
      ]
      h = sizeHint()
    }
  } else if (style === 'bars') {
    if (sameBottom) {
      title = 'The pieces are already the same size'
      visual = {
        kind: 'bar_model',
        rows: [
          piece(a, fstr(a), 'pen'),
          piece(b, fstr(b), 'marker'),
          // the total as one bar, when it fits in one
          ...(total.n <= d ? [piece(total, fstr(total), 'pen', 'add the tops, keep the bottom')] : []),
        ],
      }
      steps = [
        `${fstr(a)} and ${fstr(b)} are both cut into ${pieceName(d)}: the pieces are already the same size.`,
        `So add the tops, ${a.n} + ${b.n} = ${total.n}, and keep the bottom: ${fstr(a)} + ${fstr(b)} = ${fstr(total)}.`,
        `The bottom stays ${d}: adding pieces doesn't change their size.`,
      ]
    } else {
      title = 'Are the pieces the same size?'
      visual = {
        kind: 'bar_model',
        rows: [
          piece(a, fstr(a), 'pen'),
          piece(b, fstr(b), 'marker'),
          piece(as, fstr(as), 'pen', `cut both into ${pieceName(d)}`),
          piece(bs, fstr(bs), 'marker'),
        ],
      }
      steps = [
        `${fstr(a)} and ${fstr(b)} are cut into different-sized pieces, so they can't be added yet.`,
        `Cut both into ${pieceName(d)}: ${fstr(a)} ${a.d === d ? 'stays' : 'is'} ${fstr(as)}, and ${fstr(b)} ${b.d === d ? 'stays' : 'is'} ${fstr(bs)}.`,
        'Now the pieces match: add the tops, keep the bottom.',
      ]
    }
    h = sizeHint()
  } else {
    const ex = workedExample(a, b)
    title = 'The same kind of problem, worked out'
    visual = { kind: 'worked', caption: 'The same kind of problem, worked out', lines: ex.lines }
    steps = ex.same
      ? [`Both bottoms are ${ex.x.d}: the pieces are already the same size.`, 'So add the tops and keep the bottom.', 'Do yours the same way.']
      : [
          `First find a bottom both fractions can share: ${ex.x.d} and ${ex.y.d} both fit into ${lcm(ex.x.d, ex.y.d)}.`,
          'Change each fraction: multiply the top AND the bottom by the same number.',
          'Now add the tops and keep the bottom. Do yours the same way.',
        ]
    h = hint('worked', lang)
  }
  return { teaching: { partId, misconception, style, iteration, why, title, visual, steps }, hint: h }
}

// ---------- similar exercises ----------

const POOL = [
  [F(2, 5), F(1, 3)],
  [F(1, 2), F(1, 3)],
  [F(2, 3), F(1, 6)],
  [F(1, 4), F(1, 2)],
  [F(3, 4), F(1, 6)],
  [F(5, 6), F(1, 4)],
  [F(1, 3), F(1, 4)],
  [F(2, 5), F(1, 10)],
  [F(3, 8), F(1, 4)],
  [F(5, 6), F(3, 8)],
  [F(2, 9), F(5, 12)],
]

export const exerciseId = (a, b) => `${fstr(a)}+${fstr(b)}`

// Exercises where the child's misconception gives a visibly wrong answer that is recognised as
// that same misconception, not seen yet (in either order).
export function similarExercises({ bug, seen = new Set(), harder = false, count = 3 }) {
  const pool = harder ? [...POOL].sort((p, q) => lcm(q[0].d, q[1].d) - lcm(p[0].d, p[1].d)) : POOL
  const out = []
  for (const [a, b] of pool) {
    const id = exerciseId(a, b)
    if (seen.has(id) || seen.has(exerciseId(b, a))) continue
    if (bug) {
      const p = bug.fn(a, b)
      if (sameValue(p, addExact(a, b))) continue // wouldn't reveal the mistake
      if (diagnose(a, b, p)[0]?.id !== bug.id) continue // would be read as a different mistake
    }
    out.push({ id, latex: sumLatex(a, b), ...(bug ? { target: bug.id } : {}), a, b })
    if (out.length >= count) break
  }
  return out
}
