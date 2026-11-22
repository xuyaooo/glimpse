// Hands on the camera, in the browser: MediaPipe Hand Landmarker (files served from
// /mediapipe/wasm and /models, so it works offline). Finds up to two hands about 20 times a
// second, and notices pointing: index finger out, the other fingers curled, the thumb away
// from the index (not a pencil grip). Pointing at the same spot for a moment = "about this".
import { onBeforeUnmount, onMounted, ref, shallowRef, type Ref } from 'vue'
import type { HandLandmarker } from '@mediapipe/tasks-vision'

export interface Pt {
  x: number
  y: number
}

/** The 21 hand points (0 wrist, 4 thumb tip, 8 index tip...), joined like a skeleton. */
export const HAND_BONES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
]

const DWELL_MS = 1000 // hold the fingertip still this long to ask
const STILL = 0.035 // how far the fingertip may wander while holding (share of the picture)
const COOLDOWN_MS = 4000 // after asking, before asking again
const FRAME_MS = 50
const GRACE_MS = 400 // the hand lost for a moment (a missed frame) is still the same point

// Development only: window.__glimpseFakeHand(points | null) stands in for the camera's hand
// (21 points, 0-1 as shown), to test the drawing and the asking without a real hand.
let fakeHand: Pt[] | null = null
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__glimpseFakeHand = (lm: Pt[] | null) => (fakeHand = lm)

let loading: Promise<HandLandmarker> | null = null
function loadTracker() {
  loading ??= (async () => {
    const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision')
    const fileset = await FilesetResolver.forVisionTasks('/mediapipe/wasm')
    const options = (delegate: 'GPU' | 'CPU') => ({
      baseOptions: { modelAssetPath: '/models/hand_landmarker.task', delegate },
      runningMode: 'VIDEO' as const,
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    })
    try {
      return await HandLandmarker.createFromOptions(fileset, options('GPU'))
    } catch {
      return await HandLandmarker.createFromOptions(fileset, options('CPU'))
    }
  })()
  loading.catch(() => (loading = null)) // try again next time
  return loading
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)
// Cosine of the bend at b (1 = perfectly straight).
function straightness(a: Pt, b: Pt, c: Pt) {
  const n = Math.hypot(b.x - a.x, b.y - a.y) * Math.hypot(c.x - b.x, c.y - b.y) || 1
  return ((b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y)) / n
}

/**
 * `aspect`: the picture's width / height. The points are 0-1 across and 0-1 down, so they are
 * made square first: a finger is judged the same whichever way it comes into the picture.
 */
export function isPointing(points: Pt[], aspect = 1) {
  if (points.length < 21) return false
  const lm = aspect === 1 ? points : points.map((p) => ({ x: p.x * aspect, y: p.y }))
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

// How far the fingertip moved, the same in every direction (the picture is wider than tall).
const moved = (a: Pt, b: Pt, aspect: number) => Math.hypot((a.x - b.x) * Math.sqrt(aspect), (a.y - b.y) / Math.sqrt(aspect))

/** onPoint: return false when the point was ignored (nothing asked): no "Got it!", no cooldown. */
export function useHands(
  video: Ref<HTMLVideoElement | null>,
  opts: { enabled: () => boolean; rotated: () => boolean; onPoint: (tip: Pt) => unknown },
) {
  /** Each hand's 21 points, 0-1 in the picture as shown (and as sent). */
  const hands = shallowRef<Pt[][]>([])
  /** The pointing fingertip, while a hand points. */
  const tip = ref<Pt | null>(null)
  /** 0-1: how long the fingertip has been held still; 1 = asked. */
  const dwell = ref(0)
  const status = ref<'off' | 'loading' | 'on' | 'error'>('off')

  let tracker: HandLandmarker | null = null
  let raf = 0
  let lastRun = 0
  let lastVideoTime = -1
  let anchor: Pt | null = null
  let since = 0
  let fired = false
  let cooldownUntil = 0
  let lastTip: { at: number; p: Pt } | null = null
  let alive = true

  function reset() {
    hands.value = []
    tip.value = null
    dwell.value = 0
    anchor = null
    fired = false
  }

  function loop(now: number) {
    if (!alive) return
    raf = requestAnimationFrame(loop)
    const v = video.value
    if ((!tracker && !fakeHand) || !v || v.readyState < 2 || !opts.enabled()) {
      if (hands.value.length || tip.value) reset()
      return
    }
    if (now - lastRun < FRAME_MS || (!fakeHand && v.currentTime === lastVideoTime)) return
    lastRun = now
    lastVideoTime = v.currentTime
    let found: Pt[][]
    if (fakeHand) found = [fakeHand]
    else {
      let result
      try {
        result = tracker!.detectForVideo(v, now)
      } catch {
        return
      }
      const flip = opts.rotated() // the picture is shown and sent turned upside down
      found = (result.landmarks ?? []).map((lm) => lm.map((p) => (flip ? { x: 1 - p.x, y: 1 - p.y } : { x: p.x, y: p.y })))
    }
    hands.value = found

    const aspect = v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : 1
    const pointer = found.find((lm) => isPointing(lm, aspect))
    if (!pointer) {
      tip.value = null
      dwell.value = 0
      // A finger held on one spot asks once: only a hand gone for a while is a new point.
      if (!lastTip || now - lastTip.at > GRACE_MS) {
        anchor = null
        fired = false
      }
      return
    }
    const p = pointer[8]
    tip.value = p
    lastTip = { at: now, p }
    if (!anchor || moved(anchor, p, aspect) > STILL) {
      anchor = p
      since = now
      fired = false
    }
    if (fired) return
    // The ring only closes ("Got it!") when it can ask: it waits just short of full while cooling down.
    dwell.value = Math.min(now >= cooldownUntil ? 1 : 0.95, (now - since) / DWELL_MS)
    if (dwell.value >= 1) {
      fired = true
      if (opts.onPoint(p) === false) dwell.value = 0 // ignored: nothing asked
      else cooldownUntil = now + COOLDOWN_MS
    }
  }

  onMounted(async () => {
    status.value = 'loading'
    try {
      tracker = await loadTracker()
      status.value = 'on'
    } catch (err) {
      console.warn('Glimpse: hand tracking unavailable', err)
      status.value = 'error'
    }
    if (alive) raf = requestAnimationFrame(loop) // not if the page was left while loading
  })
  onBeforeUnmount(() => {
    alive = false
    cancelAnimationFrame(raf)
  })

  return {
    hands,
    tip,
    dwell,
    status,
    /** The fingertip if a hand pointed in the last few seconds (for "Ask" by button or key). */
    recentTip: (ms = 3000) => (lastTip && performance.now() - lastTip.at < ms ? lastTip.p : null),
    /** True while a hand points, or just did: don't read a line then. */
    busy: (ms = 2500) => !!tip.value || (!!lastTip && performance.now() - lastTip.at < ms),
  }
}
