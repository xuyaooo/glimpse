// Robust paper detection: edges + straight lines + scoring of candidate quadrilaterals.
// Works on dark desks AND white tables (where "find the bright region" fails), with
// shadows, lined/grid paper, a hand on the page, clutter and uneven light.
//
//   1. Edges: blurred brightness -> Sobel gradients -> thin edges (non-maximum
//      suppression) -> keep edges stronger than the image's own noise level.
//   2. Straight lines: Hough transform (each edge pixel votes for lines through it,
//      only in directions that match its gradient).
//   3. Candidates: every pair of roughly parallel lines x another such pair -> a
//      4-sided shape. The frame border also counts as a line (paper running off the
//      picture). The old bright-region method and last frame's paper are candidates too.
//   4. Score: along each side, is there a real edge (support), and do colors differ
//      on the two sides (contrast)? Printed lines on lined paper have paper on both
//      sides, so they score ~0. Larger shapes and shapes fully in view score higher.
//   5. Refine: fit each winning side to its edge pixels (least squares) for exact corners.
import { detectPaperRegion, orderCorners, polygonArea } from './paper.js'

const DEG = Math.PI / 180

// opts: { prev: last frame's quad (tracking hint), ignore: [polygon, ...] regions to
//         ignore, e.g. hands (their outline would look like edges and they cover the paper) }
export function detectPaper(rgba, w, h, opts = {}) {
  const img = prepare(rgba, w, h)
  img.ignore = opts.ignore?.length ? rasterize(opts.ignore, w, h) : null
  const edges = findEdges(img, w, h)
  // Keep only lines with different colors on their two sides (real object borders).
  // Printed lines (ruled/grid paper, cutting-mat grids) have the same color on both
  // sides and would crowd out the paper's edges.
  const lines = selectLines(houghLines(edges, w, h, 150), img, edges, w, h, opts.maxLines ?? 16)
  const all = lines.concat(borderLines(w, h))

  const candidates = quadsFromLines(all, w, h)
  const region = detectPaperRegion(rgba, w, h)
  if (region) candidates.push({ quad: region.quad, source: 'region' })
  if (opts.prev) candidates.push({ quad: opts.prev, source: 'prev' })

  // Score candidates in order of their best possible score (which depends only on size
  // and border sides), and stop once no remaining candidate could beat the best so far.
  const ranked = candidates
    .filter((c) => validQuad(c.quad, w, h))
    .map((c) => ({ ...c, bound: upperBound(c.quad, w, h) * (c.source === 'prev' ? 1.1 : 1) }))
    .sort((a, b) => b.bound - a.bound)
  let best = null
  for (const c of ranked) {
    if (best && c.bound <= best.score) break
    const s = scoreQuad(c.quad, img, edges, w, h)
    if (!s) continue
    const score = s.score * (c.source === 'prev' ? 1.1 : 1)
    if (!best || score > best.score) best = { ...c, ...s, score }
  }
  // (testing aid) how would a given quad have scored?
  const debugScore = opts.debugQuad ? scoreQuad(opts.debugQuad, img, edges, w, h) : undefined
  if (!best || best.score < (opts.minScore ?? 0.4)) return opts.debugQuad ? { quad: null, debugScore, best } : null

  const quad = refineQuad(best.quad, edges, w, h) || best.quad
  return { quad, score: best.score, source: best.source, area: polygonArea(quad) / (w * h), lines: lines.length, debugScore, ...(opts.debugQuad ? { allLines: lines, threshold: edges.threshold, edgeMap: edges.map } : {}) }
}

// ---------- 1. image + edges ----------

function blur(src, w, h) {
  // Two passes of a 3-tap box blur in each direction (close to a small Gaussian).
  let a = src
  for (let pass = 0; pass < 2; pass++) {
    const tmp = new Float32Array(w * h)
    for (let y = 0; y < h; y++) {
      const r = y * w
      for (let x = 0; x < w; x++) {
        const l = a[r + Math.max(0, x - 1)]
        const m = a[r + x]
        const rr = a[r + Math.min(w - 1, x + 1)]
        tmp[r + x] = (l + m + rr) / 3
      }
    }
    const out = new Float32Array(w * h)
    for (let y = 0; y < h; y++) {
      const u = Math.max(0, y - 1) * w
      const d = Math.min(h - 1, y + 1) * w
      for (let x = 0; x < w; x++) out[y * w + x] = (tmp[u + x] + tmp[y * w + x] + tmp[d + x]) / 3
    }
    a = out
  }
  return a
}

function prepare(rgba, w, h) {
  const n = w * h
  const L = new Float32Array(n)
  const A = new Float32Array(n)
  const B = new Float32Array(n)
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const r = rgba[p]
    const g = rgba[p + 1]
    const b = rgba[p + 2]
    L[i] = 0.299 * r + 0.587 * g + 0.114 * b
    A[i] = r - g // red-green
    B[i] = 0.5 * (r + g) - b // yellow-blue
  }
  const Lb = blur(L, w, h)
  // Edges are found on log-brightness, so an edge counts the same in bright and in
  // dim parts of the picture (uneven light, vignetting): it measures the RATIO.
  const logL = new Float32Array(n)
  for (let i = 0; i < n; i++) logL[i] = 46 * Math.log1p(Lb[i]) // 46 * ln(256) ~ 255
  // 95th-percentile brightness: "how bright is the brightest stuff in the picture"
  const hist = new Uint32Array(256)
  for (let i = 0; i < n; i++) hist[Math.min(255, Math.max(0, Lb[i] | 0))]++
  let p95 = 255
  for (let k = 255, acc = 0; k >= 0; k--) {
    acc += hist[k]
    if (acc >= n * 0.05) {
      p95 = Math.max(1, k)
      break
    }
  }
  return { L: Lb, A: blur(A, w, h), B: blur(B, w, h), logL, p95 }
}

function findEdges(img, w, h) {
  const L = img.logL
  const n = w * h
  const gx = new Float32Array(n)
  const gy = new Float32Array(n)
  const mag = new Float32Array(n)
  const hist = new Uint32Array(512)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const sx = L[i - w + 1] + 2 * L[i + 1] + L[i + w + 1] - L[i - w - 1] - 2 * L[i - 1] - L[i + w - 1]
      const sy = L[i + w - 1] + 2 * L[i + w] + L[i + w + 1] - L[i - w - 1] - 2 * L[i - w] - L[i - w + 1]
      gx[i] = sx
      gy[i] = sy
      const m = Math.hypot(sx, sy)
      mag[i] = m
      hist[Math.min(511, (m * 4) | 0)]++ // quarter-unit bins (log values are small)
    }
  }
  // Threshold relative to the image's own noise/texture level (median gradient).
  let half = ((w - 2) * (h - 2)) / 2
  let median = 0
  for (let k = 0; k < 512; k++) {
    half -= hist[k]
    if (half <= 0) {
      median = k / 4
      break
    }
  }
  const T = Math.max(1.5, median * 2) // log-brightness units

  const map = new Uint8Array(n)
  const dir = new Float32Array(n) // gradient direction in [0, pi)
  const xs = []
  const ys = []
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      const i = y * w + x
      const m = mag[i]
      if (m <= T) continue
      if (img.ignore && img.ignore[i]) continue
      const ax = Math.abs(gx[i])
      const ay = Math.abs(gy[i])
      let n1
      let n2
      if (ay <= ax * 0.4142) {
        n1 = i - 1
        n2 = i + 1
      } else if (ay >= ax * 2.4142) {
        n1 = i - w
        n2 = i + w
      } else if (gx[i] * gy[i] > 0) {
        n1 = i - w - 1
        n2 = i + w + 1
      } else {
        n1 = i - w + 1
        n2 = i + w - 1
      }
      if (m < mag[n1] || m < mag[n2]) continue
      map[i] = 1
      let a = Math.atan2(gy[i], gx[i])
      if (a < 0) a += Math.PI
      if (a >= Math.PI) a -= Math.PI
      dir[i] = a
      xs.push(x)
      ys.push(y)
    }
  }
  return { map, dir, xs, ys, threshold: T }
}

// ---------- 2. straight lines (Hough) ----------

const COS = new Float32Array(180)
const SIN = new Float32Array(180)
for (let t = 0; t < 180; t++) {
  COS[t] = Math.cos(t * DEG)
  SIN[t] = Math.sin(t * DEG)
}

function lineAngleDiff(t1, t2) {
  const d = Math.abs(t1 - t2) % Math.PI
  return Math.min(d, Math.PI - d)
}

// Candidate lines (local maxima of the Hough accumulator), strongest first.
// Near-duplicates are NOT removed here: the caller first drops low-contrast lines,
// so a strong printed line next to the paper edge can't hide the real edge.
function houghLines(edges, w, h, maxPeaks) {
  const diag = Math.ceil(Math.hypot(w, h))
  const nRho = 2 * diag + 1
  const acc = new Uint16Array(180 * nRho)
  const { xs, ys, dir } = edges
  for (let k = 0; k < xs.length; k++) {
    const x = xs[k]
    const y = ys[k]
    const tb = Math.round(dir[y * w + x] / DEG) % 180
    // +-12 degrees: gradient directions of weak, shadowed or noisy edges wobble 5-14 deg.
    for (let dt = -12; dt <= 12; dt++) {
      const t = (tb + dt + 180) % 180
      const r = Math.round(x * COS[t] + y * SIN[t]) + diag
      acc[t * nRho + r]++
    }
  }
  const minVotes = Math.max(10, Math.round(0.1 * Math.min(w, h)))
  const peaks = []
  for (let t = 0; t < 180; t++) {
    for (let r = 2; r < nRho - 2; r++) {
      const v = acc[t * nRho + r]
      if (v < minVotes) continue
      let isMax = true
      for (let dt = -1; dt <= 1 && isMax; dt++) {
        const tt = (t + dt + 180) % 180
        for (let dr = -1; dr <= 1; dr++) {
          if (!dt && !dr) continue
          const o = acc[tt * nRho + r + dr]
          if (o > v || (o === v && (dt < 0 || (dt === 0 && dr < 0)))) {
            isMax = false
            break
          }
        }
      }
      if (isMax) peaks.push({ theta: t * DEG, rho: r - diag, votes: v })
    }
  }
  peaks.sort((a, b) => b.votes - a.votes)
  return peaks.slice(0, maxPeaks)
}

// Strongest-first: skip near-duplicates of lines already kept (same direction, < 6 px
// apart) and lines without a color change across them; stop at `max` lines.
function selectLines(peaks, img, edges, w, h, max) {
  const out = []
  for (const p of peaks) {
    const dup = out.some((l) => {
      const flip = Math.abs(l.theta - p.theta) > Math.PI / 2
      return lineAngleDiff(l.theta, p.theta) < 4 * DEG && Math.abs(l.rho - (flip ? -p.rho : p.rho)) < 6
    })
    if (dup) continue
    const contrast = lineContrast(p, img, edges, w, h)
    if (contrast < 4) continue
    out.push({ ...p, contrast })
    if (out.length >= max) break
  }
  return out
}

function borderLines(w, h) {
  return [
    { theta: 0, rho: 0, border: true },
    { theta: 0, rho: w - 1, border: true },
    { theta: Math.PI / 2, rho: 0, border: true },
    { theta: Math.PI / 2, rho: h - 1, border: true },
  ]
}

function intersect(l1, l2) {
  const a1 = Math.cos(l1.theta)
  const b1 = Math.sin(l1.theta)
  const a2 = Math.cos(l2.theta)
  const b2 = Math.sin(l2.theta)
  const det = a1 * b2 - a2 * b1
  if (Math.abs(det) < 1e-6) return null
  return [(l1.rho * b2 - l2.rho * b1) / det, (a1 * l2.rho - a2 * l1.rho) / det]
}

// ---------- 3. candidate quadrilaterals ----------

function quadsFromLines(lines, w, h) {
  const cx = w / 2
  const cy = h / 2
  const minSep = 0.12 * Math.min(w, h)
  const pairs = []
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i]
      const b = lines[j]
      if (lineAngleDiff(a.theta, b.theta) > 30 * DEG) continue
      const na = [Math.cos(a.theta), Math.sin(a.theta)]
      const nb = [Math.cos(b.theta), Math.sin(b.theta)]
      const da = cx * na[0] + cy * na[1] - a.rho
      const db = cx * nb[0] + cy * nb[1] - b.rho
      const same = na[0] * nb[0] + na[1] * nb[1] > 0
      if (Math.abs(da - (same ? db : -db)) < minSep) continue
      pairs.push([a, b])
    }
  }
  const quads = []
  for (let i = 0; i < pairs.length; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      const [a, b] = pairs[i]
      const [c, d] = pairs[j]
      if (lineAngleDiff(a.theta, c.theta) < 45 * DEG) continue
      if (a.border && b.border && c.border && d.border) continue // the whole frame
      const pts = [intersect(a, c), intersect(a, d), intersect(b, c), intersect(b, d)]
      if (pts.some((p) => !p)) continue
      quads.push({ quad: orderCorners(pts), source: 'lines' })
    }
  }
  return quads
}

// Mean color difference across a line, measured where the line has edge support.
function lineContrast(line, img, edges, w, h) {
  const c = Math.cos(line.theta)
  const s = Math.sin(line.theta)
  const x0 = line.rho * c
  const y0 = line.rho * s
  const L = Math.hypot(w, h)
  let sum = 0
  let n = 0
  for (let t = -L; t <= L; t += 2) {
    const x = x0 - s * t
    const y = y0 + c * t
    if (x < 4 || y < 4 || x > w - 5 || y > h - 5) continue
    if (ignored(img, w, x, y)) continue
    if (!hasEdgeNear(edges, w, h, x, y, line.theta)) continue
    const k = crossContrast(img, w, h, x, y, c, s)
    if (k === null) continue
    sum += k
    n++
  }
  return n >= 6 ? sum / n : 0
}

const colorDiff = (a, b) => Math.abs(a[0] - b[0]) + 0.5 * (Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]))

// Color difference between the two sides of a border at (x, y) with normal (nx, ny),
// measured 3 px and 6 px away; the smaller one is used. A real border differs at both
// distances; a thin printed line (blurred over a few pixels) differs at neither.
function crossContrast(img, w, h, x, y, nx, ny) {
  const a3 = colorAt(img, w, h, x - nx * 3, y - ny * 3)
  const b3 = colorAt(img, w, h, x + nx * 3, y + ny * 3)
  const a6 = colorAt(img, w, h, x - nx * 6, y - ny * 6)
  const b6 = colorAt(img, w, h, x + nx * 6, y + ny * 6)
  // Both distances must be inside the picture, otherwise this spot proves nothing
  // (e.g. a row of writing right at the edge of the picture).
  if (!a3 || !b3 || !a6 || !b6) return null
  return Math.min(colorDiff(a3, b3), colorDiff(a6, b6))
}

// Does this color look like paper (bright compared with the picture, nearly colorless)?
function paperColor(img, c) {
  return c[0] / img.p95 >= 0.5 && Math.hypot(c[1], c[2]) / (c[0] + 20) <= 0.3
}

// Does the inside of the quad look like paper? Bright (compared with the brightest
// parts of the picture) and nearly colorless. Rejects books, keyboards, mats.
function paperLikeness(quad, img, w, h) {
  const Ls = []
  const sats = []
  for (let i = 1; i <= 7; i++) {
    for (let j = 1; j <= 7; j++) {
      const u = 0.1 + (0.8 * i) / 8
      const v = 0.1 + (0.8 * j) / 8
      const x =
        (1 - u) * (1 - v) * quad[0][0] + u * (1 - v) * quad[1][0] + u * v * quad[2][0] + (1 - u) * v * quad[3][0]
      const y =
        (1 - u) * (1 - v) * quad[0][1] + u * (1 - v) * quad[1][1] + u * v * quad[2][1] + (1 - u) * v * quad[3][1]
      const c = colorAt(img, w, h, x, y)
      if (!c || ignored(img, w, x, y)) continue
      Ls.push(c[0])
      sats.push(Math.hypot(c[1], c[2]) / (c[0] + 20))
    }
  }
  if (Ls.length < 8) return 0
  const med = (a) => a.sort((p, q) => p - q)[a.length >> 1]
  const lum = Math.min(1, Math.max(0, (med(Ls) / img.p95 - 0.45) / 0.3))
  const sat = Math.min(1, Math.max(0, (0.4 - med(sats)) / 0.2))
  return lum * sat
}

function validQuad(quad, w, h) {
  // Corners may lie outside the picture (paper partly out of view).
  const mx = 0.3 * w
  const my = 0.3 * h
  for (const [x, y] of quad) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false
    if (x < -mx || x > w - 1 + mx || y < -my || y > h - 1 + my) return false
  }
  const area = polygonArea(quad)
  if (area < 0.04 * w * h) return false
  let sign = 0
  for (let k = 0; k < 4; k++) {
    const p = quad[k]
    const q = quad[(k + 1) % 4]
    const r = quad[(k + 2) % 4]
    const v1 = [q[0] - p[0], q[1] - p[1]]
    const v2 = [r[0] - q[0], r[1] - q[1]]
    const cross = v1[0] * v2[1] - v1[1] * v2[0]
    if (Math.abs(cross) < 1e-9) return false
    if (sign === 0) sign = Math.sign(cross)
    else if (Math.sign(cross) !== sign) return false
    // interior angle at q between 35 and 145 degrees
    const cos = -(v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(...v1) * Math.hypot(...v2))
    const ang = Math.acos(Math.max(-1, Math.min(1, cos)))
    if (ang < 35 * DEG || ang > 145 * DEG) return false
  }
  return true
}

// ---------- 4. scoring ----------

function onBorder(p, q, w, h) {
  const tol = 1.5
  return (
    (Math.abs(p[0]) < tol && Math.abs(q[0]) < tol) ||
    (Math.abs(p[0] - (w - 1)) < tol && Math.abs(q[0] - (w - 1)) < tol) ||
    (Math.abs(p[1]) < tol && Math.abs(q[1]) < tol) ||
    (Math.abs(p[1] - (h - 1)) < tol && Math.abs(q[1] - (h - 1)) < tol)
  )
}

function hasEdgeNear(edges, w, h, x, y, normalAngle) {
  const xi = Math.round(x)
  const yi = Math.round(y)
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const xx = xi + dx
      const yy = yi + dy
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue
      const i = yy * w + xx
      if (edges.map[i] && lineAngleDiff(edges.dir[i], normalAngle) < 25 * DEG) return true
    }
  }
  return false
}

function ignored(img, w, x, y) {
  if (!img.ignore) return false
  const i = Math.round(y) * w + Math.round(x)
  return i >= 0 && i < img.ignore.length && img.ignore[i] === 1
}

// Fill convex polygons into a mask (1 = ignore this pixel).
function rasterize(polygons, w, h) {
  const mask = new Uint8Array(w * h)
  for (const poly of polygons) {
    if (!poly || poly.length < 3) continue
    const xs = poly.map((p) => p[0])
    const ys = poly.map((p) => p[1])
    const x0 = Math.max(0, Math.floor(Math.min(...xs)))
    const x1 = Math.min(w - 1, Math.ceil(Math.max(...xs)))
    const y0 = Math.max(0, Math.floor(Math.min(...ys)))
    const y1 = Math.min(h - 1, Math.ceil(Math.max(...ys)))
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inConvex(poly, x + 0.5, y + 0.5)) mask[y * w + x] = 1
  }
  return mask
}

function inConvex(poly, px, py) {
  let sign = 0
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i]
    const [x2, y2] = poly[(i + 1) % poly.length]
    const c = (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1)
    if (c !== 0) {
      if (sign === 0) sign = Math.sign(c)
      else if (Math.sign(c) !== sign) return false
    }
  }
  return true
}

function colorAt(img, w, h, x, y) {
  const xi = Math.round(x)
  const yi = Math.round(y)
  if (xi < 0 || yi < 0 || xi >= w || yi >= h) return null
  const i = yi * w + xi
  return [img.L[i], img.A[i], img.B[i]]
}

const BORDER_FACTOR = [1, 0.95, 0.75, 0.45] // by number of sides on the picture edge
const areaFactorOf = (quad, w, h) => 0.4 + 0.6 * Math.min(1, Math.sqrt(polygonArea(quad) / (w * h) / 0.25))

// The highest score this quad could get (perfect edges, perfectly paper-like).
function upperBound(quad, w, h) {
  let border = 0
  for (let k = 0; k < 4; k++) if (onBorder(quad[k], quad[(k + 1) % 4], w, h)) border++
  return areaFactorOf(quad, w, h) * BORDER_FACTOR[Math.min(3, border)]
}

function scoreQuad(quad, img, edges, w, h) {
  const cx = quad.reduce((s, p) => s + p[0], 0) / 4
  const cy = quad.reduce((s, p) => s + p[1], 0) / 4
  let weighted = 0
  let weight = 0
  let borderSides = 0
  let realSides = 0
  for (let k = 0; k < 4; k++) {
    const p = quad[k]
    const q = quad[(k + 1) % 4]
    if (onBorder(p, q, w, h)) {
      // Side on the picture's edge (paper runs out of view): fine if there is paper
      // right next to it; no edge can be checked there.
      borderSides++
      const len = Math.hypot(q[0] - p[0], q[1] - p[1])
      const samples = Math.min(80, Math.max(12, Math.round(len / 2)))
      let paperNext = 0
      let n = 0
      for (let s = 0; s < samples; s++) {
        const t = 0.08 + (0.84 * (s + 0.5)) / samples
        const x = p[0] + (q[0] - p[0]) * t
        const y = p[1] + (q[1] - p[1]) * t
        const ci = colorAt(img, w, h, x + Math.sign(cx - x) * (Math.abs(cx - x) > 5 ? 4 : 0), y + Math.sign(cy - y) * (Math.abs(cy - y) > 5 ? 4 : 0))
        if (!ci || ignored(img, w, x, y)) continue
        n++
        if (paperColor(img, ci)) paperNext++
      }
      if (n) {
        weighted += (paperNext / n) * n * 0.5
        weight += n * 0.5
      }
      continue
    }
    const len = Math.hypot(q[0] - p[0], q[1] - p[1])
    const ux = (q[0] - p[0]) / len
    const uy = (q[1] - p[1]) / len
    // outward normal
    let nx = -uy
    let ny = ux
    const mx = (p[0] + q[0]) / 2
    const my = (p[1] + q[1]) / 2
    if ((cx - mx) * nx + (cy - my) * ny > 0) {
      nx = -nx
      ny = -ny
    }
    let normalAngle = Math.atan2(ny, nx)
    if (normalAngle < 0) normalAngle += Math.PI
    const samples = Math.min(80, Math.max(12, Math.round(len / 2)))
    let evaluated = 0
    let supported = 0
    let contrast = 0
    let contrastN = 0
    let inside = 0
    let insidePaper = 0
    for (let s = 0; s < samples; s++) {
      const t = 0.08 + (0.84 * (s + 0.5)) / samples // skip the corners
      const x = p[0] + (q[0] - p[0]) * t
      const y = p[1] + (q[1] - p[1]) * t
      if (x < 2 || y < 2 || x > w - 3 || y > h - 3) continue
      if (ignored(img, w, x, y) || ignored(img, w, x - nx * 5, y - ny * 5)) continue
      evaluated++
      if (hasEdgeNear(edges, w, h, x, y, normalAngle)) supported++
      const k = crossContrast(img, w, h, x, y, nx, ny)
      if (k !== null) {
        contrast += k
        contrastN++
      }
      // Just inside a real paper edge, there should be paper.
      const ci = colorAt(img, w, h, x - nx * 5, y - ny * 5)
      if (ci) {
        inside++
        if (paperColor(img, ci)) insidePaper++
      }
    }
    if (evaluated < samples * 0.3) {
      borderSides++ // mostly outside the picture: neither evidence for nor against
      continue
    }
    realSides++
    const support = supported / evaluated
    const c = contrastN ? contrast / contrastN : 0
    const paperInside = inside ? insidePaper / inside : 0
    weighted += support * Math.min(1, c / 8) * (0.3 + 0.7 * paperInside) * evaluated
    weight += evaluated
  }
  if (realSides < 2) return null
  const edgeScore = weighted / weight
  const area = polygonArea(quad) / (w * h)
  const areaFactor = areaFactorOf(quad, w, h)
  const paper = paperLikeness(quad, img, w, h)
  const score = edgeScore * areaFactor * BORDER_FACTOR[Math.min(3, borderSides)] * (0.25 + 0.75 * paper)
  return { score, edgeScore, borderSides, paper }
}

// ---------- 5. refinement ----------

// Fit a line (total least squares) to the edge pixels next to each non-border side.
function refineQuad(quad, edges, w, h) {
  const cx = quad.reduce((s, p) => s + p[0], 0) / 4
  const cy = quad.reduce((s, p) => s + p[1], 0) / 4
  const sides = []
  for (let k = 0; k < 4; k++) {
    const p = quad[k]
    const q = quad[(k + 1) % 4]
    if (onBorder(p, q, w, h)) {
      sides.push(lineThrough(p, q))
      continue
    }
    const len = Math.hypot(q[0] - p[0], q[1] - p[1])
    const ux = (q[0] - p[0]) / len
    const uy = (q[1] - p[1]) / len
    let normalAngle = Math.atan2(ux, -uy)
    if (normalAngle < 0) normalAngle += Math.PI
    const pts = []
    const x0 = Math.max(2, Math.floor(Math.min(p[0], q[0]) - 3))
    const x1 = Math.min(w - 3, Math.ceil(Math.max(p[0], q[0]) + 3))
    const y0 = Math.max(2, Math.floor(Math.min(p[1], q[1]) - 3))
    const y1 = Math.min(h - 3, Math.ceil(Math.max(p[1], q[1]) + 3))
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * w + x
        if (!edges.map[i] || lineAngleDiff(edges.dir[i], normalAngle) > 20 * DEG) continue
        const t = ((x - p[0]) * ux + (y - p[1]) * uy) / len
        if (t < 0.1 || t > 0.9) continue
        const d = Math.abs((x - p[0]) * -uy + (y - p[1]) * ux)
        if (d <= 2.5) pts.push([x, y])
      }
    }
    sides.push(pts.length >= 8 ? fitLine(pts) : lineThrough(p, q))
  }
  const corners = []
  for (let k = 0; k < 4; k++) {
    const c = intersect(sides[(k + 3) % 4], sides[k])
    if (!c) return null
    corners.push(c)
  }
  // Refinement must stay close; otherwise keep the unrefined quad.
  if (corners.some((c, k) => Math.hypot(c[0] - quad[k][0], c[1] - quad[k][1]) > 6)) return null
  return orderCorners(corners)
}

function lineThrough(p, q) {
  let theta = Math.atan2(q[0] - p[0], -(q[1] - p[1])) // normal direction
  if (theta < 0) theta += Math.PI
  return { theta, rho: p[0] * Math.cos(theta) + p[1] * Math.sin(theta) }
}

function fitLine(pts) {
  let mx = 0
  let my = 0
  for (const [x, y] of pts) {
    mx += x
    my += y
  }
  mx /= pts.length
  my /= pts.length
  let sxx = 0
  let syy = 0
  let sxy = 0
  for (const [x, y] of pts) {
    sxx += (x - mx) * (x - mx)
    syy += (y - my) * (y - my)
    sxy += (x - mx) * (y - my)
  }
  // Normal = eigenvector of the smallest eigenvalue of the covariance matrix.
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy) // direction of the line
  let theta = angle + Math.PI / 2
  theta = ((theta % Math.PI) + Math.PI) % Math.PI
  return { theta, rho: mx * Math.cos(theta) + my * Math.sin(theta) }
}

// Exposed for tests and debugging.
export const _internals = { prepare, findEdges, houghLines }
