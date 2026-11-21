// Where things are on the sheet, shared by the camera overlay, the line crops and the
// printable sheet (/worksheet). Rects are in the video's own pixels (vw × vh).

export const SHEET_ASPECT = 210 / 297 // A4, portrait
export const SLOTS = 6
const SLOT_TOP = 0.11 // fractions of the sheet's height
const SLOT_STEP = 0.13
const SLOT_HEIGHT = 0.115

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** The frame the paper should sit in: centred, 86 % of the picture's height. */
export function sheetRect(vw: number, vh: number): Rect {
  const h = vh * 0.86
  const w = h * SHEET_ASPECT
  return { x: (vw - w) / 2, y: vh * 0.07, w, h }
}

/** The writing line for a part. Line 7 starts again at the top of a fresh sheet. */
export function slotRect(sheet: Rect, partId: number): Rect {
  const i = (partId - 1) % SLOTS
  return { x: sheet.x + sheet.w * 0.06, y: sheet.y + sheet.h * (SLOT_TOP + i * SLOT_STEP), w: sheet.w * 0.88, h: sheet.h * SLOT_HEIGHT }
}

/** The free desk to the right of the paper, where the tutor draws. */
export function deskRect(vw: number, vh: number, sheet: Rect): Rect {
  const x = sheet.x + sheet.w + vw * 0.025
  return { x, y: vh * 0.07, w: Math.max(0, vw - x - vw * 0.02), h: vh * 0.86 }
}

/** The same fractions, for the printed sheet (as percentages of the page). */
export const printedSlots = Array.from({ length: SLOTS }, (_, i) => ({ top: (SLOT_TOP + i * SLOT_STEP) * 100, height: SLOT_HEIGHT * 100 }))

export const pct = (v: number, of: number) => `${(v / of) * 100}%`
