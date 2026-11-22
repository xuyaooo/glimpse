// Finding the exercise a student points at, on a flattened page photo.
//   locateExercise():      layout analysis (blocks of writing) picks the block at the finger.
//   readPointedExercise(): the tutor's vision model looks at the page itself, with a red
//                          circle where the finger points, and transcribes that exercise.
import { findBlocks, pickBlock } from './vision/layout.js'
import { decodeJpeg, cropToDataUrl, grayThumbnail, resizeRgba, drawRing, toJpegBase64 } from './images.js'
import { chat } from './ollama.js'
import { thinkValue, profileOf } from './tutor.js'

const clamp01 = (v) => Math.min(1, Math.max(0, v))

// page: JPEG bytes of the flattened page. point: { x, y } normalized (0-1) on that page.
// Returns { box, blocks, found, crop } with box/blocks normalized to the page.
export function locateExercise(pageJpeg, point, decoded) {
  const img = decoded || decodeJpeg(pageJpeg)
  const { gray, width: w, height: h } = grayThumbnail(img, 1000)
  const { blocks, lineHeight } = findBlocks(gray, w, h)

  const px = clamp01(point.x) * w
  const py = clamp01(point.y) * h
  const block = pickBlock(blocks, px, py, { maxDist: 0.3 * Math.max(w, h) })

  let box
  if (block) {
    const pad = Math.max(6, lineHeight * 0.7)
    box = {
      x0: clamp01((block.x0 - pad) / w),
      y0: clamp01((block.y0 - pad) / h),
      x1: clamp01((block.x1 + pad) / w),
      y1: clamp01((block.y1 + pad) / h),
    }
  } else {
    // Nothing written near the finger: take a band of the page around it.
    box = { x0: 0, y0: clamp01(point.y - 0.15), x1: 1, y1: clamp01(point.y + 0.05) }
  }

  const crop = cropToDataUrl(img, {
    x0: box.x0 * img.width,
    y0: box.y0 * img.height,
    x1: box.x1 * img.width,
    y1: box.y1 * img.height,
  })

  return {
    box,
    found: Boolean(block),
    blocks: blocks.map((b) => ({ x0: b.x0 / w, y0: b.y0 / h, x1: (b.x1 + 1) / w, y1: (b.y1 + 1) / h, lines: b.lines })),
    crop,
  }
}

const POINT_PROMPT = `This is a photo of a student's worksheet or notebook page. The student is pointing at one exercise; the spot is marked with a RED CIRCLE.
Find the exercise at, under or right next to the red circle and transcribe the WHOLE exercise exactly as written:
- Start from its number or letter and its main instruction (e.g. "1) Calculate:").
- Include EVERY part that belongs to it (a), b), c)..., all lines, expressions and answer choices), even if the circle is on only one part.
- Stop before the next exercise number. Do not include other exercises.
- Keep the line breaks. Write math in LaTeX: inline $...$.
- Do not solve it. Do not add, fix or skip anything. Ignore the red circle itself.`

const POINT_SCHEMA = {
  type: 'object',
  properties: { exercise: { type: 'string' } },
  required: ['exercise'],
}

// Vision model reads the pointed exercise directly (no GLM-OCR).
// Returns { text, box, found, crop, method: 'vision', model }.
export async function readPointedExercise(pageJpeg, point, model, { maxSide = 1280 } = {}) {
  const img = decodeJpeg(pageJpeg)
  const layout = locateExercise(pageJpeg, point, img) // fallback box for the outline/crop

  const view = resizeRgba(img, maxSide)
  const r = Math.max(14, Math.round(Math.max(view.width, view.height) * 0.03))
  drawRing(view, clamp01(point.x) * view.width, clamp01(point.y) * view.height, r, Math.max(4, r / 4), [235, 30, 30])

  const out = await chat({
    model,
    think: thinkValue(model, false),
    format: POINT_SCHEMA,
    options: { temperature: 0, num_ctx: 8192, num_predict: 900 + profileOf(model).hiddenTokens },
    messages: [{ role: 'user', content: POINT_PROMPT, images: [toJpegBase64(view)] }],
  })
  let parsed
  try {
    parsed = JSON.parse(out.content)
  } catch {
    parsed = { exercise: out.content }
  }

  // Outline + cut-out come from layout analysis: measured, models' own boxes were often
  // off by 10-20% of the page. When the finger is near no block, use the whole page.
  const box = layout.found ? layout.box : { x0: 0, y0: 0, x1: 1, y1: 1 }
  const boxFrom = layout.found ? 'layout' : 'page'
  const crop = cropToDataUrl(img, { x0: box.x0 * img.width, y0: box.y0 * img.height, x1: box.x1 * img.width, y1: box.y1 * img.height })
  return {
    text: String(parsed.exercise || '').trim(),
    box,
    boxFrom,
    found: true,
    blocks: layout.blocks,
    crop,
    method: 'vision',
    model,
  }
}
