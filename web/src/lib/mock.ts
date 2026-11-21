// Sample data for screens the engine doesn't feed yet (teacher area, children on this laptop).
// Every adult screen labels it "Sample data" so nobody quotes these numbers on stage.

import type { Tone } from './types'

export interface Student {
  id: string
  name: string
  lang: string
  language: string
  topic: string
  lastTime: string
  tone: 'pen' | 'marker' | 'plain'
}

/** Children who use this laptop. */
export const students: Student[] = [
  { id: 'amara', name: 'Amara', lang: 'fr', language: 'Français', topic: 'Fractions', lastTime: 'Last time: 4 of 6 right', tone: 'pen' },
  { id: 'luca', name: 'Luca', lang: 'it', language: 'Italiano', topic: 'Fractions', lastTime: 'Last time: 6 of 6 right', tone: 'marker' },
  { id: 'selin', name: 'Selin', lang: 'tr', language: 'Türkçe', topic: 'Equations', lastTime: 'First time here', tone: 'plain' },
  { id: 'noor', name: 'Noor', lang: 'en', language: 'English', topic: 'Fractions', lastTime: 'Last time: 3 of 5 right', tone: 'pen' },
]

export const languages = [
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
  { code: 'it', label: 'Italiano' },
  { code: 'tr', label: 'Türkçe' },
]

export const worksheets = [
  { id: 'fractions-1', label: 'Adding fractions' },
  { id: 'equations-1', label: 'Linear equations' },
]

export const skills = [
  { id: 'same_den', short: 'Same bottom', long: 'Adding with the same bottom' },
  { id: 'common_den', short: 'Common bottom', long: 'Finding a common bottom' },
  { id: 'scale_top', short: 'Scaling the top', long: 'Scaling the top to match' },
  { id: 'simplify', short: 'Simplifying', long: 'Simplifying the answer' },
] as const

export type SkillId = (typeof skills)[number]['id']
export const MASTERED = 95

export interface ClassRow {
  id: string
  name: string
  language: string
  langCode: string
  mastery: Record<SkillId, number>
  focus: { text: string; kind: 'fixed' | 'needs' | 'watching' | 'none' }
  lastSeen: string
}

export const classRows: ClassRow[] = [
  { id: 'amara', name: 'Amara', language: 'Français', langCode: 'fr', mastery: { same_den: 97, common_den: 62, scale_top: 41, simplify: 78 }, focus: { text: 'Fixed: adds tops and bottoms', kind: 'fixed' }, lastSeen: 'Today' },
  { id: 'noor', name: 'Noor', language: 'English', langCode: 'en', mastery: { same_den: 92, common_den: 55, scale_top: 30, simplify: 70 }, focus: { text: 'Needs you: scales only the bottom', kind: 'needs' }, lastSeen: 'Today' },
  { id: 'mariam', name: 'Mariam', language: 'العربية', langCode: 'ar', mastery: { same_den: 70, common_den: 35, scale_top: 20, simplify: 40 }, focus: { text: 'Needs you: adds tops and bottoms', kind: 'needs' }, lastSeen: 'Tuesday' },
  { id: 'selin', name: 'Selin', language: 'Türkçe', langCode: 'tr', mastery: { same_den: 88, common_den: 40, scale_top: 35, simplify: 60 }, focus: { text: 'Watching: keeps the sign', kind: 'watching' }, lastSeen: 'Yesterday' },
  { id: 'jonas', name: 'Jonas', language: 'Deutsch', langCode: 'de', mastery: { same_den: 97, common_den: 81, scale_top: 77, simplify: 85 }, focus: { text: 'Practising', kind: 'none' }, lastSeen: 'Wednesday' },
  { id: 'luca', name: 'Luca', language: 'Italiano', langCode: 'it', mastery: { same_den: 99, common_den: 96, scale_top: 95, simplify: 90 }, focus: { text: 'Ready for harder problems', kind: 'none' }, lastSeen: 'Today' },
]

export const week = { children: 6, time: '3 h 40 min', found: 11, fixed: 7 }

export const needsYou = [
  { id: 'noor', name: 'Noor', text: "Scaled only the bottom three times. The pie pictures haven't helped yet. Try five minutes with paper fraction strips." },
  { id: 'mariam', name: 'Mariam', text: 'Adds tops and bottoms since Tuesday. Her next session opens with a problem that tests it.' },
]

export const commonBugs = [
  { name: 'Adds the tops and the bottoms', children: 7 },
  { name: 'Common bottom, top not scaled', children: 4 },
  { name: 'Whole number added to the top', children: 3 },
  { name: 'Keeps the sign when moving a term', children: 2 },
]

export interface TimelineEntry {
  when: string
  text: string
  tone: Tone
}

export interface ChildMisconception {
  name: string
  status: 'fixed' | 'watching' | 'needs'
  timeline?: TimelineEntry[]
  note?: string
}

export interface ChildDetail {
  misconceptions: ChildMisconception[]
  sessions: { when: string; minutes: number; problems: number; hints: number }[]
}

export const details: Record<string, ChildDetail> = {
  amara: {
    misconceptions: [
      {
        name: 'Adds the tops and the bottoms',
        status: 'fixed',
        timeline: [
          { when: 'Tuesday 14:05', text: 'Wrote 4/6 for 3/4 + 1/2. The library matched it exactly.', tone: 'marker' },
          { when: 'Tuesday 14:07', text: 'Glimpse predicted 3/8 for 2/5 + 1/3, and she wrote 3/8. Confirmed: not a slip.', tone: 'marker' },
          { when: 'Tuesday 14:08', text: 'Saw the pie comparison: 4/6 is smaller than 3/4.', tone: 'pen' },
          { when: 'Thursday 16:20', text: 'Three right in a row with different bottoms.', tone: 'pen' },
        ],
      },
      {
        name: 'Common bottom, top not scaled',
        status: 'watching',
        note: 'Seen once: 2/6 for 1/2 + 1/3. It could still be a slip, so Glimpse rates it 55% likely. Her next session starts with 1/4 + 1/3, where this mistake would give 2/12.',
      },
    ],
    sessions: [
      { when: 'Thursday', minutes: 18, problems: 6, hints: 1 },
      { when: 'Wednesday', minutes: 12, problems: 4, hints: 2 },
      { when: 'Tuesday', minutes: 22, problems: 7, hints: 3 },
    ],
  },
}

export interface LibraryEntry {
  id: string
  name: string
  topic: 'Fractions' | 'Equations' | 'Powers'
  example: string
  wrong: string
  code: string
  hint: string
  hintLang?: string
  seenIn: number
  origin: 'team' | 'ai'
  checkedOn?: number
  pending?: boolean
}

export const library: LibraryEntry[] = [
  {
    id: 'adds_across', name: 'Adds the tops and the bottoms', topic: 'Fractions', example: '3/4 + 1/2', wrong: '4/6',
    code: 'def adds_across(a, b):\n    return Frac(a.num + b.num, a.den + b.den)',
    hint: '« Les morceaux ont-ils la même taille ? »', hintLang: 'fr', seenIn: 7, origin: 'team',
  },
  {
    id: 'no_scaling', name: 'Common bottom, top not scaled', topic: 'Fractions', example: '1/2 + 1/3', wrong: '2/6',
    code: 'def no_scaling(a, b):\n    return Frac(a.num + b.num, a.den * b.den)',
    hint: '"You changed the bottom. What happens to the top?"', seenIn: 4, origin: 'team',
  },
  {
    id: 'whole_on_top', name: 'Whole number added to the top', topic: 'Fractions', example: '2 + 1/3', wrong: '3/3',
    code: 'def whole_on_top(w, f):\n    return Frac(w + f.num, f.den)',
    hint: '"How many thirds are in one whole?"', seenIn: 3, origin: 'ai', checkedOn: 5,
  },
  {
    id: 'keeps_sign', name: 'Keeps the sign when moving a term', topic: 'Equations', example: '2x + 3 = 7', wrong: '2x = 10',
    code: 'def keeps_sign(a, b, c):  # ax + b = c\n    return (a, c + b)       # should be c - b',
    hint: '"Take 3 away from both sides."', seenIn: 2, origin: 'team',
  },
  {
    id: 'divide_first_term', name: 'Divides only the first term', topic: 'Equations', example: '2x + 6 = 10, divided by 2,', wrong: 'x + 6 = 5',
    code: 'def divide_first_term(a, b, c, k):\n    return (a / k, b, c / k)',
    hint: '"Share both sides out fairly, every piece."', seenIn: 1, origin: 'ai', checkedOn: 6,
  },
  {
    id: 'base_times_power', name: 'Multiplies the base by the power', topic: 'Powers', example: '2³', wrong: '6',
    code: 'def base_times_power(b, n):\n    return b * n',
    hint: '', seenIn: 1, origin: 'ai', checkedOn: 4, pending: true,
  },
]

export const cascade = [
  { label: 'Camera frames', detail: '30 a second, never stored', count: 108000, tone: 'grey' },
  { label: 'Frames looked at', detail: '5 a second, plain image processing', count: 18000, tone: 'grey' },
  { label: 'Frames with new ink', detail: 'the pen wrote something', count: 240, tone: 'grey' },
  { label: 'Lines read on this laptop', detail: 'small handwriting model, free', count: 62, tone: 'pen' },
  { label: 'Lines the child confirmed', detail: '"Did you write 4/6?"', count: 4, tone: 'pen' },
  { label: 'Sent to a big model', detail: 'only the cropped line, never the frame', count: 2, tone: 'marker' },
] as const

export const cost = {
  naive: { label: 'A 4K frame to a big model every 2 seconds', perHour: 14.4, calls: 1800 },
  glimpse: { label: 'Glimpse', perHour: 0.01, calls: 2 },
}

export const latency = [
  { label: 'Spot and crop the line', ms: 15, color: '#9aa3b2' },
  { label: 'Read the handwriting', ms: 320, color: '#2452cc' },
  { label: 'Check and find the bug', ms: 14, color: '#12141a' },
  { label: 'Draw the circle', ms: 40, color: '#e8620f' },
  { label: 'Start speaking', ms: 250, color: '#7e93c9' },
]

export const escalations = [
  { time: '14:02', step: 'Reading', why: 'Small model only 61% sure', sent: 'One cropped line, 512 by 128 px', tokens: 312, cost: 0.0004, result: "Read 4/6, matched the child's answer", good: false },
  { time: '14:31', step: 'Finding the bug', why: 'No match in the library', sent: 'Problem and two written steps, as text', tokens: 1204, cost: 0.0021, result: 'New bug, reproduced on 4 of 4 problems', good: true },
]
