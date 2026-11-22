// Synthetic "webcam frames" for testing paper detection: a sheet of paper (white,
// lined or grid, with ink) on different desks, with shadows, a hand, clutter, uneven
// light, blur, noise and JPEG compression. Rendered at 2x and downsampled so edges are
// soft like a real camera.
import jpeg from 'jpeg-js'
import { computeHomography, applyHomography, pointInQuad, orderCorners } from '../../server/vision/paper.js'

export function rng(seed) {
  let a = seed >>> 0 || 1
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const BACKGROUNDS = {
  darkWood: (x, y) => {
    const g = 14 * Math.sin(y * 0.35 + 3 * Math.sin(x * 0.02)) + 6 * Math.sin(y * 1.7 + x * 0.05)
    return [105 + g, 75 + g * 0.8, 50 + g * 0.6]
  },
  lightWood: (x, y) => {
    const g = 10 * Math.sin(x * 0.25 + 2 * Math.sin(y * 0.03)) + 4 * Math.sin(x * 1.3)
    return [200 + g, 165 + g * 0.9, 122 + g * 0.7]
  },
  grayDesk: () => [140, 142, 145],
  blackDesk: () => [36, 36, 40],
  greenMat: (x, y) => ((x % 20) < 1 || (y % 20) < 1 ? [95, 150, 115] : [55, 110, 80]),
  whiteTable: (x, y) => {
    const v = 3 * Math.sin(x * 0.013 + y * 0.007)
    return [228 + v, 229 + v, 226 + v]
  },
  whiteTableHard: (x, y) => {
    const v = 2 * Math.sin(x * 0.011 - y * 0.009)
    return [237 + v, 237 + v, 234 + v]
  },
}

function paperColor(u, v, paper) {
  let c = paper.color.slice()
  if (paper.lined) {
    const f = (v * 28) % 1
    if (v > 0.08 && f < 0.07) c = [160, 180, 225]
    if (Math.abs(u - 0.12) < 0.004) c = [225, 120, 120]
  }
  if (paper.grid) {
    if ((u * 24) % 1 < 0.06 || (v * 34) % 1 < 0.06) c = [175, 195, 215]
  }
  if (paper.ink) {
    for (const row of [0.18, 0.24, 0.42, 0.48, 0.54, 0.72]) {
      if (Math.abs(v - row) < 0.012 && u > 0.16 && u < 0.16 + 0.6 * (0.6 + 0.4 * Math.sin(row * 40))) {
        if (Math.sin(u * 260 + row * 50) > 0.2 || Math.abs(v - row) < 0.003) c = [30, 38, 95]
      }
    }
  }
  return c
}

// opts: { w, h, seed, background, quad (in w x h px), paper: { color, lined, grid, ink },
//         shadow, objects: [{ quad, color }], hand: { x, y, rx, ry, angle },
//         light, vignette, blur, noise, jpeg }
export function renderScene(opts) {
  const W = opts.w ?? 320
  const H = opts.h ?? 180
  const SS = 2
  const w = W * SS
  const h = H * SS
  const r = rng(opts.seed ?? 1)
  const bg = BACKGROUNDS[opts.background || 'darkWood']
  const paper = { color: [247, 246, 242], ink: true, ...(opts.paper || {}) }
  const quadSS = opts.quad ? opts.quad.map(([x, y]) => [x * SS, y * SS]) : null
  const toPaper = quadSS
    ? computeHomography(quadSS, [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ])
    : null
  const objects = (opts.objects || []).map((o) => ({ ...o, quad: o.quad.map(([x, y]) => [x * SS, y * SS]) }))
  const shadowOff = 3 * SS
  const buf = new Float32Array(w * h * 3)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x + 0.5
      const py = y + 0.5
      let c = bg(px / SS, py / SS)
      for (const o of objects) if (pointInQuad([px, py], o.quad)) c = o.color.slice()
      if (quadSS && pointInQuad([px, py], quadSS)) {
        const [u, v] = applyHomography(toPaper, [px, py])
        c = paperColor(u, v, paper)
      } else if (quadSS && opts.shadow) {
        // soft drop shadow toward the bottom-right
        let s = 0
        for (const k of [1, 2, 3]) if (pointInQuad([px - (shadowOff * k) / 3, py - (shadowOff * k) / 3], quadSS)) s++
        if (s) c = c.map((v) => v * (1 - (opts.shadow * s) / 3))
      }
      if (opts.hand) {
        const { x: hx, y: hy, rx, ry, angle = 0 } = opts.hand
        const dx = px / SS - hx
        const dy = py / SS - hy
        const a = dx * Math.cos(angle) + dy * Math.sin(angle)
        const b = -dx * Math.sin(angle) + dy * Math.cos(angle)
        const d = (a * a) / (rx * rx) + (b * b) / (ry * ry)
        if (d < 1) c = [208 - 30 * d, 150 - 25 * d, 122 - 20 * d]
      }
      const i = (y * w + x) * 3
      buf[i] = c[0]
      buf[i + 1] = c[1]
      buf[i + 2] = c[2]
    }
  }
  // downsample 2x -> W x H
  let img = new Float32Array(W * H * 3)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      for (let k = 0; k < 3; k++) {
        let s = 0
        for (let dy = 0; dy < SS; dy++) for (let dx = 0; dx < SS; dx++) s += buf[((y * SS + dy) * w + x * SS + dx) * 3 + k]
        img[(y * W + x) * 3 + k] = s / (SS * SS)
      }
    }
  }
  // uneven light + vignette
  const light = opts.light ?? 0
  const vig = opts.vignette ?? 0
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const rr = ((x - W / 2) / (W / 2)) ** 2 + ((y - H / 2) / (H / 2)) ** 2
      const f = (1 - light * (x / W)) * (1 - vig * rr * 0.5)
      for (let k = 0; k < 3; k++) img[(y * W + x) * 3 + k] *= f
    }
  }
  // blur (3x3 box) passes
  for (let p = 0; p < (opts.blur ?? 0); p++) {
    const out = new Float32Array(img.length)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        for (let k = 0; k < 3; k++) {
          let s = 0
          let n = 0
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const xx = x + dx
              const yy = y + dy
              if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue
              s += img[(yy * W + xx) * 3 + k]
              n++
            }
          }
          out[(y * W + x) * 3 + k] = s / n
        }
      }
    }
    img = out
  }
  // sensor noise + clamp
  const sigma = opts.noise ?? 2
  const rgba = new Uint8ClampedArray(W * H * 4)
  for (let i = 0, p = 0; i < W * H; i++, p += 4) {
    for (let k = 0; k < 3; k++) {
      const u1 = Math.max(1e-9, r())
      const n = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * r()) * sigma
      rgba[p + k] = img[i * 3 + k] + n
    }
    rgba[p + 3] = 255
  }
  if (opts.jpeg) {
    const enc = jpeg.encode({ data: rgba, width: W, height: H }, opts.jpeg)
    const dec = jpeg.decode(enc.data, { useTArray: true, formatAsRGBA: true })
    return { rgba: new Uint8ClampedArray(dec.data), w: W, h: H, quad: opts.quad, hand: opts.hand }
  }
  return { rgba, w: W, h: H, quad: opts.quad, hand: opts.hand }
}

// The hand as a polygon, slightly enlarged: what the app gets from MediaPipe's landmarks.
export function handPolygon(hand, grow = 1.15) {
  if (!hand) return null
  const { x, y, rx, ry, angle = 0 } = hand
  return Array.from({ length: 16 }, (_, k) => {
    const t = (k / 16) * Math.PI * 2
    const a = Math.cos(t) * rx * grow
    const b = Math.sin(t) * ry * grow
    return [x + a * Math.cos(angle) - b * Math.sin(angle), y + a * Math.sin(angle) + b * Math.cos(angle)]
  })
}

// A paper-shaped quad: A4 portrait or landscape, rotated, with a little perspective.
export function randomPaperQuad(r, W, H, { minH = 0.5, maxH = 0.85, rot = 25, persp = 0.05, cx, cy } = {}) {
  const landscape = r() < 0.3
  const ph = H * (minH + (maxH - minH) * r())
  const pw = landscape ? ph * 1.414 : ph / 1.414
  const a = ((r() * 2 - 1) * rot * Math.PI) / 180
  const centerX = cx ?? W * (0.35 + 0.3 * r())
  const centerY = cy ?? H * (0.42 + 0.16 * r())
  const pts = [
    [-pw / 2, -ph / 2],
    [pw / 2, -ph / 2],
    [pw / 2, ph / 2],
    [-pw / 2, ph / 2],
  ].map(([x, y]) => [
    centerX + x * Math.cos(a) - y * Math.sin(a) + (r() * 2 - 1) * persp * W,
    centerY + x * Math.sin(a) + y * Math.cos(a) + (r() * 2 - 1) * persp * H,
  ])
  return orderCorners(pts)
}

export const fullyInside = (quad, W, H, m = 2) => quad.every(([x, y]) => x >= m && y >= m && x <= W - 1 - m && y <= H - 1 - m)

// Intersection-over-union of two quads, clipped to the frame (pixel raster).
export function iou(a, b, W, H) {
  let inter = 0
  let uni = 0
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = [x + 0.5, y + 0.5]
      const ia = pointInQuad(p, a)
      const ib = b ? pointInQuad(p, b) : false
      if (ia && ib) inter++
      if (ia || ib) uni++
    }
  }
  return uni ? inter / uni : 0
}

export function maxCornerError(found, truth) {
  return Math.max(...found.map((p, i) => Math.hypot(p[0] - truth[i][0], p[1] - truth[i][1])))
}

// Named test categories -> scene options (deterministic for a given seed).
export function scenario(category, seed, W = 320, H = 180) {
  const r = rng(seed * 7919 + category.length * 104729)
  const base = { w: W, h: H, seed, noise: 2.5, blur: 1, shadow: 0, jpeg: 85 }
  const quad = () => randomPaperQuad(r, W, H)
  switch (category) {
    case 'dark wood':
      return { ...base, background: 'darkWood', quad: quad() }
    case 'light wood':
      return { ...base, background: 'lightWood', quad: quad(), paper: { color: [246, 243, 236] } }
    case 'gray desk':
      return { ...base, background: 'grayDesk', quad: quad() }
    case 'black desk':
      return { ...base, background: 'blackDesk', quad: quad() }
    case 'green cutting mat':
      return { ...base, background: 'greenMat', quad: quad() }
    case 'white table':
      return { ...base, background: 'whiteTable', quad: quad(), shadow: 0.08 }
    case 'white table, no shadow':
      return { ...base, background: 'whiteTable', quad: quad(), shadow: 0 }
    case 'white on white (hard)':
      return { ...base, background: 'whiteTableHard', quad: quad(), shadow: 0.04, paper: { color: [248, 247, 244] } }
    case 'lined paper':
      return { ...base, background: 'lightWood', quad: quad(), paper: { color: [248, 247, 243], lined: true } }
    case 'grid paper on white':
      return { ...base, background: 'whiteTable', quad: quad(), shadow: 0.06, paper: { color: [248, 248, 245], grid: true } }
    case 'hand on paper': {
      const q = quad()
      const e = Math.floor(r() * 4)
      const p = q[e]
      const n = q[(e + 1) % 4]
      const t = 0.3 + 0.4 * r()
      return {
        ...base,
        background: r() < 0.5 ? 'darkWood' : 'whiteTable',
        shadow: 0.06,
        quad: q,
        hand: { x: p[0] + (n[0] - p[0]) * t, y: p[1] + (n[1] - p[1]) * t, rx: 26, ry: 16, angle: r() * Math.PI },
      }
    }
    case 'clutter': {
      const q = randomPaperQuad(r, W, H, { minH: 0.45, maxH: 0.65 })
      return {
        ...base,
        background: 'darkWood',
        quad: q,
        objects: [
          { quad: [[5, 140], [120, 128], [124, 178], [8, 179]], color: [30, 30, 32] }, // keyboard
          { quad: [[250, 5], [318, 10], [316, 70], [246, 64]], color: [170, 40, 45] }, // book
          { quad: [[268, 120], [305, 118], [307, 152], [270, 154]], color: [245, 230, 120] }, // sticky note
        ],
      }
    }
    case 'uneven light':
      return { ...base, background: 'whiteTable', quad: quad(), shadow: 0.06, light: 0.35, vignette: 0.5 }
    case 'off the edge': {
      const q = randomPaperQuad(r, W, H, { minH: 0.7, maxH: 0.95, rot: 10, cy: H * (r() < 0.5 ? 0.25 : 0.75) })
      return { ...base, background: r() < 0.5 ? 'grayDesk' : 'darkWood', quad: q }
    }
    case 'noisy + blurry + jpeg':
      return { ...base, background: 'grayDesk', quad: quad(), noise: 6, blur: 2, jpeg: 45 }
    case 'no paper (white table)':
      return { ...base, background: 'whiteTable', quad: null }
    case 'no paper (clutter)':
      return {
        ...base,
        background: 'darkWood',
        quad: null,
        objects: [
          { quad: [[5, 140], [120, 128], [124, 178], [8, 179]], color: [30, 30, 32] },
          { quad: [[250, 5], [318, 10], [316, 70], [246, 64]], color: [170, 40, 45] },
        ],
      }
    default:
      throw new Error(`unknown category ${category}`)
  }
}

export const CATEGORIES = [
  'dark wood',
  'light wood',
  'gray desk',
  'black desk',
  'green cutting mat',
  'white table',
  'white table, no shadow',
  'white on white (hard)',
  'lined paper',
  'grid paper on white',
  'hand on paper',
  'clutter',
  'uneven light',
  'off the edge',
  'noisy + blurry + jpeg',
]
export const NEGATIVE_CATEGORIES = ['no paper (white table)', 'no paper (clutter)']
