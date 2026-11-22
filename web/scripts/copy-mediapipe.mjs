// Copies MediaPipe's WebAssembly files into public/ so hand tracking works offline
// (served at /mediapipe/wasm; the hand model is public/models/hand_landmarker.task).
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const web = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const from = path.join(web, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm')
const to = path.join(web, 'public', 'mediapipe', 'wasm')
if (!existsSync(from)) {
  console.warn('[copy-mediapipe] @mediapipe/tasks-vision is not installed: run npm ci in glimpse/web')
  process.exit(0)
}
mkdirSync(to, { recursive: true })
cpSync(from, to, { recursive: true })
