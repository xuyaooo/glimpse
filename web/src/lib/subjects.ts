// The subjects a child can pick on the desk ("Choose a practice").
// Only maths has a demo script; the engine is told which subject the child picked.

export type SubjectId = 'maths' | 'reading' | 'science'

export interface Subject {
  id: SubjectId
  name: string
  /** What's in it, shown under the name. */
  blurb: string
  /** Today's topic, shown on "Continue today's work" and in the breadcrumb. */
  topic: string
  /** Icon tile colour. */
  bg: string
  /** Row colour on Home. */
  tint: string
  /** White line icon, 24×24. */
  icon: string
}

export const SUBJECTS: Subject[] = [
  {
    id: 'maths',
    name: 'Maths',
    blurb: 'Numbers, fractions, geometry',
    topic: 'Adding fractions',
    bg: 'linear-gradient(160deg,#ff9b54,#f26b1d)',
    tint: 'linear-gradient(90deg,#fff3e8,#ffe7d4)',
    icon: 'M7 3h10a1.5 1.5 0 0 1 1.5 1.5v15A1.5 1.5 0 0 1 17 21H7a1.5 1.5 0 0 1-1.5-1.5v-15A1.5 1.5 0 0 1 7 3zM8.5 6h7v3h-7zM9 13h.01M12 13h.01M15 13h.01M9 17h.01M12 17h.01M15 17h.01',
  },
  {
    id: 'reading',
    name: 'Reading',
    blurb: 'Comprehension, vocabulary',
    topic: 'Reading questions',
    bg: 'linear-gradient(160deg,#a68bff,#6d4bdf)',
    tint: 'linear-gradient(90deg,#f5f0ff,#ebe2ff)',
    icon: 'M12 6.5C10 5 7 4.6 3.5 5v13c3.5-.4 6.5 0 8.5 1.5 2-1.5 5-1.9 8.5-1.5V5C17 4.6 14 5 12 6.5zM12 6.5v13',
  },
  {
    id: 'science',
    name: 'Science',
    blurb: 'Life, earth, materials',
    topic: 'Materials',
    bg: 'linear-gradient(160deg,#3cc48a,#1d9560)',
    tint: 'linear-gradient(90deg,#eaf9f0,#dbf4e6)',
    icon: 'M9.5 3h5M10.5 3v6.2L5.3 18a2 2 0 0 0 1.7 3h10a2 2 0 0 0 1.7-3l-5.2-8.8V3M7.6 14.5h8.8',
  },
]

export const subjectById = (id: SubjectId) => SUBJECTS.find((s) => s.id === id) ?? SUBJECTS[0]
