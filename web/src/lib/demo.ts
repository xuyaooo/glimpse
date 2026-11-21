// Demo mode: a scripted engine that acts out both loops when no engine is running.
// It lets the web app be built without a camera, and it is the backup for the stage demo.
//
// W, C or Space = "the child lifted the pencil" (the next scripted part appears).
// Hold A = point at the paper and ask.
//
// Script (fractions):
//   1. 1/5 + 2/5 = 3/5   right
//   2. 3/4 + 1/2 = 4/6   wrong, adds across → taught with pictures, 3 similar exercises
//   3. 2/5 + 1/3 = 3/8   the first exercise, wrong again → pictures didn't work, now fraction bars
//   4. 1/2 + 1/3 = 5/6   right → it clicked with fraction bars (profile: bars 1/1)
//   5. 2/3 + 1/6 = 5/6   the reader is unsure → the child confirms → right, two in a row

import { parseSum, sum, tokens } from './latex'
import type { ClientEvent, EngineEvent, Exercise, Hint, Profile, Teaching, WrittenPart } from './types'

type Step = { latex: string; confidence: number; exerciseId?: string }

const ex = (a: [number, number], b: [number, number]): Exercise => ({ id: `${a.join('/')}+${b.join('/')}`, latex: sum(a, b), target: 'adds_across' })

const EX = {
  a: ex([2, 5], [1, 3]),
  b: ex([1, 2], [1, 3]),
  c: ex([2, 3], [1, 6]),
  d: ex([1, 4], [1, 2]),
  e: ex([3, 4], [1, 6]),
  f: ex([5, 6], [1, 4]),
}

const SCRIPT: Step[] = [
  { latex: sum([1, 5], [2, 5], [3, 5]), confidence: 0.97 },
  { latex: sum([3, 4], [1, 2], [4, 6]), confidence: 0.95 },
  { latex: sum([2, 5], [1, 3], [3, 8]), confidence: 0.94, exerciseId: EX.a.id },
  { latex: sum([1, 2], [1, 3], [5, 6]), confidence: 0.96, exerciseId: EX.b.id },
  { latex: sum([2, 3], [1, 6], [5, 6]), confidence: 0.62, exerciseId: EX.c.id },
]

const MISCONCEPTION = { id: 'adds_across', name: 'added the tops and the bottoms' }

function teachPictures(partId: number): Teaching {
  return {
    partId,
    misconception: MISCONCEPTION,
    style: 'pictures',
    iteration: 1,
    why: 'First time with this mistake, so starting with pictures.',
    title: 'Can adding make something smaller?',
    visual: {
      kind: 'compare_pies',
      left: { n: 4, d: 6, label: 'your answer, 4/6', tone: 'marker' },
      relation: '<',
      right: { n: 3, d: 4, label: '3/4 on its own', tone: 'pen' },
    },
    steps: [
      'Your answer, 4/6, is smaller than 3/4.',
      'But you added 1/2 to 3/4, so the answer must be bigger than 3/4.',
      'Make the pieces the same size first: 1/2 is the same as 2/4.',
    ],
  }
}

function teachBars(partId: number): Teaching {
  return {
    partId,
    misconception: MISCONCEPTION,
    style: 'bars',
    iteration: 2,
    why: "Pictures didn't click yet, so this time: fraction bars.",
    title: 'Are the pieces the same size?',
    visual: {
      kind: 'bar_model',
      rows: [
        { n: 2, d: 5, label: '2/5', tone: 'pen' },
        { n: 1, d: 3, label: '1/3', tone: 'marker' },
        { n: 6, d: 15, label: '6/15', tone: 'pen', note: 'cut both into fifteenths' },
        { n: 5, d: 15, label: '5/15', tone: 'marker' },
      ],
    },
    steps: [
      'Fifths and thirds are different sizes, so they can\'t be added yet.',
      'Cut both into fifteenths: 2/5 is 6/15, and 1/3 is 5/15.',
      'Now the pieces match: add the tops, keep the bottom.',
    ],
  }
}

export function createDemo(emit: (e: EngineEvent) => void) {
  let timers: number[] = []
  let step = 0
  let lang = 'fr'
  let subject = 'maths'
  let parts: WrittenPart[] = []
  let profile: Profile = {}
  let awaiting: WrittenPart | null = null

  const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms))
  const say = (fr: string, en: string): Hint => (lang === 'fr' ? { text: fr, lang: 'fr', translation: en } : { text: en, lang: 'en' })
  const put = (p: WrittenPart) => {
    parts = parts.some((x) => x.id === p.id) ? parts.map((x) => (x.id === p.id ? p : x)) : [...parts, p]
    emit({ type: 'part', part: p })
  }

  function reset() {
    timers.forEach(clearTimeout)
    timers = []
    step = 0
    parts = []
    profile = {}
    awaiting = null
  }

  function start(language: string) {
    reset()
    lang = language
    emit({ type: 'exercises', items: [] })
    emit({ type: 'profile', profile })
    emit({ type: 'teach', teaching: null })
    emit({ type: 'hint', hint: null })
    emit({ type: 'status', state: 'watching' })
  }

  function cut() {
    // The script is maths only.
    if (subject !== 'maths') {
      emit({ type: 'hint', hint: say('Le tuteur de démo ne connaît que les maths. Choisis Maths pour essayer.', 'The demo tutor only knows maths so far. Pick Maths to try it.') })
      return
    }
    if (awaiting || step >= SCRIPT.length) {
      if (step >= SCRIPT.length) emit({ type: 'hint', hint: say('Tu peux écrire un autre exercice.', 'You can write another exercise.') })
      return
    }
    const s = SCRIPT[step++]
    const part: WrittenPart = { id: parts.length + 1, latex: s.latex, confidence: s.confidence, verdict: 'reading', exerciseId: s.exerciseId, at: Date.now() }
    put(part)
    emit({ type: 'status', state: 'reading' })
    if (s.confidence < 0.8) {
      // The small reader is unsure: ask the child, which is cheaper than calling a big model.
      later(600, () => {
        awaiting = part
        emit({ type: 'confirm', partId: part.id, latex: part.latex })
        emit({ type: 'status', state: 'watching' })
      })
      return
    }
    later(500, () => emit({ type: 'status', state: 'thinking' }))
    later(1000, () => judge(part))
  }

  function judge(part: WrittenPart) {
    const n = part.id
    if (n === 1) {
      put({ ...part, verdict: 'correct' })
      emit({ type: 'hint', hint: say('Juste !', 'Right!') })
    } else if (n === 2) {
      put({ ...part, verdict: 'wrong', note: MISCONCEPTION.name })
      emit({ type: 'teach', teaching: teachPictures(n) })
      emit({ type: 'hint', hint: say('Regarde : 4/6, c’est plus petit que 3/4. Est-ce qu’on peut ajouter et obtenir moins ?', 'Look: 4/6 is smaller than 3/4. Can adding give you less?') })
      emit({ type: 'exercises', items: [EX.a, EX.b, EX.c], currentId: EX.a.id })
    } else if (n === 3) {
      put({ ...part, verdict: 'wrong', note: MISCONCEPTION.name })
      profile = { ...profile, pictures: { tries: 1, wins: 0 } }
      emit({ type: 'profile', profile })
      emit({ type: 'teach', teaching: teachBars(n) })
      emit({ type: 'hint', hint: say('Des cinquièmes et des tiers n’ont pas la même taille. Coupe-les tous en quinzièmes.', 'Fifths and thirds aren’t the same size. Cut them all into fifteenths.') })
      emit({ type: 'exercises', items: [EX.b, EX.c, EX.d], currentId: EX.b.id })
    } else if (n === 4) {
      put({ ...part, verdict: 'correct' })
      profile = { ...profile, bars: { tries: 1, wins: 1 } }
      emit({ type: 'profile', profile })
      emit({ type: 'teach', teaching: null })
      emit({ type: 'hint', hint: say('Bravo ! Avec les barres, ça a marché.', 'Well done! The fraction bars did it.') })
      emit({ type: 'exercises', items: [EX.c, EX.e], currentId: EX.c.id })
    } else {
      put({ ...part, verdict: 'correct' })
      emit({ type: 'hint', hint: say('Deux de suite ! On passe à un peu plus difficile.', 'Two in a row! Let’s try something a little harder.') })
      emit({ type: 'exercises', items: [EX.e, EX.f], currentId: EX.e.id })
    }
    emit({ type: 'status', state: 'watching' })
  }

  function confirmReply(ok: boolean) {
    if (!awaiting) return
    const part = awaiting
    awaiting = null
    if (ok) {
      emit({ type: 'status', state: 'thinking' })
      later(400, () => judge({ ...part, confidence: 1 }))
    } else {
      put({ ...part, verdict: 'unsure', note: 'fix it, then lift your pencil again' })
      step--
      emit({ type: 'status', state: 'watching' })
    }
  }

  /** The part the child points at: the latest wrong one, else the latest one. */
  function target() {
    return [...parts].reverse().find((p) => p.verdict === 'wrong') ?? parts[parts.length - 1]
  }

  function askStart() {
    const p = target()
    const t = p ? tokens(p.latex).filter((x) => x.kind === 'frac').pop() : undefined
    const pointedAt = p ? { partId: p.id, token: t && t.kind === 'frac' ? t.d : '' } : undefined
    const words = lang === 'fr' ? ['pourquoi', 'pourquoi c’est', 'pourquoi c’est faux ?'] : ['why', 'why is this', 'why is this wrong?']
    emit({ type: 'status', state: 'listening' })
    emit({ type: 'question', question: { text: '', lang, final: false, pointedAt } })
    words.forEach((text, i) => later(350 * (i + 1), () => emit({ type: 'question', question: { text, lang, final: false, pointedAt } })))
  }

  function askEnd() {
    const p = target()
    const text = lang === 'fr' ? 'pourquoi c’est faux ?' : 'why is this wrong?'
    const t = p ? tokens(p.latex).filter((x) => x.kind === 'frac').pop() : undefined
    emit({ type: 'question', question: { text, lang, final: true, pointedAt: p ? { partId: p.id, token: t && t.kind === 'frac' ? t.d : '' } : undefined } })
    emit({ type: 'status', state: 'answering' })
    later(700, () => {
      const s = p ? parseSum(p.latex) : null
      if (!p) {
        emit({ type: 'answer', answer: say('Écris d’abord quelque chose, puis montre-le-moi.', 'Write something first, then point at it.') })
      } else if (p.verdict !== 'wrong' || !s) {
        emit({ type: 'answer', answer: say('Cette ligne est juste ! Continue.', 'That line is right! Keep going.') })
      } else {
        const [an, ad] = s.a
        const [bn, bd] = s.b
        const [, fd] = s.ans
        emit({
          type: 'answer',
          answer: {
            ...say(
              `Ton ${fd} vient de ${ad} + ${bd}. Mais les morceaux n’ont pas la même taille : on n’additionne pas les nombres du bas.`,
              `Your ${fd} comes from ${ad} + ${bd}. But the pieces aren’t the same size, so the bottoms don’t add up.`,
            ),
            visual: {
              kind: 'bar_model',
              rows: [
                { n: an, d: ad, label: `${an}/${ad}`, tone: 'pen' },
                { n: bn, d: bd, label: `${bn}/${bd}`, tone: 'marker' },
              ],
            },
          },
        })
      }
      emit({ type: 'status', state: 'watching' })
    })
  }

  return {
    handle(e: ClientEvent) {
      switch (e.type) {
        case 'session_start':
          subject = e.subject
          return start(e.lang)
        case 'subject':
          subject = e.subject
          return
        case 'cut_part':
        case 'part_typed':
          return cut()
        case 'confirm_reply':
          return confirmReply(e.ok)
        case 'ask_start':
          return askStart()
        case 'ask_end':
          return askEnd()
        case 'session_end':
          return reset()
      }
    },
  }
}
