import { onBeforeUnmount, onMounted } from 'vue'

/*
  The MX Master 4 is mapped in Logi Options+ to plain keystrokes:
    thumb button        → C   "check my line"
    gesture/side button → A   "ask a question" (hold while speaking)
  Space also checks, for keyboards. If Options+ only sends a quick tap instead of holding
  the key down, a short press toggles listening on, and the next press turns it off.
*/
export const CHECK_KEYS = ['KeyC', 'Space']
export const ASK_KEYS = ['KeyA']
const TAP_MS = 250

interface Handlers {
  check: () => void
  askStart: () => void
  askEnd: () => void
}

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && !!target.closest('input, textarea, select, [contenteditable="true"]')
}

export function useMouseButtons(handlers: Handlers) {
  let asking = false
  let toggled = false
  let downAt = 0

  function onKeyDown(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return
    if (CHECK_KEYS.includes(e.code)) {
      // Space on a focused button should press that button, not check the line.
      if (e.code === 'Space' && e.target instanceof HTMLButtonElement) return
      e.preventDefault()
      if (!e.repeat) handlers.check()
    } else if (ASK_KEYS.includes(e.code)) {
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
      toggled = true
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
