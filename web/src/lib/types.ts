// Shared shapes between the web app and the engine. Keep in sync with docs/protocol.md
// and engine/glimpse_engine/server.py.

import type { SubjectId } from './subjects'

export type Verdict = 'reading' | 'correct' | 'wrong' | 'unsure'

/** One finished part of the child's writing: a line, a step or an answer. */
export interface WrittenPart {
  id: number
  /** What the reader read, e.g. "\\frac{3}{4}+\\frac{1}{2}=\\frac{4}{6}". */
  latex: string
  confidence: number
  verdict: Verdict
  /** Short label for a wrong part, e.g. "added the tops and the bottoms". */
  note?: string
  /** The recommended exercise this part answers, if any. */
  exerciseId?: string
  /** x, y, w, h in normalised camera coordinates (live camera only). */
  box?: [number, number, number, number]
  /** The photo this line was read from (JPEG data URL, the whole frame, never cropped). */
  crop?: string
  at: number
}

/** One step of an animation: what Glim says, and the maths written at that step. */
export interface SceneStage {
  caption: string
  math?: string
  [k: string]: unknown
}

/**
 * A ready-made animation, picked by the decision model (Laya) and computed by the engine
 * (server/engine/scenes.js). The web app draws it; the AI never writes drawing code.
 * skin: kid (objects, pizzas), junior (bars, blocks), grown (graphs, algebra).
 */
export interface Scene {
  kind:
    | 'count' | 'number_line' | 'columns' | 'groups' | 'area_model' | 'sharing' | 'fractions' | 'percent' | 'order_ops' | 'powers'
    | 'mean' | 'balance' | 'inequality' | 'pythagoras' | 'pairs' | 'quadratic' | 'system' | 'graph' | 'trig' | 'limit' | 'derivative'
    | 'area' | 'chance' | 'combinations' | 'tree'
    | 'syllables' | 'phonics' | 'spelling' | 'plural' | 'sentence'
    | 'units' | 'speed' | 'density' | 'circuit' | 'states' | 'food_chain'
  skin: 'kid' | 'junior' | 'grown'
  stages: SceneStage[]
  resultTex: string
  decidedBy?: 'laya' | 'rules' | 'model'
  laya?: { kind: string; probability: number; ms: number } | null
  [k: string]: unknown
}

/** How a session went, written by the tutor at the end (stars are counted, not invented). */
export interface SessionSummary {
  title: string
  praise: string
  practised: string[]
  mistakes: { what: string; tip: string }[]
  next: string
  for_adults: string
  minutes: number
  lines: number
  right: number
  wrong: number
  questions: number
  stars: number
  lang: string
  name?: string
  at: number
  /** Exercises to practise next time (shown in My work). */
  review?: ReviewItem[]
}

/** An exercise suggested after a session: one done that day again, or with new numbers. */
export interface ReviewItem {
  id: string
  /** The exercise, as LaTeX (no answer). */
  exercise: string
  /** again: one that went wrong or wasn't finished; same: new numbers; harder: a step further; idea: the tutor's. */
  level: 'again' | 'same' | 'harder' | 'idea'
  why: string
  kind: string | null
  /** Worked out by code (LaTeX), or null when the code can't check it. */
  answer: string | null
  scene: Scene | null
  done?: boolean
}

/** The exercises suggested after one finished session. */
export interface SessionReview {
  ref: string
  sessionId: string
  at: number
  title: string
  items: ReviewItem[]
  /** maths, reading or science */
  subject?: string
}

/** One exercise in the whole-sheet report. */
export interface SheetItem {
  n: number
  /** Its label on the sheet ("a", "3"), when it has one. */
  label?: string | null
  partId: number
  latex: string
  verdict: 'right' | 'wrong' | 'unfinished' | 'unsure'
  note: string | null
}
/** "Check my whole sheet": every exercise on the page, judged and counted (server/engine/sheet.js). */
export interface SheetReport {
  total: number
  right: number
  wrong: number
  unfinished: number
  unsure: number
  items: SheetItem[]
  message: string
  firstToFix: number | null
  at: number
}

/** A whole solution, worked out by the tutor: what each step does, and the line written. */
export interface WorkedSteps {
  /** The exercise, as LaTeX. */
  about: string
  title: string
  /** Hints to try it alone first (a nudge first, almost the next step last); never the answer. */
  hints?: string[]
  items: { say: string; math: string }[]
  /** The final answer, as LaTeX. */
  result: string
  lang: string
  at: number
  /** The animation that explains it, when one fits. */
  scene?: Scene
  /** 'question': the child asked about it (the animation opens by itself). */
  reason?: 'line' | 'question'
  /** The tutor is still writing it: its hints and steps arrive one by one. */
  writing?: boolean
}

/** The whole paper as the OCR model read it: lines of text and maths pieces. */
export interface PageText {
  lines: { t: 'text' | 'math'; v: string }[][]
  /** How long the OCR took. */
  ms: number
  at: number
}

export type EngineState = 'idle' | 'watching' | 'reading' | 'thinking' | 'listening' | 'answering'
export type Connection = 'connecting' | 'live' | 'demo' | 'offline'
export type Tone = 'pen' | 'marker'

export interface Piece {
  n: number
  d: number
  label: string
  tone: Tone
  /** Shown above a bar row, e.g. "cut the half into quarters". */
  note?: string
}

/** A teaching scene. The AI never writes drawing code: it picks one of these and fills in numbers. */
export type Visual =
  | { kind: 'compare_pies'; left: Piece; relation: '<' | '>' | '='; right: Piece }
  | { kind: 'bar_model'; rows: Piece[] }
  | { kind: 'worked'; lines: string[]; caption: string }

export type TeachStyle = 'pictures' | 'bars' | 'steps' | 'number_line'

export interface Teaching {
  partId: number
  misconception: { id: string; name: string }
  style: TeachStyle
  /** 1 for the first explanation of this misconception in the session, 2 for the next... */
  iteration: number
  /** Why this style for this child, in plain words. */
  why: string
  title: string
  titleLang?: string
  visual: Visual
  steps: string[]
}

export interface Exercise {
  id: string
  latex: string
  /** Misconception it targets. */
  target?: string
}

/** Per child: how often an exercise was right just after each teaching style. */
export type Profile = Partial<Record<TeachStyle, { tries: number; wins: number }>>

export interface Hint {
  text: string
  lang: string
  translation?: string
}

export interface Question {
  text: string
  lang: string
  final: boolean
  pointedAt?: { partId: number; token: string }
  /** What the finger pointed at, as LaTeX (read from the page). */
  about?: string
}

export interface Answer extends Hint {
  visual?: Visual
}

export type EngineEvent =
  | { type: 'hello'; version: string; camera: boolean }
  | { type: 'status'; state: EngineState }
  | { type: 'part'; part: WrittenPart }
  | { type: 'confirm'; partId: number; latex: string }
  | { type: 'teach'; teaching: Teaching | null }
  | { type: 'exercises'; items: Exercise[]; currentId?: string }
  | { type: 'profile'; profile: Profile }
  | { type: 'hint'; hint: Hint | null }
  | { type: 'question'; question: Question }
  | { type: 'answer'; answer: Answer }
  | { type: 'page'; page: PageText }
  | { type: 'steps'; steps: WorkedSteps }
  | { type: 'summary'; summary: SessionSummary }
  /** What kind of maths is on the paper (recognised by Laya), e.g. { kind: 'area', label: 'Integrals' }. */
  | { type: 'topic'; topic: { kind: string; label: string } }
  /** "Check my whole sheet": every exercise on the page, counted (null if it couldn't be read). */
  | { type: 'sheet'; sheet: SheetReport | null; error?: boolean }
  /** The subject Glim recognised (Laya) for what was just written or asked: maths, reading or science. */
  | { type: 'subject'; subject: SubjectId }

export type ClientEvent =
  | { type: 'session_start'; student: string; name: string; lang: string; subject: SubjectId; age?: number }
  /** The child picked another subject on the desk ("Choose a practice"). */
  | { type: 'subject'; subject: SubjectId }
  /**
   * "This line is finished, read it now": pencil lifted (detected in the browser), a key or
   * a mouse button. The browser owns the camera, so it sends the picture: a JPEG data URL of
   * the whole frame, already the right way up.
   */
  | { type: 'cut_part'; image?: string }
  /** "Check my whole sheet": the whole frame; the engine judges every exercise on it. */
  | { type: 'check_sheet'; image?: string }
  /** "Show me how" on one exercise of the sheet report. */
  | { type: 'explain'; partId: number }
  /** Development: type a part instead of writing it. */
  | { type: 'part_typed'; text: string }
  | { type: 'confirm_reply'; partId: number; ok: boolean }
  | { type: 'pick_exercise'; id: string }
  | { type: 'ask_start' }
  | { type: 'ask_end' }
  | { type: 'question_typed'; text: string; partId?: number }
  /**
   * The child points at the paper (fingertip found in the browser) and maybe typed a question.
   * image: the whole frame, never cropped; x, y: the fingertip, 0-1 in that image.
   */
  | { type: 'point'; image: string; x?: number; y?: number; text?: string }
  | { type: 'session_end' }
  /** The learner's age changed (Settings). */
  | { type: 'set_age'; age: number }
