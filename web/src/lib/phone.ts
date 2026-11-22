// A phone as the camera. This computer makes a WebRTC offer (to receive video), shows it as a QR
// code (a link with a short code); the phone opens /phone?c=CODE, turns its back camera on and
// answers. The engine only passes those two messages along (/api/pair); the video goes straight
// from the phone to this computer, on the same Wi-Fi.
// (On a Mac, an iPhone nearby can also simply be picked as a camera: Continuity Camera.)
import { reactive, shallowRef } from 'vue'

export type PhoneStatus = 'idle' | 'making' | 'waiting' | 'connecting' | 'live' | 'failed'

export const phone = reactive({ status: 'idle' as PhoneStatus, code: '', url: '', message: '' })
/** The phone's video, once it is connected: the scan page uses it as its camera. */
export const phoneStream = shallowRef<MediaStream | null>(null)

const ICE: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }]
const WAIT_MS = 10 * 60 * 1000

/** Every address of this device in the description (no messages back and forth for them). */
function gathered(pc: RTCPeerConnection, ms = 3000) {
  return new Promise<void>((resolve) => {
    if (pc.iceGatheringState === 'complete') return resolve()
    const done = () => {
      pc.removeEventListener('icegatheringstatechange', check)
      resolve()
    }
    const check = () => pc.iceGatheringState === 'complete' && done()
    pc.addEventListener('icegatheringstatechange', check)
    setTimeout(done, ms) // enough addresses by now
  })
}

async function json(r: Response) {
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(body?.error || `The engine answered ${r.status}.`)
  return body
}

// ------------------------------------------------------------------ this computer

let pc: RTCPeerConnection | null = null
let polling = 0

export function disconnectPhone() {
  window.clearTimeout(polling)
  polling = 0
  pc?.close()
  pc = null
  phoneStream.value = null
  Object.assign(phone, { status: 'idle', code: '', url: '', message: '' })
}

/** A new code (and QR) to connect a phone; the phone's video arrives in phoneStream. */
export async function connectPhone() {
  disconnectPhone()
  if (typeof RTCPeerConnection === 'undefined') {
    Object.assign(phone, { status: 'failed', message: 'This browser can’t receive video from a phone.' })
    return
  }
  phone.status = 'making'
  const me = new RTCPeerConnection({ iceServers: ICE })
  pc = me
  me.addTransceiver('video', { direction: 'recvonly' })
  me.ontrack = (e) => {
    phoneStream.value = e.streams[0] ?? new MediaStream([e.track])
    phone.status = 'live'
    phone.message = ''
  }
  me.onconnectionstatechange = () => {
    if (pc !== me) return
    if (me.connectionState === 'failed') {
      phoneStream.value = null
      Object.assign(phone, { status: 'failed', message: 'The phone couldn’t reach this computer. Put both on the same Wi-Fi, then make a new code.' })
    } else if (me.connectionState === 'disconnected' || me.connectionState === 'closed') {
      phoneStream.value = null
      if (phone.status === 'live') Object.assign(phone, { status: 'idle', message: 'The phone stopped sending its camera.' })
    }
  }
  try {
    await me.setLocalDescription(await me.createOffer())
    await gathered(me)
    const { code } = await json(await fetch('/api/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ offer: me.localDescription?.sdp }) }))
    if (pc !== me) return
    Object.assign(phone, { status: 'waiting', code, url: `${location.origin}/phone?c=${code}` })
    const until = Date.now() + WAIT_MS
    const poll = async () => {
      if (pc !== me) return
      try {
        const { answer } = await json(await fetch(`/api/pair/${code}`, { cache: 'no-store' }))
        if (answer) {
          phone.status = 'connecting'
          await me.setRemoteDescription({ type: 'answer', sdp: answer })
          return
        }
      } catch (e) {
        // a hiccup: try again (an expired code ends below)
        if (Date.now() > until) throw e
      }
      if (Date.now() > until) return void Object.assign(phone, { status: 'failed', message: 'No phone connected in 10 minutes. Make a new code.' })
      polling = window.setTimeout(poll, 1500)
    }
    await poll()
  } catch (e) {
    if (pc !== me) return
    Object.assign(phone, { status: 'failed', message: e instanceof Error ? e.message : 'Something went wrong. Try again.' })
  }
}

// ------------------------------------------------------------------ the phone

/** On the phone: answer the computer's offer with this camera. Returns the connection. */
export async function answerWithCamera(code: string, camera: MediaStream, onState: (s: RTCPeerConnectionState) => void) {
  const { offer } = await json(await fetch(`/api/pair/${encodeURIComponent(code)}`, { cache: 'no-store' }))
  const me = new RTCPeerConnection({ iceServers: ICE })
  me.onconnectionstatechange = () => onState(me.connectionState)
  for (const track of camera.getVideoTracks()) {
    // handwriting: keep the detail (full resolution, sharp) rather than smooth motion
    track.contentHint = 'detail'
    const sender = me.addTrack(track, camera)
    const params = sender.getParameters()
    params.degradationPreference = 'maintain-resolution'
    if (params.encodings?.length) params.encodings[0].maxBitrate = 4_000_000
    await sender.setParameters(params).catch(() => {}) // not every browser takes them before connecting
  }
  await me.setRemoteDescription({ type: 'offer', sdp: offer })
  await me.setLocalDescription(await me.createAnswer())
  await gathered(me)
  await json(await fetch(`/api/pair/${encodeURIComponent(code)}/answer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answer: me.localDescription?.sdp }) }))
  return me
}
