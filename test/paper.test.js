import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  detectPaperRegion as detectPaper,
  computeHomography,
  applyHomography,
  warpQuad,
  pointInQuad,
  orderCorners,
  flatSize,
} from '../server/vision/paper.js'

// Draw a synthetic camera frame: brown desk, light paper (rotated), dark ink lines.
function makeFrame(w, h, quad, { ink = true, hand = null } = {}) {
  const data = new Uint8ClampedArray(w * h * 4)
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 16
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      let c = [110 + rnd(), 80 + rnd(), 55 + rnd()] // wooden desk
      if (pointInQuad([x + 0.5, y + 0.5], quad)) {
        c = [236 + rnd() / 2, 233 + rnd() / 2, 222 + rnd() / 2] // warm white paper
        // ink: a few horizontal-ish text lines inside the paper (in paper coordinates)
        if (ink) {
          const H = computeHomography(quad, [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
          ])
          const [u, v] = applyHomography(H, [x, y])
          if (u > 0.1 && u < 0.85 && [0.25, 0.4, 0.55, 0.7].some((l) => Math.abs(v - l) < 0.012)) c = [30, 35, 90]
        }
      }
      if (hand && Math.hypot(x - hand[0], y - hand[1]) < hand[2]) c = [200, 140, 110] // skin
      data[i] = c[0]
      data[i + 1] = c[1]
      data[i + 2] = c[2]
      data[i + 3] = 255
    }
  }
  return data
}

function rotatedRect(cx, cy, w, h, deg) {
  const a = (deg * Math.PI) / 180
  const pts = [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ]
  return orderCorners(pts.map(([x, y]) => [cx + x * Math.cos(a) - y * Math.sin(a), cy + x * Math.sin(a) + y * Math.cos(a)]))
}

function maxCornerError(found, truth) {
  return Math.max(...found.map((p, i) => Math.hypot(p[0] - truth[i][0], p[1] - truth[i][1])))
}

const W = 240
const H = 135

for (const deg of [0, 8, -15, 25, -35]) {
  test(`finds a paper rotated ${deg}°`, () => {
    const truth = rotatedRect(120, 68, 110, 80, deg)
    const res = detectPaper(makeFrame(W, H, truth), W, H)
    assert.ok(res, 'paper should be detected')
    const err = maxCornerError(res.quad, truth)
    assert.ok(err < 3.5, `corner error ${err.toFixed(2)}px`)
  })
}

test('finds a paper that runs off the edge of the frame', () => {
  const truth = [
    [30, -10],
    [210, -10],
    [210, 120],
    [30, 120],
  ]
  const res = detectPaper(makeFrame(W, H, truth), W, H)
  assert.ok(res)
  // Clipped to the frame: the top corners sit on y = 0.
  assert.ok(res.quad[0][1] <= 1 && res.quad[1][1] <= 1)
})

test('still finds the paper with a hand on it', () => {
  const truth = rotatedRect(120, 68, 120, 85, 6)
  const res = detectPaper(makeFrame(W, H, truth, { hand: [150, 95, 18] }), W, H)
  assert.ok(res)
  assert.ok(maxCornerError(res.quad, truth) < 6)
})

test('returns null when there is no paper', () => {
  const res = detectPaper(makeFrame(W, H, [[-5, -5], [-4, -5], [-4, -4], [-5, -4]], { ink: false }), W, H)
  assert.equal(res, null)
})

test('homography maps corners exactly', () => {
  const src = [
    [10, 12],
    [200, 30],
    [190, 150],
    [20, 140],
  ]
  const dst = [
    [0, 0],
    [400, 0],
    [400, 300],
    [0, 300],
  ]
  const Hm = computeHomography(src, dst)
  src.forEach((p, i) => {
    const [u, v] = applyHomography(Hm, p)
    assert.ok(Math.abs(u - dst[i][0]) < 1e-6 && Math.abs(v - dst[i][1]) < 1e-6)
  })
})

test('warpQuad flattens the paper so it fills the output', () => {
  const truth = rotatedRect(120, 68, 110, 80, 20)
  const frame = { data: makeFrame(W, H, truth, { ink: false }), width: W, height: H }
  const size = flatSize(truth, 400)
  const out = warpQuad(frame, truth, size.width, size.height)
  // Every output pixel should be paper-coloured (bright), not desk.
  let dark = 0
  for (let i = 0; i < out.data.length; i += 4) if (out.data[i] < 180) dark++
  assert.ok(dark / (out.width * out.height) < 0.03, `dark share ${dark / (out.width * out.height)}`)
  assert.ok(Math.abs(out.width / out.height - 110 / 80) < 0.05)
})
