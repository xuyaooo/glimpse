// A JSON answer still being written by the model: the items of one of its arrays that are already
// complete, so a long answer (the hints, then each step) can be shown while the rest is written.

// where the JSON value starting at i ends (exclusive), or -1 while it is not complete
function valueEnd(text, i) {
  if (text[i] === '"') {
    for (let j = i + 1; j < text.length; j++) {
      if (text[j] === '\\') j++
      else if (text[j] === '"') return j + 1
    }
    return -1
  }
  if (text[i] === '{' || text[i] === '[') {
    let depth = 0
    let inString = false
    for (let j = i; j < text.length; j++) {
      const c = text[j]
      if (inString) {
        if (c === '\\') j++
        else if (c === '"') inString = false
      } else if (c === '"') inString = true
      else if (c === '{' || c === '[') depth++
      else if (c === '}' || c === ']') {
        depth--
        if (depth === 0) return j + 1
      }
    }
    return -1
  }
  // a number, true, false or null: complete once something follows it
  const m = /^[^,\]}\s]+/.exec(text.slice(i))
  return m && i + m[0].length < text.length ? i + m[0].length : -1
}

/**
 * The complete items so far of the array under `key` ('{"hints": ["a", "b' -> ["a"]), and
 * whether the array is finished.
 */
export function partialArray(text, key) {
  const m = new RegExp(`"${key}"\\s*:\\s*\\[`).exec(String(text ?? ''))
  if (!m) return { items: [], closed: false }
  const items = []
  let i = m.index + m[0].length
  for (;;) {
    while (i < text.length && /[\s,]/.test(text[i])) i++
    if (i >= text.length) return { items, closed: false }
    if (text[i] === ']') return { items, closed: true }
    const end = valueEnd(text, i)
    if (end < 0) return { items, closed: false }
    try {
      items.push(JSON.parse(text.slice(i, end)))
    } catch {
      return { items, closed: false }
    }
    i = end
  }
}
