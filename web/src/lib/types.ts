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

export type ClientEvent =
  | { type: 'session_start'; student: string; name: string; lang: string; subject: SubjectId }
  /** The child picked another subject on the desk ("Choose a practice"). */
  | { type: 'subject'; subject: SubjectId }
  /**
   * "This line is finished, read it now": pencil lifted (detected in the browser), a key or
   * a mouse button. The browser owns the camera, so it sends the picture: a JPEG data URL of
   * the whole frame, already the right way up.
   */
  | { type: 'cut_part'; image?: string }
  /** Development: type a part instead of writing it. */
  | { type: 'part_typed'; text: string }
  | { type: 'confirm_reply'; partId: number; ok: boolean }
  | { type: 'pick_exercise'; id: string }
  | { type: 'ask_start' }
  | { type: 'ask_end' }
  | { type: 'question_typed'; text: string; partId?: number }
  | { type: 'session_end' }
