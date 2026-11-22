// Reading images with GLM-OCR.
import { chat } from './ollama.js'
import { normalizeOcrMath } from './ocrText.js'

export const OCR_MODEL = process.env.OCR_MODEL || 'glm-ocr'
// OCR_DEVICE=cpu runs GLM-OCR on the CPU only (keeps the GPU free for the tutor model).
export const OCR_DEVICE = (process.env.OCR_DEVICE || 'gpu').toLowerCase()

// GLM-OCR is prompted with a task name:
//   "Text Recognition:"    -> text, with any math written as LaTeX in $...$
//   "Formula Recognition:" -> the whole image as one LaTeX block ($$...$$)
const PROMPTS = {
  auto: process.env.OCR_TEXT_PROMPT || 'Text Recognition:',
  math: process.env.OCR_MATH_PROMPT || 'Formula Recognition:',
}

export async function readImage(base64, mode = 'auto') {
  mode = mode === 'math' ? 'math' : 'auto'
  const started = Date.now()
  const out = await chat({
    model: OCR_MODEL,
    // num_ctx: one image + answer fits easily in 8K; Ollama's default for this model
    // is 131K, which made it load as an 11 GB model.
    options: { temperature: 0, num_predict: 1024, num_ctx: 8192, ...(OCR_DEVICE === 'cpu' ? { num_gpu: 0 } : {}) },
    messages: [{ role: 'user', content: PROMPTS[mode], images: [base64] }],
  })
  let text = out.content.trim()
  // Math mode should always come back as a display block, even if the model omits $$.
  if (mode === 'math' && text && !/^\$\$[\s\S]*\$\$$/.test(text)) text = `$$\n${text.replace(/^\$+|\$+$/g, '')}\n$$`
  // Text mode: wrap lines that are only math but came back without $...$.
  if (mode === 'auto') text = normalizeOcrMath(text)
  return { text, ms: Date.now() - started, mode }
}
