// What Home and My work share: who's writing, opening the camera, today's numbers, and
// reacting to the engine (hints spoken, the camera opening when the reader isn't sure).
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { askStart, cutPart, endSession, pickExercise, startSession, state } from './engine'
import { useManualTriggers } from './keys'
import { speak } from './speech'
import { subjectById } from './subjects'
import { ui } from './ui'

export function useDesk() {
  const router = useRouter()
  const route = useRoute()

  // Open camera is its own full window (/scan). It needs to know who's writing: with nobody
  // picked yet, ask first and open the camera straight after.
  let cameraAfterPick = false
  function openCamera() {
    if (state.student) return void router.push({ name: 'scan' })
    cameraAfterPick = true
    ui.pickerOpen = true
  }

  // W or holding A goes straight to the camera; letting go of A there sends the question.
  useManualTriggers({
    cut: openCamera,
    askStart: () => {
      if (!state.student) return
      openCamera()
      askStart()
    },
    askEnd: () => {},
  })

  onMounted(() => {
    if (!state.student && typeof route.query.student === 'string') startSession(route.query.student)
    if (!state.student) ui.pickerOpen = true
    if ('scan' in route.query) openCamera()
    // `?autoplay`: hands-free demo for a booth or a backup video. Writes a line every few seconds.
    if ('autoplay' in route.query && state.student) {
      let lines = 0
      const tick = () => {
        if (lines++ >= 5 || state.confirm) return
        cutPart()
        window.setTimeout(tick, 3600)
      }
      window.setTimeout(tick, 1500)
    }
  })

  function pick(id: string) {
    if (id !== state.student?.id) startSession(id)
    ui.pickerOpen = false
    ui.selectedPartId = null
    if (cameraAfterPick) {
      cameraAfterPick = false
      openCamera()
    }
  }
  function closePicker() {
    ui.pickerOpen = false
    cameraAfterPick = false
  }

  function practise(id: string) {
    if (state.exercises.some((e) => e.id === id)) pickExercise(id)
    openCamera()
  }
  const next = computed(() => state.exercises.find((e) => e.id === state.currentExerciseId) ?? state.exercises[0] ?? null)
  function nextStep() {
    if (next.value) practise(next.value.id)
    else openCamera()
  }

  function end() {
    const id = state.student?.id
    endSession()
    router.push({ name: 'dashboard', params: { id } })
  }

  // ---------------------------------------------------------------- reacting to the engine

  watch(
    () => state.parts.length,
    (n, old) => {
      if (n > (old ?? 0)) ui.selectedPartId = state.parts[n - 1].id
    },
  )
  watch(
    () => state.teaching,
    (t) => {
      if (!t) return
      ui.selectedPartId = t.partId
      ui.tab = 'explanation'
    },
  )
  // The reader isn't sure: the question lives in the camera window, so go there.
  watch(
    () => state.confirm,
    (c) => c && openCamera(),
  )
  watch(
    () => state.exercises.map((e) => e.id).join(),
    (ids) => ids && ui.practicePing++,
  )
  watch(
    () => state.hint,
    (h) => h && speak(h.text, h.lang),
  )
  watch(
    () => state.answer,
    (a) => a && speak(a.text, a.lang),
  )

  // ---------------------------------------------------------------- today's numbers

  const subject = computed(() => subjectById(state.subject))
  const checked = computed(() => state.parts.filter((p) => p.verdict === 'correct' || p.verdict === 'wrong'))
  const right = computed(() => checked.value.filter((p) => p.verdict === 'correct').length)
  const accuracy = computed(() => (checked.value.length ? right.value / checked.value.length : null))
  const runs = computed(() => {
    let now = 0
    let best = 0
    for (const p of checked.value) {
      now = p.verdict === 'correct' ? now + 1 : 0
      best = Math.max(best, now)
    }
    return { now, best }
  })
  /** A mistake that was taught, then a similar exercise got right. */
  const fixed = computed(() => state.teachings.some((t) => state.parts.some((p) => p.id > t.partId && p.exerciseId && p.verdict === 'correct')))

  const greeting = computed(() => {
    const h = new Date().getHours()
    const part = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
    return state.student ? `${part}, ${state.student.name}!` : `${part}!`
  })
  const subtitle = computed(() => {
    const last = checked.value[checked.value.length - 1]
    if (!last) return 'Open the camera and write your first line.'
    if (fixed.value && last.verdict === 'correct') return 'It clicked! Keep going.'
    if (last.verdict === 'wrong') return "Mistakes help you learn. Let's look at it together."
    return "Keep going, you're doing great!"
  })

  return { openCamera, pick, closePicker, practise, next, nextStep, end, subject, checked, right, accuracy, runs, fixed, greeting, subtitle }
}
