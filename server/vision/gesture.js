import { convexHull } from './paper.js'

// Hand gestures from MediaPipe's 21 hand landmarks (normalized x/y).
//   0 wrist · thumb 1-4 · index 5-8 · middle 9-12 · ring 13-16 · pinky 17-20
//   (for each finger: MCP knuckle, PIP, DIP, tip)

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

// Cosine of the bend at b (1 = perfectly straight).
function straightness(a, b, c) {
  const v1x = b.x - a.x
  const v1y = b.y - a.y
  const v2x = c.x - b.x
  const v2y = c.y - b.y
  const n = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y) || 1
  return (v1x * v2x + v1y * v2y) / n
}

// Pointing = index finger straight and stretched out, at least two of the other
// fingers curled, and the thumb not touching the index tip (that would be a pen grip).
export function isPointing(lm) {
  if (!lm || lm.length < 21) return false
  const wrist = lm[0]
  const palm = dist(wrist, lm[9]) || 1e-6
  const indexStraight = straightness(lm[5], lm[6], lm[7]) > 0.8 && straightness(lm[6], lm[7], lm[8]) > 0.8
  const indexOut = dist(wrist, lm[8]) > dist(wrist, lm[6]) * 1.15 && dist(lm[5], lm[8]) > palm * 0.6
  const curled = [
    [12, 10],
    [16, 14],
    [20, 18],
  ].filter(([tip, pip]) => dist(wrist, lm[tip]) < dist(wrist, lm[pip]) * 1.05).length
  const thumbAway = dist(lm[4], lm[8]) > palm * 0.55
  return indexStraight && indexOut && curled >= 2 && thumbAway
}

export const fingertip = (lm) => [lm[8].x, lm[8].y]

// A hand as a polygon in pixels (w x h): convex hull of its 21 points, enlarged to cover
// the fingers' width (the points are joint centers). Landmarks: {x, y} or [x, y], 0-1.
export function handPolygon(lm, w, h) {
  const hull = convexHull(lm.map((p) => (Array.isArray(p) ? [p[0] * w, p[1] * h] : [p.x * w, p.y * h])))
  if (hull.length < 3) return null
  const cx = hull.reduce((s, p) => s + p[0], 0) / hull.length
  const cy = hull.reduce((s, p) => s + p[1], 0) / hull.length
  return hull.map(([x, y]) => {
    const d = Math.hypot(x - cx, y - cy) || 1
    const grow = 1.2 + 6 / d // 20% bigger plus ~6 px margin
    return [cx + (x - cx) * grow, cy + (y - cy) * grow]
  })
}
