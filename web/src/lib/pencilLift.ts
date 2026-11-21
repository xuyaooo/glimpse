// Notices the pencil being lifted, in the browser: compares tiny greyscale copies of the sheet
// five times a second. Movement (hand, pencil) then 1.2 s of stillness = a finished line.
import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import { sheetRect } from './geometry'

const W = 64
const H = 90
const PIXEL_CHANGE = 22 // 0–255 grey levels
const MOVING_SHARE = 0.012 // of the sheet's pixels
const STILL_MS = 1200
const MIN_WRITING_MS = 500

export function usePencilLift(video: Ref<HTMLVideoElement | null>, active: () => boolean, onLift: () => void) {
  const moving = ref(false)
  let prev: Uint8ClampedArray | null = null
  let lastMotion = 0
  let motionSince = 0
  let timer = 0
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d', { willReadFrequently: true })

  function tick() {
    const v = video.value
    if (!ctx || !v || v.readyState < 2 || !v.videoWidth || !active()) {
      prev = null
      moving.value = false
      return
    }
    const r = sheetRect(v.videoWidth, v.videoHeight)
    ctx.drawImage(v, r.x, r.y, r.w, r.h, 0, 0, W, H)
    const data = ctx.getImageData(0, 0, W, H).data
    if (prev) {
      let changed = 0
      for (let i = 0; i < data.length; i += 4) {
        const now = data[i] + data[i + 1] + data[i + 2]
        const before = prev[i] + prev[i + 1] + prev[i + 2]
        if (Math.abs(now - before) > PIXEL_CHANGE * 3) changed++
      }
      const t = performance.now()
      if (changed / (W * H) > MOVING_SHARE) {
        if (!moving.value) motionSince = t
        lastMotion = t
        moving.value = true
      } else if (moving.value && t - lastMotion > STILL_MS) {
        moving.value = false
        if (lastMotion - motionSince > MIN_WRITING_MS) onLift()
      }
    }
    prev = new Uint8ClampedArray(data)
  }

  onMounted(() => (timer = window.setInterval(tick, 200)))
  onBeforeUnmount(() => window.clearInterval(timer))
  return { moving }
}
