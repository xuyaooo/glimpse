// The animation player, shared by the little video card on the camera (dock) and full screen.
// A new animation is only *offered* (a poster with a play button): it never pops up by itself.
// Playing: Glim narrates each step, and the next step starts when the narration is done.
import { reactive } from 'vue'
import { narrate, speechTurn, stopSpeaking } from './speech'
import type { Scene, WorkedSteps } from './types'

export type PlayerMode = 'poster' | 'dock' | 'full'

export const player = reactive({
  steps: null as WorkedSteps | null,
  /** null: hidden; poster: ready to play; dock: playing on the camera; full: full screen. */
  mode: null as PlayerMode | null,
  stage: 0,
  playing: false,
  finished: false,
  /** Bumped at every start, so the title card and confetti replay. */
  run: 0,
  /** When this run started (Date.now()): its title card shows for its first 1.6 s. */
  startedAt: 0,
  burst: 0,
  /** A newer animation that arrived while this one was playing (or open full screen). */
  pending: null as WorkedSteps | null,
})

let token = 0
/** The last step whose narration was heard to the end (-1: none), so Play goes on from there. */
let told = -1
/** The animation on show, sent again with more steps while it was being watched: used next time. */
let upgrade: WorkedSteps | null = null
const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms))
const stages = () => player.steps?.scene?.stages ?? []
const sameStages = (a: Scene | undefined, b: Scene) => !!a && a.stages.length === b.stages.length && a.stages.every((s, i) => s.caption === b.stages[i].caption)

/** About how long a step lasts (narration + pause), for the progress bar and the duration. */
export const stepMs = (caption: string) => Math.max(2200, caption.length * 62 + 900)
export const totalMs = (s: WorkedSteps | null) => (s?.scene?.stages ?? []).reduce((t, st) => t + stepMs(st.caption), 1600)

// Other speech cut in (a "Hear it" button, the microphone opening): stop here, without talking
// over it. Play tells this step again.
function interrupted() {
  token++
  player.playing = false
}

async function tell(i: number, title = false) {
  const my = ++token
  player.stage = i
  player.finished = false
  told = -1
  const st = stages()[i]
  if (!st || !player.steps) return
  if (title) {
    const turn = speechTurn()
    await wait(1500) // the title card (only shown when playing from the start)
    if (my !== token) return
    if (speechTurn() !== turn) return interrupted()
  }
  const said = await narrate(st.caption, player.steps.lang)
  if (my !== token) return
  if (!said) return interrupted()
  told = i
  const turn = speechTurn()
  await wait(650)
  if (my !== token) return
  if (speechTurn() !== turn) return interrupted()
  if (i < stages().length - 1) {
    if (player.playing) tell(i + 1)
  } else {
    player.finished = true
    player.playing = false
    player.burst++
    // A newer animation came while this one played: offer it now (not over the full screen).
    if (player.pending && player.mode !== 'full') showPending()
  }
}

function showPending() {
  const next = player.pending
  player.pending = null
  if (next) offer(next)
}

/** A new animation is ready: show its poster on the camera (unless one is playing, or open full screen). */
export function offer(steps: WorkedSteps) {
  if (!steps.scene) return
  if (player.steps?.at === steps.at) {
    // The same animation, with the written steps added. If its steps changed while it is being
    // watched, the steps on show stay as they are until it's played again.
    if (!player.mode || player.mode === 'poster' || sameStages(player.steps.scene, steps.scene)) {
      player.steps = steps
      if (player.mode === 'poster') player.stage = 0
      upgrade = null
    } else {
      player.steps = { ...steps, scene: player.steps.scene }
      upgrade = steps
    }
    return
  }
  if (player.pending?.at === steps.at || player.playing || player.mode === 'full') {
    player.pending = steps
    return
  }
  player.steps = steps
  player.pending = null // the newest animation wins
  upgrade = null
  told = -1
  player.stage = 0 // the poster shows the start, never the answer
  player.finished = false
  player.mode = 'poster'
}

/** Play (from the start), on the camera card or full screen. */
export function start(steps?: WorkedSteps, mode?: PlayerMode) {
  if (steps) player.steps = steps
  else if (upgrade && upgrade.at === player.steps?.at) player.steps = upgrade
  upgrade = null
  if (!player.steps?.scene) return
  player.mode = mode ?? (player.mode === 'full' ? 'full' : 'dock')
  player.playing = true
  player.run++
  player.startedAt = Date.now()
  stopSpeaking()
  tell(0, true)
}

export function go(i: number) {
  const n = stages().length
  if (!n) return
  stopSpeaking()
  if (player.mode === 'poster') player.mode = 'dock'
  player.playing = true
  tell(Math.max(0, Math.min(n - 1, i)))
}

export function toggle() {
  if (player.mode === 'poster' || player.finished) return start()
  if (player.playing) {
    player.playing = false
    token++
    stopSpeaking()
  } else go(told === player.stage && player.stage + 1 < stages().length ? player.stage + 1 : player.stage) // the rest of the paused step
}

export const expand = () => player.steps && (player.mode = 'full')
export function shrink() {
  if (!player.steps) return
  player.mode = 'dock'
  // Back on the camera, a newer animation that waited for the full screen is offered.
  if (!player.playing && player.pending) showPending()
}

export function close() {
  token++
  stopSpeaking()
  player.playing = false
  upgrade = null
  const next = player.pending
  player.pending = null
  player.mode = null
  if (next) offer(next)
}
