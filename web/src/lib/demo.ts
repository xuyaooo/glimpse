// Demo mode: a scripted engine that replays the fractions story when no engine is running.
// It lets the frontend be built without a camera, and it is the backup for the stage demo.
//
// Drive it like the real thing: C or Space = "the child finished a line", hold A = ask.
// Script: 1 right, 2 wrong (adds across), ask about the 6, 3 right (the bug was not
// confirmed: the idea clicked), 4 right, 5 uncertain reading (confirm), 6 right.

import type { ClientEvent, EngineEvent, Explanation, Frac, Problem } from './types'

const f = (n: number, d: number): Frac => ({ n, d })

export const DEMO_PROBLEMS: Problem[] = [
  { id: 1, a: f(1, 5), b: f(2, 5) },
  { id: 2, a: f(3, 4), b: f(1, 2) },
  { id: 3, a: f(2, 5), b: f(1, 3) },
  { id: 4, a: f(1, 6), b: f(2, 3) },
  { id: 5, a: f(3, 8), b: f(1, 4) },
  { id: 6, a: f(2, 3), b: f(1, 4) },
]

const WRITTEN: Record<number, Frac> = { 1: f(3, 5), 2: f(4, 6), 3: f(11, 15), 4: f(5, 6), 5: f(5, 8), 6: f(11, 12) }

const WHY_SMALLER: Explanation = {
  problem: 2,
  heading: 'Problem 2',
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

const WHY_THE_SIX: Explanation = {
  problem: 2,
  heading: 'You pointed at the 6 and asked',
  title: '« Pourquoi c’est faux ? »',
  titleLang: 'fr',
  visual: {
    kind: 'bar_model',
    rows: [
      { n: 3, d: 4, label: '3/4', tone: 'pen' },
      { n: 1, d: 2, label: '1/2', tone: 'marker' },
      { n: 2, d: 4, label: '2/4', tone: 'marker', note: 'cut the half into quarters' },
    ],
  },
  steps: ['Your 6 comes from 4 + 2.', 'Quarters and halves are not the same size.', 'Cut the half into quarters first, then add.'],
}

export function createDemo(emit: (e: EngineEvent) => void) {
  let timers: number[] = []
  let checked = new Set<number>()
  let bugSeen = false
  let awaitingConfirm: number | null = null
  let lang = 'fr'

  const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms))
  const nextUnchecked = () => DEMO_PROBLEMS.find((p) => !checked.has(p.id))?.id ?? null
  const say = (fr: string, en: string) => (lang === 'fr' ? { text: fr, lang: 'fr', translation: en } : { text: en, lang: 'en' })

  function reset() {
    timers.forEach(clearTimeout)
    timers = []
    checked = new Set()
    bugSeen = false
    awaitingConfirm = null
  }

  function start(language: string) {
    reset()
    lang = language
    emit({ type: 'worksheet', id: 'fractions-1', problems: DEMO_PROBLEMS })
    emit({ type: 'progress', current: 1 })
    emit({ type: 'status', state: 'watching' })
  }

  function check() {
    if (awaitingConfirm !== null) return
    const p = nextUnchecked()
    if (p === null) return
    emit({ type: 'progress', current: p })
    emit({ type: 'written', problem: p, answer: WRITTEN[p] })
    emit({ type: 'status', state: 'reading' })
    if (p === 5) {
      // The small reader is unsure about this line, so it asks the child instead of calling a big model.
      later(600, () => {
        awaitingConfirm = 5
        emit({ type: 'confirm', problem: 5, guess: WRITTEN[5] })
        emit({ type: 'status', state: 'watching' })
      })
      return
    }
    later(450, () => emit({ type: 'status', state: 'thinking' }))
    later(900, () => finish(p))
  }

  function finish(p: number) {
    checked.add(p)
    if (p === 2) {
      bugSeen = true
      emit({ type: 'mark', mark: { problem: 2, verdict: 'wrong', label: 'added the tops and the bottoms' } })
      emit({ type: 'explain', explanation: WHY_SMALLER })
      emit({ type: 'hint', hint: say('Regarde : 4/6, c’est plus petit que 3/4. Est-ce qu’on peut ajouter et obtenir moins ?', 'Look: 4/6 is smaller than 3/4. Can adding give you less?') })
      // Teaching move: the next problem is the one where "adds across" predicts a distinctive answer (3/8).
      emit({ type: 'mark', mark: { problem: 3, verdict: 'next', label: 'try this one next' } })
      emit({ type: 'status', state: 'watching' })
      return
    }
    emit({ type: 'mark', mark: { problem: p, verdict: 'correct' } })
    if (p === 3 && bugSeen) {
      emit({ type: 'explain', explanation: null })
      emit({ type: 'hint', hint: say('Bravo ! Cette fois, les morceaux ont la même taille.', 'Well done! This time the pieces are the same size.') })
      emit({ type: 'insight', insight: { text: 'Pieces must be the same size before you add them.', evidence: 'You showed it on problem 3: 2/5 + 1/3 = 11/15' } })
    } else if (p === 6) {
      emit({ type: 'hint', hint: say('Tu as fini la feuille ! Appuie sur Terminer.', 'You finished the sheet! Press Finish.') })
      emit({ type: 'status', state: 'idle' })
      return
    } else {
      emit({ type: 'hint', hint: null })
    }
    emit({ type: 'status', state: 'watching' })
  }

  function confirmReply(ok: boolean) {
    if (awaitingConfirm === null) return
    const p = awaitingConfirm
    awaitingConfirm = null
    if (ok) {
      emit({ type: 'status', state: 'thinking' })
      later(400, () => finish(p))
    } else {
      emit({ type: 'hint', hint: say('D’accord. Corrige-le, puis appuie encore sur le bouton.', 'Okay. Fix it, then press the button again.') })
    }
  }

  function askStart() {
    const aboutTheSix = bugSeen && !checked.has(3)
    const pointedAt = aboutTheSix ? { problem: 2, token: '6' } : undefined
    const words = lang === 'fr' ? ['pourquoi', 'pourquoi c’est', 'pourquoi c’est faux ?'] : ['why', 'why is this', 'why is this wrong?']
    emit({ type: 'status', state: 'listening' })
    emit({ type: 'transcript', ask: { text: '', lang, final: false, pointedAt } })
    words.forEach((text, i) => later(350 * (i + 1), () => emit({ type: 'transcript', ask: { text, lang, final: false, pointedAt } })))
  }

  function askEnd() {
    const aboutTheSix = bugSeen && !checked.has(3)
    const text = lang === 'fr' ? 'pourquoi c’est faux ?' : 'why is this wrong?'
    emit({ type: 'transcript', ask: { text, lang, final: true, pointedAt: aboutTheSix ? { problem: 2, token: '6' } : undefined } })
    emit({ type: 'status', state: 'answering' })
    later(700, () => {
      if (aboutTheSix) {
        emit({
          type: 'answer',
          explanation: WHY_THE_SIX,
          hint: say(
            'Ton 6 vient de 4 + 2. Mais des quarts et des demis n’ont pas la même taille : coupe d’abord la moitié en quarts.',
            'Your 6 comes from 4 + 2. But quarters and halves aren’t the same size: cut the half into quarters first.',
          ),
        })
      } else if (checked.size === 0) {
        emit({ type: 'answer', explanation: null, hint: say('Écris d’abord ta réponse, puis demande-moi.', 'Write your answer first, then ask me.') })
      } else {
        emit({ type: 'answer', explanation: null, hint: say('C’est juste ! Continue avec le problème suivant.', 'That one is right! Go on to the next problem.') })
      }
      emit({ type: 'status', state: 'watching' })
    })
  }

  return {
    handle(e: ClientEvent) {
      switch (e.type) {
        case 'session_start':
          return start(e.lang)
        case 'check':
        case 'check_typed':
          return check()
        case 'ask_start':
          return askStart()
        case 'ask_end':
          return askEnd()
        case 'confirm_reply':
          return confirmReply(e.ok)
        case 'session_end':
          return reset()
      }
    },
  }
}
