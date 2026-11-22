// Reading the line the child just finished, from one camera frame (sent by the browser).
//
//   1. Find the paper (lib/paperDetect.js). If none is found, use the frame Glimpse asks the
//      child to put the sheet in (web/src/lib/geometry.ts: A4, centred, 86 % of the height).
//   2. Flatten it, and find the lines of writing (lib/layout.js). Lines are kept apart, but a
//      stacked fraction (top, bar, bottom) stays one line.
//   3. The new line = the lowest one that doesn't overlap a line already read.
//   4. Read it with the OCR model, and map its outline back onto the video (`box`).
import { decodeJpeg, resizeRgba, cropToDataUrl, toJpegBase64 } from '../images.js'
import { detectPaper } from '../vision/paperDetect.js'
import { flatSize, warpQuad, computeHomography, applyHomography } from '../vision/paper.js'
import { findBlocks, toGray } from '../vision/layout.js'
import { complete, roleConfig } from '../llm.js'
import { normalizeOcrMath } from '../ocrText.js'
import { toPlain } from './maths.js'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Locally (not on Vercel; turn off with ENGINE_DEBUG=0), every frame the browser sends is
// saved with what the reader saw, to debug the live "lift your pencil" reading:
//   debug-frames/engine/<time>.jpg (frame), <time>-line.jpg (what was OCR'd), <time>.json
const DEBUG_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'debug-frames', 'engine')
const DEBUG = !process.env.VERCEL && process.env.ENGINE_DEBUG !== '0'
async function saveDebug(frame, info, lineCrop) {
  if (!DEBUG) return
  try {
    await mkdir(DEBUG_DIR, { recursive: true })
    const name = new Date().toISOString().replace(/[:.]/g, '-')
    await writeFile(path.join(DEBUG_DIR, `${name}.jpg`), frame)
    if (lineCrop) await writeFile(path.join(DEBUG_DIR, `${name}-line.jpg`), Buffer.from(lineCrop.slice(lineCrop.indexOf(',') + 1), 'base64'))
    await writeFile(path.join(DEBUG_DIR, `${name}.json`), JSON.stringify(info, null, 1))
  } catch {
    // debugging only
  }
}

const UNIT = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
]

// Where Glimpse tells the child to put the sheet (normalized to the frame).
export function expectedSheet(vw, vh) {
  const h = vh * 0.86
  const w = h * (210 / 297)
  const x = (vw - w) / 2
  const y = vh * 0.07
  return [
    [x / vw, y / vh],
    [(x + w) / vw, y / vh],
    [(x + w) / vw, (y + h) / vh],
    [x / vw, (y + h) / vh],
  ]
}

const OCR_PROMPT_GENERIC =
  'Transcribe the handwritten maths in this image exactly as written, on one line. Write fractions as \\frac{a}{b}. Do not correct, simplify or solve anything. Output only the transcription.'

export async function ocrImage(base64, maxTokens = 600) {
  const { model } = roleConfig('ocr')
  const prompt = /glm-ocr/i.test(model) ? 'Text Recognition:' : OCR_PROMPT_GENERIC
  const out = await complete('ocr', { messages: [{ role: 'user', content: prompt, images: [base64] }], maxTokens, temperature: 0 })
  return { text: normalizeOcrMath(out.text), model: out.model, ms: out.ms }
}
export const ocrLine = (base64) => ocrImage(base64, 300)

// Lines are compared by their maths, ignoring spacing and formatting.
export const lineKey = (text) => (toPlain(text) || String(text)).replace(/\s+/g, '').toLowerCase()
// A line worth reading: digits plus an operator, an equals sign or a fraction
// (skips the printed sheet's header, slot numbers and stray marks).
const isMathLine = (t) => /\d/.test(t) && /[+\-=×÷*/]|\\frac|\\times|\\div/.test(t)

// A line of OCR text as pieces of text and maths, for the page transcript:
// "Solve: $2x+5=11$" -> [{ t: 'text', v: 'Solve: ' }, { t: 'math', v: '2x+5=11' }]
// Maths is $...$, $$...$$, \(...\) or \[...\]; an escaped \$ is a dollar sign ("Tom has \$5").
// One scan, linear time: a delimiter that never closes is searched for only once.
const OPENERS = [
  ['$$', '$$'],
  ['$', '$'],
  ['\\(', '\\)'],
  ['\\[', '\\]'],
]
export function toSegments(line) {
  const s = String(line)
  const out = []
  const missing = new Set() // closers not found after some point (so not after any later one)
  const closeAt = (close, from) => {
    if (missing.has(close)) return -1
    const j = s.indexOf(close, from)
    if (j < 0) missing.add(close)
    return j
  }
  let text = ''
  let i = 0
  while (i < s.length) {
    if (s[i] === '\\' && (s[i + 1] === '\\' || s[i + 1] === '$')) {
      text += s[i + 1] === '$' ? '$' : '\\\\'
      i += 2
      continue
    }
    let found = false
    for (const [open, close] of OPENERS) {
      if (!s.startsWith(open, i)) continue
      const j = closeAt(close, i + open.length + 1) // at least one character inside
      if (j < 0) continue
      const v = s.slice(i + open.length, j)
      if (open === '$' && v.includes('$')) continue
      if (text) out.push({ t: 'text', v: text })
      text = ''
      out.push({ t: 'math', v: v.trim() })
      i = j + close.length
      found = true
      break
    }
    if (found) continue
    text += s[i]
    i += 1
  }
  if (text) out.push({ t: 'text', v: text })
  return out.filter((x) => x.v.trim())
}

// Text inside \text{...}: KaTeX's special characters escaped, and symbols that only work in
// maths mode (∫, ≠, ∑...) put outside the \text, so the learner's line always renders.
const TEXT_ESCAPE = { '#': '\\#', $: '\\$', '%': '\\%', '&': '\\&', _: '\\_', '^': '\\textasciicircum{}', '~': '\\textasciitilde{}' }
const MATH_ONLY = /(?:(?![\x00-\x7f])[\p{Sm}‼ℋℌℐℒℛℨℬℭℰℱℳ⌜⌝⌞⌟⟦⟧⦃⦄])+/gu
const textPart = (t) => (t ? `\\text{${t.replace(/[#$%&_^~]/g, (c) => TEXT_ESCAPE[c])}}` : '')
function textTex(v) {
  const t = v
    .normalize('NFC')
    .replace(/[{}\\\u0300-\u036f]/g, '') // braces, backslashes, accents with nothing to sit on
    .replace(/[\u2028\u2029]/g, ' ')
  let out = ''
  let last = 0
  for (const m of t.matchAll(MATH_ONLY)) {
    out += `${textPart(t.slice(last, m.index))} ${m[0]} `
    last = m.index + m[0].length
  }
  return (out + textPart(t.slice(last))).trim()
}

// The LaTeX inside a line, without $, $$, \( \) markers (for display as one formula).
export const stripMath = (line) =>
  toSegments(line)
    .map((x) => (x.t === 'math' ? x.v : textTex(x.v)))
    .join(' ')

// A display block written over several lines ("$$", "\frac{1}{2}+...", "$$") -> one line each
// formula, so its maths stays maths once the lines are split.
const odd$$ = (l) => (l.split('$$').length - 1) % 2 === 1
const FENCE = new Set(['$$', '\\[', '\\]'])
function displayBlock(block) {
  const fenced = FENCE.has(block[0]) && FENCE.has(block.at(-1))
  const inner = fenced ? block.slice(1, -1) : block
  if (!inner.length) return []
  if (fenced && inner.length > 1 && !inner.some((l) => /\\begin|\\end|\\\\$/.test(l))) {
    return inner.map((l) => (l.includes('$') ? l : `$$${l}$$`)) // separate formulas, one per line
  }
  return [fenced ? `$$${inner.join(' ')}$$` : inner.join(' ')]
}

// OCR models can loop on an empty picture (seen live: "S" repeated 300+ times when the
// camera pointed at the desk, or "$S$ $S$ ..." on one line). Repetitive output = nothing
// written; repeated lines collapse. GLM-OCR's markdown fences ("```markdown", "```") go too.
const REPEATED_TOKEN = /^(.{1,8}?)(?:\s*\1){19,}$/
export function cleanOcrLines(text) {
  const raw = String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^```[\w-]*$/.test(l))
  const all = []
  for (let i = 0; i < raw.length; i++) {
    const l = raw[i]
    const opens = l === '$$' || l === '\\[' || (l.startsWith('$$') && odd$$(l))
    const closes = (x) => (l === '\\[' ? x === '\\]' : x === '$$' || (x.endsWith('$$') && odd$$(x)))
    const end = opens ? raw.findIndex((x, j) => j > i && closes(x)) : -1
    if (end > i) {
      all.push(...displayBlock(raw.slice(i, end + 1)))
      i = end
    } else if (!FENCE.has(l) && !REPEATED_TOKEN.test(l)) all.push(l)
  }
  let lines = all
  if (all.length >= 12 && new Set(all).size / all.length < 0.25) {
    // the model looped: drop the lines it repeated, keep what it read before
    const count = new Map()
    for (const l of all) count.set(l, (count.get(l) || 0) + 1)
    lines = all.filter((l) => count.get(l) < 4)
  }
  const out = []
  for (const l of lines) if (out[out.length - 1] !== l) out.push(l)
  return out
}

// frame: JPEG bytes. readKeys: lineKey() of the lines already read. prevQuad: last paper outline.
// Like the earlier app, GLM-OCR reads the WHOLE flattened page (full context reads better
// than a cut-out line); the new line is the one whose text wasn't there before. The
// layout's line boxes are only used to place the tick / circle on the video.
// Returns { found: false } or { found: true, text, key, box, pageBox, quad }.
export async function readNewLine(frame, { readKeys = [], prevQuad = null } = {}) {
  const img = decodeJpeg(frame)
  const small = resizeRgba(img, 320)
  const prev = prevQuad?.map(([x, y]) => [x * small.width, y * small.height])
  const det = detectPaper(small.data, small.width, small.height, prev ? { prev } : {})
  const quad = det ? det.quad.map(([x, y]) => [x / small.width, y / small.height]) : expectedSheet(img.width, img.height)
  const quadPx = quad.map(([x, y]) => [x * img.width, y * img.height])
  const size = flatSize(quadPx, 1600)
  const page = warpQuad(img, quadPx, size.width, size.height)

  // 1. read the whole page
  const ocr = await ocrImage(toJpegBase64(page, 90))
  const allLines = cleanOcrLines(ocr.text)
  const textLines = allLines.filter(isMathLine)
  const pageText = { lines: allLines.map(toSegments), ms: ocr.ms, paperFound: Boolean(det) }

  // 2. the new line(s): not read before (a line written twice counts twice)
  const remaining = [...readKeys]
  const fresh = []
  textLines.forEach((t, index) => {
    const key = lineKey(t)
    const j = remaining.indexOf(key)
    if (j >= 0) remaining.splice(j, 1)
    else fresh.push({ text: t, key, index })
  })

  // layout lines, top to bottom, to place the outline
  const thumb = resizeRgba(page, 900)
  const gray = toGray(thumb.data, thumb.width, thumb.height)
  const { blocks } = findBlocks(gray, thumb.width, thumb.height, { gapFactor: 0.6 })
  const lines = blocks
    .map((b) => ({ x0: b.x0 / thumb.width, y0: b.y0 / thumb.height, x1: (b.x1 + 1) / thumb.width, y1: (b.y1 + 1) / thumb.height }))
    .filter((b) => b.x1 - b.x0 > 0.04 && b.y1 - b.y0 > 0.01)
    .sort((a, b) => a.y0 - b.y0)

  const info = { frame: [img.width, img.height], paperFound: Boolean(det), paperScore: det?.score, quad, ocr: ocr.text, ocrMs: ocr.ms, textLines, readKeys, fresh, layoutLines: lines.length }
  if (!fresh.length) {
    await saveDebug(frame, { ...info, result: 'no new line' })
    return { found: false, quad, page: pageText }
  }
  const pick = fresh[fresh.length - 1]

  // 3. outline: the layout line at the same position (by order) as the OCR line
  let pageBox = null
  let frameBox
  if (lines.length) {
    const idx =
      lines.length === textLines.length ? pick.index : Math.round((pick.index * (lines.length - 1)) / Math.max(1, textLines.length - 1))
    const l = lines[Math.min(lines.length - 1, Math.max(0, idx))]
    const pad = 0.012
    pageBox = { x0: Math.max(0, l.x0 - pad), y0: Math.max(0, l.y0 - pad), x1: Math.min(1, l.x1 + pad), y1: Math.min(1, l.y1 + pad) }
    const H = computeHomography(UNIT, quad)
    const corners = [
      [pageBox.x0, pageBox.y0],
      [pageBox.x1, pageBox.y0],
      [pageBox.x1, pageBox.y1],
      [pageBox.x0, pageBox.y1],
    ].map((p) => applyHomography(H, p))
    const xs = corners.map((c) => c[0])
    const ys = corners.map((c) => c[1])
    const fx = Math.max(0, Math.min(...xs))
    const fy = Math.max(0, Math.min(...ys))
    frameBox = [fx, fy, Math.min(1, Math.max(...xs)) - fx, Math.min(1, Math.max(...ys)) - fy]
  }
  const crop = pageBox
    ? cropToDataUrl(page, { x0: pageBox.x0 * page.width, y0: pageBox.y0 * page.height, x1: pageBox.x1 * page.width, y1: pageBox.y1 * page.height }).dataUrl
    : null
  await saveDebug(frame, { ...info, chosen: pick, pageBox, frameBox }, crop)
  return { found: true, text: pick.text, key: pick.key, box: frameBox, pageBox, quad, paperFound: Boolean(det), crop, page: pageText }
}

export { toJpegBase64 }

// ---------------------------------------------------------------- whole-frame reading
// What the app does on each pencil lift: the WHOLE camera frame, as the browser sent it (never
// cropped), goes to GLM-OCR; then the frame + the OCR text go to the tutor LLM (session.js).
export async function readFrame(frame) {
  const b64 = Buffer.from(frame).toString('base64')
  const ocr = await ocrImage(b64, 800)
  const lines = cleanOcrLines(ocr.text)
  await saveDebug(frame, { ocr: ocr.text, ocrMs: ocr.ms, lines })
  return { image: b64, text: lines.join('\n'), lines, ocrMs: ocr.ms, page: { lines: lines.map(toSegments), ms: ocr.ms } }
}
