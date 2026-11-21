// Children on this laptop, and sample dashboard data for children without a live session.
// Every sample summary is labelled "Sample data" on the dashboard.

import type { Profile, TeachStyle, Verdict } from './types'

export interface Student {
  id: string
  name: string
  lang: string
  language: string
  tone: 'pen' | 'marker' | 'plain'
}

export const students: Student[] = [
  { id: 'amara', name: 'Amara', lang: 'fr', language: 'Français', tone: 'pen' },
  { id: 'luca', name: 'Luca', lang: 'it', language: 'Italiano', tone: 'marker' },
  { id: 'selin', name: 'Selin', lang: 'tr', language: 'Türkçe', tone: 'plain' },
  { id: 'noor', name: 'Noor', lang: 'en', language: 'English', tone: 'pen' },
]

export const STYLE_LABEL: Record<TeachStyle, string> = {
  pictures: 'Pictures',
  bars: 'Fraction bars',
  steps: 'Worked example',
  number_line: 'Number line',
}

/** The dashboard's view of one student. The engine's GET /api/students/:id returns the same shape. */
export interface StudentSummary {
  id: string
  name: string
  language: string
  langCode: string
  live?: boolean
  sample?: boolean
  flag: 'needs' | 'fixed' | 'ok'
  headline: string
  today: { minutes: number; parts: number; right: number }
  parts: { latex: string; verdict: Verdict; note?: string; time: string }[]
  misconceptions: { id: string; name: string; seen: number; status: 'fixed' | 'working'; styles: TeachStyle[] }[]
  profile: Profile
  next: string[]
  questions: { text: string; lang: string; about?: string; answer: string }[]
  sessions: { when: string; minutes: number; parts: number; right: number }[]
  ai: { localReads: number; bigCalls: number; cost: number }
}

const F = (n: number, d: number) => `\\frac{${n}}{${d}}`

export const sampleSummaries: StudentSummary[] = [
  {
    id: 'noor', name: 'Noor', language: 'English', langCode: 'en', sample: true, flag: 'needs',
    headline: 'Noor wrote 7 lines, 3 right. Scaling only the bottom came back three times. Pictures and fraction bars haven\'t clicked yet: try a worked example, or sit with Noor for five minutes.',
    today: { minutes: 21, parts: 7, right: 3 },
    parts: [
      { latex: `${F(1, 2)}+${F(1, 3)}=${F(2, 6)}`, verdict: 'wrong', note: 'changed the bottom, not the top', time: '15:02' },
      { latex: `${F(1, 4)}+${F(1, 6)}=${F(2, 24)}`, verdict: 'wrong', note: 'changed the bottom, not the top', time: '15:06' },
      { latex: `${F(1, 3)}+${F(1, 3)}=${F(2, 3)}`, verdict: 'correct', time: '15:09' },
    ],
    misconceptions: [{ id: 'no_scaling', name: 'Common bottom, top not scaled', seen: 3, status: 'working', styles: ['pictures', 'bars'] }],
    profile: { pictures: { tries: 1, wins: 0 }, bars: { tries: 2, wins: 0 } },
    next: [`${F(1, 2)}+${F(1, 4)}`, `${F(2, 3)}+${F(1, 6)}`],
    questions: [{ text: 'what do I do with the top?', lang: 'en', about: '1/4 + 1/6', answer: 'When you cut a quarter into smaller pieces, the top grows too.' }],
    sessions: [{ when: 'Today', minutes: 21, parts: 7, right: 3 }, { when: 'Thursday', minutes: 15, parts: 5, right: 3 }],
    ai: { localReads: 7, bigCalls: 1, cost: 0.0004 },
  },
  {
    id: 'luca', name: 'Luca', language: 'Italiano', langCode: 'it', sample: true, flag: 'ok',
    headline: 'Luca wrote 9 lines, all right. Ready for harder problems with bigger bottoms.',
    today: { minutes: 16, parts: 9, right: 9 },
    parts: [{ latex: `${F(3, 4)}+${F(1, 6)}=${F(11, 12)}`, verdict: 'correct', time: '14:40' }],
    misconceptions: [],
    profile: { steps: { tries: 1, wins: 1 } },
    next: [`${F(5, 6)}+${F(3, 8)}`, `${F(2, 9)}+${F(5, 12)}`],
    questions: [],
    sessions: [{ when: 'Today', minutes: 16, parts: 9, right: 9 }],
    ai: { localReads: 9, bigCalls: 0, cost: 0 },
  },
  {
    id: 'mariam', name: 'Mariam', language: 'العربية', langCode: 'ar', sample: true, flag: 'fixed',
    headline: 'Mariam added the tops and the bottoms twice, then it clicked with a worked example.',
    today: { minutes: 19, parts: 6, right: 4 },
    parts: [{ latex: `${F(2, 3)}+${F(1, 6)}=${F(5, 6)}`, verdict: 'correct', time: '16:10' }],
    misconceptions: [{ id: 'adds_across', name: 'Adds the tops and the bottoms', seen: 2, status: 'fixed', styles: ['pictures', 'steps'] }],
    profile: { pictures: { tries: 1, wins: 0 }, steps: { tries: 1, wins: 1 } },
    next: [`${F(3, 4)}+${F(1, 6)}`],
    questions: [],
    sessions: [{ when: 'Today', minutes: 19, parts: 6, right: 4 }],
    ai: { localReads: 6, bigCalls: 0, cost: 0 },
  },
  {
    id: 'selin', name: 'Selin', language: 'Türkçe', langCode: 'tr', sample: true, flag: 'ok',
    headline: 'Selin hasn\'t had a session yet.',
    today: { minutes: 0, parts: 0, right: 0 },
    parts: [], misconceptions: [], profile: {}, next: [], questions: [], sessions: [],
    ai: { localReads: 0, bigCalls: 0, cost: 0 },
  },
  {
    id: 'amara', name: 'Amara', language: 'Français', langCode: 'fr', sample: true, flag: 'ok',
    headline: 'Amara hasn\'t had a session today. Start one from the session page.',
    today: { minutes: 0, parts: 0, right: 0 },
    parts: [], misconceptions: [], profile: {}, next: [], questions: [],
    sessions: [{ when: 'Tuesday', minutes: 22, parts: 7, right: 4 }],
    ai: { localReads: 0, bigCalls: 0, cost: 0 },
  },
]
