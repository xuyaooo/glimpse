import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isPointing } from '../server/vision/gesture.js'

// Build a simple 2D hand: wrist at the bottom, fingers pointing up (y decreases).
// Each finger is 'ext' (straight, stretched) or 'curl' (tip folded back toward the palm).
function hand({ index = 'curl', middle = 'curl', ring = 'curl', pinky = 'curl', thumbTip = null } = {}) {
  const lm = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }))
  lm[0] = { x: 0.5, y: 0.8, z: 0 }
  const bases = { index: [5, 0.44], middle: [9, 0.5], ring: [13, 0.56], pinky: [17, 0.61] }
  const states = { index, middle, ring, pinky }
  for (const [name, [mcp, x]] of Object.entries(bases)) {
    const yM = 0.62
    lm[mcp] = { x, y: yM, z: 0 }
    if (states[name] === 'ext') {
      lm[mcp + 1] = { x, y: yM - 0.07, z: 0 }
      lm[mcp + 2] = { x, y: yM - 0.12, z: 0 }
      lm[mcp + 3] = { x, y: yM - 0.16, z: 0 }
    } else {
      lm[mcp + 1] = { x, y: yM - 0.05, z: 0 } // PIP up
      lm[mcp + 2] = { x: x + 0.005, y: yM - 0.02, z: 0 } // DIP folds back
      lm[mcp + 3] = { x: x + 0.01, y: yM + 0.02, z: 0 } // tip near the palm
    }
  }
  lm[1] = { x: 0.43, y: 0.74, z: 0 }
  lm[2] = { x: 0.39, y: 0.7, z: 0 }
  lm[3] = { x: 0.37, y: 0.66, z: 0 }
  lm[4] = thumbTip ?? { x: 0.42, y: 0.64, z: 0 } // tucked against the palm
  return lm
}

test('index out, others curled = pointing', () => {
  assert.equal(isPointing(hand({ index: 'ext' })), true)
})

test('open palm is not pointing', () => {
  assert.equal(isPointing(hand({ index: 'ext', middle: 'ext', ring: 'ext', pinky: 'ext' })), false)
})

test('fist is not pointing', () => {
  assert.equal(isPointing(hand()), false)
})

test('pen grip (thumb touching index tip) is not pointing', () => {
  const lm = hand({ index: 'ext' })
  assert.equal(isPointing(hand({ index: 'ext', thumbTip: { x: lm[8].x + 0.01, y: lm[8].y + 0.01, z: 0 } })), false)
})
