// Image helpers for the server (pure JS, no native dependencies).
import jpeg from 'jpeg-js'

export class BadRequest extends Error {}

// "data:image/jpeg;base64,..." -> { mime, base64, buffer }
export function parseDataUrl(dataUrl, field = 'image') {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    throw new BadRequest(`"${field}" must be a data URL like "data:image/jpeg;base64,..."`)
  }
  const comma = dataUrl.indexOf(',')
  const mime = dataUrl.slice(5, dataUrl.indexOf(';'))
  const base64 = dataUrl.slice(comma + 1)
  return { mime, base64, buffer: Buffer.from(base64, 'base64') }
}

// JPEG bytes -> { data: RGBA Uint8Array, width, height }
export function decodeJpeg(buffer) {
  try {
    return jpeg.decode(buffer, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 512 })
  } catch (err) {
    throw new BadRequest(`Could not decode the image as JPEG: ${err.message}`)
  }
}

// Crop a pixel box out of an RGBA image and encode it as a JPEG data URL.
export function cropToDataUrl(img, { x0, y0, x1, y1 }, quality = 90) {
  const cx0 = Math.max(0, Math.floor(x0))
  const cy0 = Math.max(0, Math.floor(y0))
  const cw = Math.max(1, Math.min(img.width, Math.ceil(x1)) - cx0)
  const ch = Math.max(1, Math.min(img.height, Math.ceil(y1)) - cy0)
  const data = new Uint8Array(cw * ch * 4)
  for (let y = 0; y < ch; y++) {
    const src = ((cy0 + y) * img.width + cx0) * 4
    data.set(img.data.subarray(src, src + cw * 4), y * cw * 4)
  }
  const out = jpeg.encode({ data, width: cw, height: ch }, quality)
  return { dataUrl: `data:image/jpeg;base64,${Buffer.from(out.data).toString('base64')}`, width: cw, height: ch }
}

// Box-filter downscale of an RGBA image to grayscale, at most `maxW` wide.
export function grayThumbnail(img, maxW = 1000) {
  const scale = Math.min(1, maxW / img.width)
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  const gray = new Uint8ClampedArray(w * h)
  for (let y = 0; y < h; y++) {
    const sy0 = Math.floor(y / scale)
    const sy1 = Math.max(sy0 + 1, Math.floor((y + 1) / scale))
    for (let x = 0; x < w; x++) {
      const sx0 = Math.floor(x / scale)
      const sx1 = Math.max(sx0 + 1, Math.floor((x + 1) / scale))
      let sum = 0
      let n = 0
      for (let yy = sy0; yy < sy1 && yy < img.height; yy++) {
        for (let xx = sx0; xx < sx1 && xx < img.width; xx++) {
          const p = (yy * img.width + xx) * 4
          sum += 0.299 * img.data[p] + 0.587 * img.data[p + 1] + 0.114 * img.data[p + 2]
          n++
        }
      }
      gray[y * w + x] = n ? sum / n : 255
    }
  }
  return { gray, width: w, height: h, scale }
}

// Box-filter resize of an RGBA image so its longer side is at most maxSide.
export function resizeRgba(img, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
  if (scale === 1) return { data: new Uint8Array(img.data), width: img.width, height: img.height }
  const w = Math.round(img.width * scale)
  const h = Math.round(img.height * scale)
  const out = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y / scale)
    const y1 = Math.max(y0 + 1, Math.min(img.height, Math.floor((y + 1) / scale)))
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x / scale)
      const x1 = Math.max(x0 + 1, Math.min(img.width, Math.floor((x + 1) / scale)))
      let r = 0
      let g = 0
      let b = 0
      let n = 0
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const p = (yy * img.width + xx) * 4
          r += img.data[p]
          g += img.data[p + 1]
          b += img.data[p + 2]
          n++
        }
      }
      const o = (y * w + x) * 4
      out[o] = r / n
      out[o + 1] = g / n
      out[o + 2] = b / n
      out[o + 3] = 255
    }
  }
  return { data: out, width: w, height: h }
}

// Draw a ring (e.g. a red circle marking where the student points). Modifies img.
export function drawRing(img, cx, cy, radius, thickness, [r, g, b]) {
  const x0 = Math.max(0, Math.floor(cx - radius - thickness))
  const x1 = Math.min(img.width - 1, Math.ceil(cx + radius + thickness))
  const y0 = Math.max(0, Math.floor(cy - radius - thickness))
  const y1 = Math.min(img.height - 1, Math.ceil(cy + radius + thickness))
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (Math.abs(Math.hypot(x - cx, y - cy) - radius) > thickness / 2) continue
      const p = (y * img.width + x) * 4
      img.data[p] = r
      img.data[p + 1] = g
      img.data[p + 2] = b
    }
  }
  return img
}

export function toJpegBase64(img, quality = 88) {
  return Buffer.from(jpeg.encode({ data: img.data, width: img.width, height: img.height }, quality).data).toString('base64')
}
