import { onBeforeUnmount, ref, watch } from 'vue'
import { prefersReducedMotion } from './ui'

/** A number that counts up (or down) to its new value instead of jumping. */
export function useCountUp(source: () => number, ms = 900) {
  const shown = ref(0)
  let frame = 0

  watch(
    source,
    (to) => {
      cancelAnimationFrame(frame)
      if (prefersReducedMotion()) {
        shown.value = to
        return
      }
      const from = shown.value
      // Measure from the first frame's own timestamp: rAF time and performance.now() can differ.
      let start = -1
      const tick = (now: number) => {
        if (start < 0) start = now
        const k = Math.min(1, Math.max(0, (now - start) / ms))
        shown.value = Math.round(from + (to - from) * (1 - (1 - k) ** 3))
        if (k < 1) frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    },
    { immediate: true },
  )

  onBeforeUnmount(() => cancelAnimationFrame(frame))
  return shown
}
