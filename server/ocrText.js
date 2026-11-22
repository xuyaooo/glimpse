// Clean up GLM-OCR text output.
//
// GLM-OCR usually writes math as $...$ inside text ("Solve: $2x+5=11$"), but a line that
// is ONLY math may come back bare ("x^{2}+3x-4=0"; seen with Ollama 0.40). Bare math
// would show up as raw LaTeX, so such lines are wrapped in $...$. Lines of words
// ("Homework 3", "Area = 50 cm") are left alone.

const LATEX_MARKERS = /\\[a-zA-Z]+|\^|_\{|_[0-9a-zA-Z]/
const MATHY_CHARS = /^[\s0-9a-zA-Z+\-*/=().,^_{}\\|<>≤≥±×÷√²³'!:;[\]]+$/
const REAL_WORD = /(?<!\\)\b[a-zA-Z]{4,}\b/ // 4+ letters, not a \command
// Short words that start a sentence ("So x = 3", "Let x = 2"): kept as text, the rest is maths.
const LEAD_WORD = /^(so|let|if|and|or|is|the|now|ans|et|si|und|ist|sei|se|ve)\s+(?=[\w\\(])/i

export function isBareMathLine(line) {
  const s = line.trim()
  if (!s || /\$|\\[()[\]]/.test(s)) return false // already delimited: $...$, \(...\), \[...\]
  if (!MATHY_CHARS.test(s)) return false
  if (REAL_WORD.test(s.replace(/\\[a-zA-Z]+/g, ' '))) return false
  return LATEX_MARKERS.test(s) || (/[=<>≤≥]/.test(s) && /[0-9a-zA-Z]/.test(s))
}

// "So x = 3" -> "So $x = 3$" (a bare maths line, or a short word then bare maths)
function wrapLine(line) {
  const s = line.trim()
  const lead = s.match(LEAD_WORD)
  if (lead && isBareMathLine(s.slice(lead[0].length))) return `${lead[0]}$${s.slice(lead[0].length)}$`
  return isBareMathLine(line) ? `$${s}$` : line
}

export function normalizeOcrMath(text) {
  if (!text) return text
  if (/^\s*\$\$(?:(?!\$\$)[\s\S])*\$\$\s*$/.test(text)) return text // exactly one display block
  const lines = text.split('\n')
  const out = []
  for (let i = 0; i < lines.length; i++) {
    // a display block fenced by lines of just $$ (or \[ ... \]) is maths already: left alone
    const fence = lines[i].trim()
    const close = fence === '$$' ? '$$' : fence === '\\[' ? '\\]' : null
    const end = close ? lines.findIndex((l, j) => j > i && l.trim() === close) : -1
    if (end > i) {
      out.push(...lines.slice(i, end + 1))
      i = end
      continue
    }
    out.push(wrapLine(lines[i]))
  }
  return out.join('\n')
}
