// Finding a sheet of paper in a camera frame, and flattening it.
// Pure functions on RGBA pixel arrays (no DOM), so they also run in Node tests.
//
// detectPaperRegion() (simple bright-region method; the app uses lib/paperDetect.js,
// which also uses this one as a candidate):
//   1. Paper = bright, low-color pixels. Brightness cut-off comes from Otsu's method.
//   2. Close small gaps (ink strokes), take the largest connected bright region.
//   3. Convex hull of its outline, then the 4 hull points that enclose the most area
//      = the paper's corners (works for any rotation).
//   4. Reject shapes that don't fill their quadrilateral (not rectangle-like).

export function detectPaperRegion(rgba, w, h, opts = {}) {
  const minBrightness = opts.minBrightness ?? 90
  const maxSaturation = opts.maxSaturation ?? 0.3
  const minArea = opts.minArea ?? 0.05 // of the frame
  const minFill = opts.minFill ?? 0.75 // region area / quad area

  const n = w * h
  const gray = new Uint8Array(n)
  const sat = new Float32Array(n)
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const r = rgba[p]
    const g = rgba[p + 1]
    const b = rgba[p + 2]
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b
    sat[i] = max ? (max - min) / max : 0
  }

  const t = Math.max(otsu(gray), minBrightness)
  let mask = new Uint8Array(n)
  for (let i = 0; i < n; i++) mask[i] = gray[i] >= t && sat[i] <= maxSaturation ? 1 : 0
  mask = erode(dilate(mask, w, h), w, h)

  const comp = largestComponent(mask, w, h)
  if (!comp || comp.count < n * minArea) return null

  const points = boundaryPoints(comp.labels, comp.label, w, h)
  const hull = convexHull(points)
  if (hull.length < 4) return null

  const quad = orderCorners(bestQuad(hull))
  const qa = polygonArea(quad)
  if (qa <= 0) return null
  const fill = comp.count / qa
  if (fill < minFill) return null
  return { quad, area: qa / n, fill, threshold: t }
}

// Otsu's threshold for a grayscale array.
export function otsu(gray) {
  const hist = new Float64Array(256)
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++
  const total = gray.length
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * hist[i]
  let sumB = 0
  let wB = 0
  let best = 0
  let threshold = 127
  for (let i = 0; i < 256; i++) {
    wB += hist[i]
    if (!wB) continue
    const wF = total - wB
    if (!wF) break
    sumB += i * hist[i]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const between = wB * wF * (mB - mF) * (mB - mF)
    if (between > best) {
      best = between
      threshold = i
    }
  }
  return threshold
}

function dilate(mask, w, h) {
  const out = new Uint8Array(mask.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      out[i] =
        mask[i] ||
        (x > 0 && mask[i - 1]) ||
        (x < w - 1 && mask[i + 1]) ||
        (y > 0 && mask[i - w]) ||
        (y < h - 1 && mask[i + w])
          ? 1
          : 0
    }
  }
  return out
}

function erode(mask, w, h) {
  const out = new Uint8Array(mask.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      // Pixels on the frame border keep their value, so paper touching the edge isn't eaten.
      out[i] =
        mask[i] &&
        (x === 0 || mask[i - 1]) &&
        (x === w - 1 || mask[i + 1]) &&
        (y === 0 || mask[i - w]) &&
        (y === h - 1 || mask[i + w])
          ? 1
          : 0
    }
  }
  return out
}

function largestComponent(mask, w, h) {
  const labels = new Int32Array(mask.length).fill(-1)
  const stack = new Int32Array(mask.length)
  let label = 0
  let best = null
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start] !== -1) continue
    let top = 0
    let count = 0
    stack[top++] = start
    labels[start] = label
    while (top) {
      const i = stack[--top]
      count++
      const x = i % w
      const y = (i - x) / w
      if (x > 0 && mask[i - 1] && labels[i - 1] === -1) (labels[i - 1] = label), (stack[top++] = i - 1)
      if (x < w - 1 && mask[i + 1] && labels[i + 1] === -1) (labels[i + 1] = label), (stack[top++] = i + 1)
      if (y > 0 && mask[i - w] && labels[i - w] === -1) (labels[i - w] = label), (stack[top++] = i - w)
      if (y < h - 1 && mask[i + w] && labels[i + w] === -1) (labels[i + w] = label), (stack[top++] = i + w)
    }
    if (!best || count > best.count) best = { label, count }
    label++
  }
  return best ? { ...best, labels } : null
}

function boundaryPoints(labels, label, w, h) {
  const pts = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (labels[i] !== label) continue
      if (
        x === 0 ||
        y === 0 ||
        x === w - 1 ||
        y === h - 1 ||
        labels[i - 1] !== label ||
        labels[i + 1] !== label ||
        labels[i - w] !== label ||
        labels[i + w] !== label
      ) {
        pts.push([x, y])
      }
    }
  }
  return pts
}

// Andrew's monotone chain. Returns hull points in order, without repeats.
export function convexHull(points) {
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (pts.length < 3) return pts
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  upper.pop()
  lower.pop()
  return lower.concat(upper)
}

export function polygonArea(poly) {
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i]
    const [x2, y2] = poly[(i + 1) % poly.length]
    a += x1 * y2 - x2 * y1
  }
  return Math.abs(a) / 2
}

// The 4 hull vertices that enclose the largest area (local search, stays in hull order).
function bestQuad(hull) {
  const m = hull.length
  const score = (fn) => hull.reduce((bi, p, i) => (fn(p) > fn(hull[bi]) ? i : bi), 0)
  let idx = [
    score((p) => -(p[0] + p[1])),
    score((p) => p[0] - p[1]),
    score((p) => p[0] + p[1]),
    score((p) => -(p[0] - p[1])),
  ]
  idx = [...new Set(idx)].sort((a, b) => a - b)
  if (idx.length < 4) idx = [0, 1, 2, 3].map((k) => Math.floor((k * m) / 4))
  const area = (ids) => polygonArea(ids.map((i) => hull[i]))
  let bestArea = area(idx)
  for (let iter = 0; iter < 8; iter++) {
    let improved = false
    for (let k = 0; k < 4; k++) {
      const prev = idx[(k + 3) % 4]
      const next = idx[(k + 1) % 4]
      for (let j = (prev + 1) % m; j !== next; j = (j + 1) % m) {
        const trial = idx.slice()
        trial[k] = j
        const a = area(trial)
        if (a > bestArea + 1e-9) {
          bestArea = a
          idx = trial
          improved = true
        }
      }
    }
    if (!improved) break
  }
  return idx.map((i) => hull[i])
}

// Order corners as top-left, top-right, bottom-right, bottom-left (image coords, y down).
export function orderCorners(quad) {
  const cx = quad.reduce((s, p) => s + p[0], 0) / 4
  const cy = quad.reduce((s, p) => s + p[1], 0) / 4
  const sorted = quad.slice().sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx))
  let start = 0
  sorted.forEach((p, i) => {
    if (p[0] + p[1] < sorted[start][0] + sorted[start][1]) start = i
  })
  return [0, 1, 2, 3].map((k) => sorted[(start + k) % 4])
}

export function pointInQuad([px, py], quad) {
  let sign = 0
  for (let i = 0; i < 4; i++) {
    const [x1, y1] = quad[i]
    const [x2, y2] = quad[(i + 1) % 4]
    const c = (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1)
    if (c !== 0) {
      if (sign === 0) sign = Math.sign(c)
      else if (Math.sign(c) !== sign) return false
    }
  }
  return true
}

export function scaleQuad(quad, factor) {
  const cx = quad.reduce((s, p) => s + p[0], 0) / 4
  const cy = quad.reduce((s, p) => s + p[1], 0) / 4
  return quad.map(([x, y]) => [cx + (x - cx) * factor, cy + (y - cy) * factor])
}

export function quadBounds(quad) {
  const xs = quad.map((p) => p[0])
  const ys = quad.map((p) => p[1])
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
}

// Follow small corner jitter smoothly, but jump when the paper really moved.
export function smoothQuad(prev, next, alpha = 0.35, jump = 0.12) {
  if (!prev) return next
  const b = quadBounds(next)
  const diag = Math.hypot(b.x1 - b.x0, b.y1 - b.y0) || 1
  const moved = Math.max(...next.map((p, i) => Math.hypot(p[0] - prev[i][0], p[1] - prev[i][1])))
  if (moved > jump * diag) return next
  return next.map((p, i) => [prev[i][0] + (p[0] - prev[i][0]) * alpha, prev[i][1] + (p[1] - prev[i][1]) * alpha])
}

// Size of the flattened page, from the quad's edge lengths, capped at maxSide.
export function flatSize(quad, maxSide = 1600) {
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
  const [tl, tr, br, bl] = quad
  let w = Math.max(d(tl, tr), d(bl, br))
  let h = Math.max(d(tl, bl), d(tr, br))
  const s = Math.min(1, maxSide / Math.max(w, h))
  return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)) }
}

// 3x3 homography (row-major, h[8] = 1) that maps src[i] -> dst[i] for 4 point pairs.
export function computeHomography(src, dst) {
  const A = []
  const bvec = []
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i]
    const [u, v] = dst[i]
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y])
    bvec.push(u)
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y])
    bvec.push(v)
  }
  const sol = solveLinear(A, bvec)
  return sol ? [...sol, 1] : null
}

export function applyHomography(H, [x, y]) {
  const d = H[6] * x + H[7] * y + H[8]
  return [(H[0] * x + H[1] * y + H[2]) / d, (H[3] * x + H[4] * y + H[5]) / d]
}

function solveLinear(A, b) {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let c = 0; c < n; c++) {
    let piv = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r
    if (Math.abs(M[piv][c]) < 1e-12) return null
    ;[M[c], M[piv]] = [M[piv], M[c]]
    for (let r = 0; r < n; r++) {
      if (r === c) continue
      const f = M[r][c] / M[c][c]
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]
    }
  }
  return M.map((row, i) => row[n] / row[i])
}

// Flatten `quad` (in src pixel coords, TL/TR/BR/BL) into an outW x outH RGBA image.
export function warpQuad(src, quad, outW, outH) {
  const H = computeHomography(
    [
      [0, 0],
      [outW - 1, 0],
      [outW - 1, outH - 1],
      [0, outH - 1],
    ],
    quad,
  )
  const out = new Uint8ClampedArray(outW * outH * 4)
  if (!H) return { data: out, width: outW, height: outH }
  const { data, width: sw, height: sh } = src
  let o = 0
  for (let v = 0; v < outH; v++) {
    for (let u = 0; u < outW; u++, o += 4) {
      const d = H[6] * u + H[7] * v + H[8]
      let x = (H[0] * u + H[1] * v + H[2]) / d
      let y = (H[3] * u + H[4] * v + H[5]) / d
      x = Math.min(Math.max(x, 0), sw - 1.001)
      y = Math.min(Math.max(y, 0), sh - 1.001)
      const x0 = x | 0
      const y0 = y | 0
      const fx = x - x0
      const fy = y - y0
      const i00 = (y0 * sw + x0) * 4
      const i10 = i00 + 4
      const i01 = i00 + sw * 4
      const i11 = i01 + 4
      for (let c = 0; c < 3; c++) {
        const top = data[i00 + c] + (data[i10 + c] - data[i00 + c]) * fx
        const bot = data[i01 + c] + (data[i11 + c] - data[i01 + c]) * fx
        out[o + c] = top + (bot - top) * fy
      }
      out[o + 3] = 255
    }
  }
  return { data: out, width: outW, height: outH }
}
