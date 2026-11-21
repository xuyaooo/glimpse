import { onBeforeUnmount, ref, watch } from 'vue'
import { prefersReducedMotion } from './ui'

/** Steps through an explanation on its own, restarting whenever `key` changes. */
export function useStepPlayer(key: () => string, last: () => number, gapMs = 2400) {
  const step = ref(0)
  let timers: number[] = []
  const clear = () => {
    timers.forEach(clearTimeout)
    timers = []
  }

  function play() {
    clear()
    if (prefersReducedMotion()) {
      step.value = last()
      return
    }
    step.value = 0
    for (let i = 1; i <= last(); i++) timers.push(window.setTimeout(() => (step.value = i), gapMs * i))
  }

  function go(n: number) {
    clear()
    step.value = Math.max(0, Math.min(last(), n))
  }

  watch(key, play, { immediate: true })
  onBeforeUnmount(clear)
  return { step, play, go }
}
