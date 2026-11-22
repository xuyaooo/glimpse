import { onBeforeUnmount, onMounted, watch } from 'vue'
import { state } from './engine'

/*
  The engine detects both things on its own: a finished part (pencil lifted, ink settled)
  and a question (finger pointing + speech). These keys are the manual fallback, and what
  drives the demo. An MX Master button can be mapped to them in Logi Options+.
    W, C or Space  "this part is finished, read it now"
    A (hold)       "I'm pointing and asking"
  If a button only sends a quick tap rather than holding the key, a short press starts
  listening and the next press stops it.
*/
export const CUT_KEYS = ['KeyW', 'KeyC', 'Space']
export const ASK_KEYS = ['KeyA']
const TAP_MS = 250

interface Handlers {
  cut: () => void
  askStart: () => void
  askEnd: () => void
}

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && !!target.closest('input, textarea, select, [contenteditable="true"]')
}

// A dialog is open (settings, the summary, the student picker, the full-screen animation): the
// page behind it doesn't react to these keys.
const dialogOpen = () => typeof document !== 'undefined' && !!document.querySelector('[aria-modal="true"]')

// Shared by every page, so holding A on the desk and letting go on the camera page still works.
let asking = false
let toggled = false
let downAt = 0
// After a tap, A waits for a second tap to stop. Once the question is over (sent and answered,
// stopped by itself, or refused), the next tap starts a new one.
watch(
  () => state.asking,
  (a) => {
    if (a || !toggled) return
    asking = false
    toggled = false
  },
)

/** `space: false`: Space is left to the page (scrolling), only W and C read a line. */
export function useManualTriggers(handlers: Handlers, { space = true } = {}) {
  function onKeyDown(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return
    if (CUT_KEYS.includes(e.code)) {
      // Space on a focused button should press that button.
      if (e.code === 'Space' && (!space || e.target instanceof HTMLButtonElement)) return
      if (dialogOpen()) return
      e.preventDefault()
      if (!e.repeat) handlers.cut()
    } else if (ASK_KEYS.includes(e.code)) {
      if (dialogOpen() && !(asking && toggled)) return // stopping a question still works
      e.preventDefault()
      if (e.repeat) return
      if (asking && toggled) {
        asking = false
        toggled = false
        handlers.askEnd()
        return
      }
      asking = true
      downAt = performance.now()
      handlers.askStart()
    }
  }

  function onKeyUp(e: KeyboardEvent) {
    if (!ASK_KEYS.includes(e.code) || !asking || toggled) return
    if (performance.now() - downAt < TAP_MS) {
      // A tap: listen until the next tap, if a question did start.
      if (state.asking) toggled = true
      else asking = false
      return
    }
    asking = false
    handlers.askEnd()
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
  })
}
