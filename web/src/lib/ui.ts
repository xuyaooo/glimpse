// Screen state that only the web app cares about.
import { reactive } from 'vue'

export const ui = reactive({
  pickerOpen: false,
  /** The line whose reasoning is on show (desk whiteboard, camera overlay). */
  selectedPartId: null as number | null,
  tab: 'summary' as 'summary' | 'explanation',
  search: '',
  /** Bump to fire confetti. */
  confetti: 0,
  /** Bump to draw attention to the practice card. */
  practicePing: 0,
  /** What the camera saw for each line: a crop of the real handwriting (JPEG data URL). */
  crops: {} as Record<number, string>,
  /** Taken at the moment the pencil lifted; attached to the next line that arrives. */
  pendingCrop: null as string | null,
})

export const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
