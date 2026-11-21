// Shared shapes between the web app and the engine. Keep in sync with docs/protocol.md
// and engine/glimpse_engine/protocol.py.

/** A fraction exactly as written: 4/6 stays 4/6, it is never reduced. */
export interface Frac {
  n: number
  d: number
}

export interface Problem {
  id: number
  a: Frac
  b: Frac
}

export type Verdict = 'correct' | 'wrong' | 'next'

/** A mark the tutor draws on the child's paper. `box` is x, y, w, h in normalised camera coordinates (live mode). */
export interface Mark {
  problem: number
  verdict: Verdict
  label?: string
  box?: [number, number, number, number]
}

export type EngineState = 'idle' | 'watching' | 'reading' | 'thinking' | 'listening' | 'answering'
export type Connection = 'connecting' | 'live' | 'demo' | 'offline'
export type Tone = 'pen' | 'marker'

export interface Part extends Frac {
  label: string
  tone: Tone
  /** Shown above a bar-model row, e.g. "cut the half into quarters". */
  note?: string
}

/** The visual explainer's scene. The AI never writes drawing code; it picks one of these and fills in numbers. */
export type Visual =
  | { kind: 'compare_pies'; left: Part; relation: '<' | '>' | '='; right: Part }
  | { kind: 'bar_model'; rows: Part[] }

export interface Explanation {
  problem: number
  heading: string
  title: string
  titleLang?: string
  visual: Visual
  steps: string[]
}

export interface Hint {
  text: string
  lang: string
  translation?: string
}

export interface Ask {
  text: string
  lang: string
  final: boolean
  pointedAt?: { problem: number; token: string }
}

export interface Insight {
  text: string
  evidence: string
}

export type CheckId = 'camera' | 'markers' | 'light' | 'button' | 'mic'

export interface SetupCheck {
  /** true = fine, false = needs attention, null = waiting */
  ok: boolean | null
  detail: string
}

export type EngineEvent =
  | { type: 'hello'; version: string; camera: boolean }
  | { type: 'status'; state: EngineState }
  | { type: 'setup'; checks: Partial<Record<CheckId, SetupCheck>> }
  | { type: 'worksheet'; id: string; problems: Problem[] }
  | { type: 'written'; problem: number; answer: Frac }
  | { type: 'mark'; mark: Mark }
  | { type: 'explain'; explanation: Explanation | null }
  | { type: 'hint'; hint: Hint | null }
  | { type: 'confirm'; problem: number; guess: Frac }
  | { type: 'transcript'; ask: Ask }
  | { type: 'answer'; explanation: Explanation | null; hint: Hint }
  | { type: 'insight'; insight: Insight }
  | { type: 'progress'; current: number }

export type ClientEvent =
  | { type: 'session_start'; student: string; worksheet: string; lang: string }
  | { type: 'check' }
  | { type: 'check_typed'; problem: number; answer: string }
  | { type: 'ask_start' }
  | { type: 'ask_end' }
  | { type: 'confirm_reply'; problem: number; ok: boolean }
  | { type: 'session_end' }
