// The webcam, opened by the browser (the MX Brio is a standard UVC camera). Video never
// leaves this page: only a finished line, or one frame when an engine asks for it, is sent.
import { onBeforeUnmount, ref } from 'vue'
import type { Rect } from './geometry'

export type CameraStatus = 'idle' | 'starting' | 'live' | 'denied' | 'missing' | 'error'

const PREF = 'glimpse.camera'
const remember = (id: string) => {
  try {
    localStorage.setItem(PREF, id)
  } catch {
    // private mode: fine, we just won't remember
  }
}
const remembered = () => {
  try {
    return localStorage.getItem(PREF) ?? ''
  } catch {
    return ''
  }
}

export function useCamera() {
  const stream = ref<MediaStream | null>(null)
  const status = ref<CameraStatus>('idle')
  const devices = ref<{ id: string; label: string }[]>([])
  const deviceId = ref('')
  const label = ref('')
  const message = ref('')

  function stop() {
    stream.value?.getTracks().forEach((t) => t.stop())
    stream.value = null
  }

  async function start(id = remembered()) {
    stop()
    if (!navigator.mediaDevices?.getUserMedia) {
      status.value = 'missing'
      message.value = window.isSecureContext
        ? 'This browser can’t open a camera. Use Chrome, Edge or Safari.'
        : `Browsers only open the camera on http://localhost. Open http://localhost:${location.port || '5173'} on this computer.`
      return
    }
    status.value = 'starting'
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: id ? { ideal: id } : undefined, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
        audio: false,
      })
      stream.value = s
      const track = s.getVideoTracks()[0]
      deviceId.value = track.getSettings().deviceId ?? ''
      label.value = track.label || 'Camera'
      devices.value = (await navigator.mediaDevices.enumerateDevices())
        .filter((d) => d.kind === 'videoinput')
        .map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` }))
      status.value = 'live'
      // First time here: prefer the Logitech Brio if it's plugged in.
      if (!id) {
        const brio = devices.value.find((d) => /brio/i.test(d.label))
        if (brio && brio.id !== deviceId.value) return start(brio.id)
      }
      remember(deviceId.value)
    } catch (e) {
      const name = e instanceof DOMException ? e.name : ''
      const text = e instanceof Error ? e.message : ''
      if (name === 'NotAllowedError' && /system/i.test(text)) {
        // Chrome on macOS: the site is allowed but the Mac blocks the browser.
        status.value = 'denied'
        message.value = 'Your Mac is blocking the camera for this browser. Open System Settings, Privacy & Security, Camera, turn your browser on, restart it, then try again.'
      } else if (name === 'NotAllowedError' || name === 'SecurityError') {
        status.value = 'denied'
        message.value = 'The camera is blocked for this page. Click the camera icon in the address bar, choose Allow, then try again.'
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        status.value = 'missing'
        message.value = 'No camera found. Plug in the MX Brio, then try again.'
      } else {
        status.value = 'error'
        message.value = 'The camera didn’t start. Another app may be using it (Zoom, Teams, Logi Tune): close it, then try again.'
      }
    }
  }

  onBeforeUnmount(stop)
  return { stream, status, devices, deviceId, label, message, start, stop }
}

/** Copy a region of the video into a JPEG. `rotated` = the picture is shown upside down-corrected. */
export function grab(video: HTMLVideoElement, region: Rect | null, rotated: boolean, maxSide = 1600, quality = 0.85): string | null {
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh) return null
  const r = region ?? { x: 0, y: 0, w: vw, h: vh }
  const scale = Math.min(1, maxSide / Math.max(r.w, r.h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(r.w * scale)
  canvas.height = Math.round(r.h * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  if (rotated) {
    ctx.translate(canvas.width, canvas.height)
    ctx.rotate(Math.PI)
    ctx.drawImage(video, vw - r.x - r.w, vh - r.y - r.h, r.w, r.h, 0, 0, canvas.width, canvas.height)
  } else {
    ctx.drawImage(video, r.x, r.y, r.w, r.h, 0, 0, canvas.width, canvas.height)
  }
  return canvas.toDataURL('image/jpeg', quality)
}
