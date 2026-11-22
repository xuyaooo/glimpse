// Reading the line the child just finished, from one camera frame (sent by the browser).
//
//   1. Find the paper (lib/paperDetect.js). If none is found, use the frame Glimpse asks the
//      child to put the sheet in (web/src/lib/geometry.ts: A4, centred, 86 % of the height).
//   2. Flatten it, and find the lines of writing (lib/layout.js). Lines are kept apart, but a
//      stacked fraction (top, bar, bottom) stays one line.
//   3. The new line = the lowest one that doesn't overlap a line already read.
//   4. Read it with the OCR model, and map its outline back onto the video (`box`).
import { decodeJpeg, resizeRgba, rotateRgba, cropToDataUrl, toJpegBase64 } from '../images.js'
import { detectPaper } from '../vision/paperDetect.js'
import { flatSize, warpQuad, computeHomography, applyHomography } from '../vision/paper.js'
import { findBlocks, toGray } from '../vision/layout.js'
import { complete, isLayoutParsing, layoutParse, roleConfig } from '../llm.js'
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

// A cloud vision model reads the whole page the way GLM-OCR does: one line of the page per line,
// maths in $...$. (It used to be asked for "one line", from when single lines were cut out: given
// a whole sheet, it ran every exercise together on one line.)
const OCR_PROMPT_GENERIC =
  'Transcribe everything written on this page, top to bottom, exactly as written: one line of the page per line of your output, maths in LaTeX between $...$ (fractions as \\frac{a}{b}). Keep labels like "a)" or "3.". Do not correct, simplify or solve anything, and never add an answer that is not written. Output only the transcription.'

// Z.ai's GLM-OCR answers in Markdown: headings, pictures and HTML tables become plain lines
// (a table's cells one per line), like the local GLM-OCR's text.
// A line's maths written plainly, whichever GLM-OCR read it (the cloud one spaces it out):
// a label inside the maths goes before it ("$$5) 8 + 8 = 61$$" -> "5) $$8 + 8 = 61$$"), and
// "1 2" is 12 (LaTeX ignores that space), "\frac {" is "\frac{".
export function tidyMath(line) {
  return String(line)
    .replace(/^(\$+)\s*(\(?(?:[a-z]|\d{1,2})[).:])\s*/i, '$2 $1')
    .replace(/(\${1,2})([^$]+)\1/g, (_m, d, body) => `${d}${body.replace(/\\(frac|sqrt)\s+\{/g, '\\$1{').replace(/(\d)\s+(?=\d)/g, '$1').trim()}${d}`)
}

export function markdownLines(md) {
  return String(md || '')
    .replace(/<\/(?:td|th|tr|p|div|li)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .split('\n')
    .map((l) => l.replace(/^\s{0,3}#{1,6}\s+/, '').replace(/^\s*[-*]\s+(?=\S)/, '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/[ \t]{2,}/g, ' ').trim())
    .join('\n')
}

export async function ocrImage(base64, maxTokens = 600) {
  const cfg = roleConfig('ocr')
  if (isLayoutParsing(cfg)) {
    const out = await layoutParse('ocr', base64)
    return { text: normalizeOcrMath(markdownLines(out.text)), model: out.model, ms: out.ms }
  }
  const { model } = cfg
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
  for (const l of lines.map(closeMath)) if (out[out.length - 1] !== l) out.push(l)
  return out
}
// A maths "$" the OCR opened and never closed (seen live at the end of the page: "f) $15 - 6 =")
// is closed at the end of the line, when what follows it is maths (not "it costs $5 each").
function closeMath(line) {
  const singles = [...line.matchAll(/(?<![\\$])\$(?!\$)/g)]
  if (singles.length % 2 === 0) return line
  const tail = line.slice(singles.at(-1).index + 1)
  return /\d|\\[a-z]/.test(tail) && !/[a-z]{3,}/i.test(tail.replace(/\\[a-z]+/gi, '')) ? `${line.trimEnd()}$` : line
}

// ---------- sums written in columns ----------
//
// A sum worked in columns (34, then "+ 25" under it, a bar, 59 below) comes from GLM-OCR in
// pieces: on lines of their own ("34" / "+ 25" / "59"), as a fraction ("34" / "\frac{+25}{59}",
// the bar read as a fraction bar) or as an array. Each becomes one exercise, "34 + 25 = 59" (or
// "34 + 25 =" while it has no answer), with its label ("a)") kept, so a sheet mixing column sums
// and sums on a line is checked exercise by exercise.
const COL_NUM = /^\d+(?:[.,]\d+)?$/
const COL_OP = String.raw`\+|-|−|–|×|x|X|\*|·|\\times|\\cdot`
const OP_LINE = new RegExp(String.raw`^(${COL_OP})\s*(\d+(?:[.,]\d+)?)$`)
const FRAC_OP = new RegExp(String.raw`^\\frac\{\s*(${COL_OP})\s*(\d+(?:[.,]\d+)?)\s*\}\{\s*(\d+(?:[.,]\d+)?)?\s*\}$`)
const BAR = /^(?:[-_—–=]{2,}|\\hline|\\rule\{[^}]*\}\{[^}]*\})$/
/** An exercise's label as the sheet writes it: "a)", "(b)", "3.", "4)", "c:". */
export const LABEL = /^\(?(?:[a-z]|\d{1,2})[).:]\s+|^\(?(?:[a-z]|\d{1,2})\)/i
const LABEL_ONLY = /^\(?(?:[a-z]|\d{1,2})[).:]$/i
// a line without its maths markers ($, $$, \( \)) or spaces at the ends
const bare = (l) => String(l).trim().replace(/^\$+|\$+$/g, '').replace(/^\\\(|\\\)$/g, '').trim()
const opTex = (o) => (o === '+' ? '+' : /^[-−–]$/.test(o) ? '-' : '\\times')
// \frac{A}{B} split into A and B (nested braces counted), or null
function fracParts(t) {
  const m = /^\\frac\s*/.exec(t)
  if (!m) return null
  const parts = []
  let i = m[0].length
  for (let k = 0; k < 2; k++) {
    while (t[i] === ' ') i++
    if (t[i] !== '{') return null
    let depth = 0
    const start = i
    for (; i < t.length; i++) {
      if (t[i] === '{') depth++
      else if (t[i] === '}' && --depth === 0) break
    }
    if (depth !== 0) return null
    parts.push(t.slice(start + 1, i).trim())
    i++
  }
  return t.slice(i).trim() ? null : parts
}
// "\frac{\frac{34}{+25}}{59}" (a column sum read as fractions, bar by bar) -> rows 34, +25, 59
function fracRows(t) {
  const p = fracParts(t)
  return p ? [...(fracRows(p[0]) ?? [p[0]]), ...(fracRows(p[1]) ?? [p[1]])] : null
}
// rows of an array/aligned block ("\begin{array}{r} 34 \\ +25 \\ \hline 59 \end{array}") as lines
function arrayRows(line, cloud = false) {
  const lm = cloud && String(line).trim().match(LABEL)
  const bars = cloud ? fracRows(bare(lm ? String(line).trim().slice(lm[0].length) : line).replace(/\s+/g, ' ')) : null
  // a fraction with an operator row inside is a column sum (a plain 3/4 stays a fraction)
  if (bars && bars.length >= 3 && bars.every((r) => COL_NUM.test(r.replace(/\s/g, '')) || OP_LINE.test(r.replace(/\s+/g, ' ').replace(/^([+\-−–×*·])\s*/, '$1')))) {
    const clean = bars.map((r) => r.replace(/\s/g, ''))
    return [`${lm ? lm[0] : ''}${clean[0]}`, ...clean.slice(1)]
  }
  const m = bare(line).match(/^\\begin\{(array|aligned|matrix)\}(?:\{[^}]*\})?([\s\S]*)\\end\{\1\}$/)
  if (!m) return [line]
  const rows = m[2].split(/\\\\|\\hline/).map((r) => r.replace(/&/g, '').trim()).filter(Boolean)
  return rows.length >= 2 && rows.every((r) => COL_NUM.test(r) || OP_LINE.test(r)) ? rows : [line]
}
/** The OCR lines, with every sum written in columns joined into one line. cloud: the cloud
 * GLM-OCR's shapes too (labels alone on a line, column sums as nested fractions); the local
 * GLM-OCR's reading is left as it was. */
export function joinColumnSums(lines, { cloud = false } = {}) {
  const rows = (cloud ? joinLabels(lines) : lines).flatMap((l) => arrayRows(l, cloud))
  const opAt = (k) => k < rows.length && (OP_LINE.test(bare(rows[k])) || FRAC_OP.test(bare(rows[k])))
  // a number followed by an operator line starts a column sum
  const startsSum = (k) => k < rows.length && COL_NUM.test(bare(rows[k])) && opAt(k + 1)
  const out = []
  for (let i = 0; i < rows.length; i++) {
    let label = ''
    let at = i
    // a label on a line of its own ("a)") goes with the sum under it
    if (LABEL_ONLY.test(bare(rows[i])) && i + 1 < rows.length && COL_NUM.test(bare(rows[i + 1])) && opAt(i + 2)) {
      label = `${bare(rows[i])} `
      at = i + 1
    }
    let first = rows[at].trim()
    const lm = !label && first.match(LABEL)
    if (lm) {
      label = lm[0].endsWith(' ') ? lm[0] : `${lm[0]} `
      first = first.slice(lm[0].length)
    }
    const top = bare(first)
    if (!COL_NUM.test(top) || !opAt(at + 1)) {
      out.push(rows[i])
      continue
    }
    const terms = [top]
    let op = null
    let result = null
    let j = at + 1
    let closed = false
    while (j < rows.length) {
      const b = bare(rows[j])
      const fm = b.match(FRAC_OP)
      if (fm && (!op || opTex(fm[1]) === op)) {
        op = opTex(fm[1])
        terms.push(fm[2])
        result = fm[3] ?? null
        closed = true
        j++
        break
      }
      const om = b.match(OP_LINE)
      if (!om || (op && opTex(om[1]) !== op)) break
      op = opTex(om[1])
      terms.push(om[2])
      j++
    }
    if (!closed) {
      if (j < rows.length && BAR.test(bare(rows[j]))) j++
      // the answer under the bar (not the top number of the next sum)
      if (j < rows.length && COL_NUM.test(bare(rows[j])) && !startsSum(j)) result = bare(rows[j++])
      // long multiplication: the partial products, then the total (the last number)
      while (op === '\\times' && result != null && j < rows.length && (COL_NUM.test(bare(rows[j])) || BAR.test(bare(rows[j]))) && !startsSum(j)) {
        if (COL_NUM.test(bare(rows[j]))) result = bare(rows[j])
        j++
      }
    }
    out.push(`${label}$${terms.join(` ${op} `)} =${result != null ? ` ${result}` : ''}$`)
    i = j - 1
  }
  return out
}
// ---------- a sentence written over two lines ----------
// "How long does it take to drive" / "150 km at 60 km/h?" is one question: GLM-OCR gives each
// written line on its own, and half a question can't be checked or solved. Joined only when the
// first part is an unfinished sentence (3+ words, no maths, no full stop) and the second carries
// on (a small letter or a number first, no "=") and ends the sentence, or the first ends on a
// word like "to" or "at". A heading ("Exercise Sheet") never joins the sum under it.
const CARRIES_ON = /\b(?:to|at|of|the|a|an|in|on|for|and|or|with|from|by|is|are|was|has|have|does|do|if|than|into|per)$/i
export function joinWrappedLines(lines) {
  const out = []
  for (const line of lines) {
    const a = out[out.length - 1]
    const b = String(line).trim()
    const textA = a && !/[$=\\]/.test(a) && !/[.?!:;]\s*$/.test(a) && a.trim().split(/\s+/).length >= 3 && /[a-z]{2}/i.test(a)
    const goesOn = textA && !b.includes('=') && /^\$?\s*[a-z0-9]/.test(b) && (/[?.!]\s*\$?$/.test(b) || CARRIES_ON.test(a.trim()))
    if (goesOn) out[out.length - 1] = `${a.trim()} ${b}`
    else out.push(line)
  }
  return out
}

/** A label alone on its line ("1)") goes with the exercise under it: "1) $3 + 4 = 7$". */
export function joinLabels(lines) {
  const out = []
  for (let i = 0; i < lines.length; i++) {
    const l = String(lines[i]).trim()
    const next = lines[i + 1]
    if (LABEL_ONLY.test(bare(l)) && next != null && !LABEL_ONLY.test(bare(next)) && !String(next).trim().match(LABEL)) {
      out.push(`${bare(l)} ${String(next).trim()}`)
      i++
    } else out.push(lines[i])
  }
  return out
}

/** A page read bottom to top (seen with the cloud GLM-OCR on a sheet upside down): its labels go
 * 6, 5, 4... The lines are put back in order when 3 or more labels all go down. */
export function inReadingOrder(lines) {
  const labels = lines.map((l) => String(l).trim().match(/^\(?(\d{1,2})[).:]/)?.[1]).filter(Boolean).map(Number)
  const down = labels.length >= 3 && labels.every((n, i) => i === 0 || n < labels[i - 1])
  return down ? [...lines].reverse() : lines
}

/** A column sum the OCR squashed into a division ("a) 34 ÷ 59": the second number and the bar lost). */
export function squashedColumn(line) {
  const t = String(line).trim().replace(LABEL, '')
  return /^\$?\s*\d+\s*(?:\\div|÷)\s*\d+\s*\$?$/.test(t) || /^\$?\s*\\frac\{\s*[+\-−×]/.test(t)
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
  // the cloud GLM-OCR (Z.ai) only: its own way of writing the page is put right; the local
  // GLM-OCR's reading is used as it always was
  const cloud = isLayoutParsing(roleConfig('ocr'))
  const linesOf = (text) =>
    cloud ? inReadingOrder(joinWrappedLines(joinColumnSums(cleanOcrLines(text).map(tidyMath), { cloud }))) : joinWrappedLines(joinColumnSums(cleanOcrLines(text)))
  let lines = linesOf(ocr.text)
  let ms = ocr.ms
  let reread = null
  // The cloud GLM-OCR (Z.ai) reads a sheet lying sideways as (almost) nothing, where the local one
  // reads it: the whole frame (never cut) is read again a quarter turn each way, the best kept.
  if (cloud && lines.length < 2) {
    try {
      const img = decodeJpeg(frame)
      for (const turns of [1, 3]) {
        const again = await ocrImage(toJpegBase64(rotateRgba(img, turns), 90), 800)
        ms += again.ms
        const turned = linesOf(again.text)
        if (turned.length > lines.length) {
          lines = turned
          reread = again.text
        }
        if (lines.length >= 3) break
      }
    } catch {
      // keep the first read
    }
  }
  // A column sum squashed into "34 ÷ 59": the whole frame is read once more, smaller (still the
  // whole frame: seen on test sheets, the smaller read keeps each number of a column on its line).
  const squashed = lines.filter(squashedColumn).length
  if (squashed) {
    try {
      const img = decodeJpeg(frame)
      const again = await ocrImage(toJpegBase64(resizeRgba(img, Math.round(Math.max(img.width, img.height) * 0.6)), 90), 800)
      const lines2 = linesOf(again.text)
      ms += again.ms
      reread = again.text
      if (lines2.filter(squashedColumn).length < squashed && lines2.length >= lines.length) lines = lines2
    } catch {
      // keep the first read
    }
  }
  await saveDebug(frame, { ocr: ocr.text, ocrMs: ocr.ms, ...(reread != null ? { reread } : {}), lines })
  return { image: b64, text: lines.join('\n'), lines, ocrMs: ms, page: { lines: lines.map(toSegments), ms } }
}
