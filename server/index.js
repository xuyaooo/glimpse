// Local server: the backend app (server/app.js) on port 3001, plus the built lab page.
// On Vercel the same app runs as a function (api/index.js) and this file isn't used.
//
// Settings: environment variables, or a .env.local file in the folder the server is started
// from (see .env.example). Variables already set in the shell win over the file.
// The server listens on this computer only (127.0.0.1). HOST=0.0.0.0 opens it to the network:
// there is no login, so anyone who can reach it can read every student's history.
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Before the other modules load: they read their settings when they're imported.
if (existsSync('.env.local')) process.loadEnvFile('.env.local')

const { default: express } = await import('express')
const { default: app } = await import('./app.js')
const { OLLAMA_URL } = await import('./ollama.js')
const { roleConfig } = await import('./llm.js')
const { storeKind } = await import('./store.js')

// OCR_PORT (not PORT) so tools that set PORT for the web dev server don't collide with it.
const PORT = Number(process.env.OCR_PORT || 3001)
const HOST = process.env.HOST || '127.0.0.1'

// `npm start` also serves the built lab page.
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web', 'dist') // the web app, built (npm run build)
if (existsSync(dist)) {
  app.use(express.static(dist))
  app.get('/{*splat}', (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

// "ollama glm-ocr @ http://127.0.0.1:11434": the endpoint each role really uses
function describe(role) {
  try {
    const c = roleConfig(role)
    return `${c.provider} ${c.model} @ ${c.provider === 'ollama' ? OLLAMA_URL : c.baseUrl || '(no base URL set)'}`
  } catch (err) {
    return `not configured: ${err.message}`
  }
}

app.listen(PORT, HOST, async () => {
  console.log(`Server on http://${HOST.includes(':') ? `[${HOST}]` : HOST}:${PORT}${existsSync('.env.local') ? ' (settings from .env.local)' : ''}`)
  console.log(`  OCR:   ${describe('ocr')}`)
  console.log(`  Tutor: ${describe('tutor')}`)
  try {
    console.log(`  Database: ${await storeKind()}`)
  } catch (err) {
    console.log(`  Database: not available (${err.message})`)
  }
  // Load the local OCR model now so the first snapshot is fast.
  let ocr = null
  try {
    ocr = roleConfig('ocr')
  } catch {
    // reported above
  }
  if (ocr?.provider === 'ollama') {
    fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: ocr.model, keep_alive: '30m', options: { num_ctx: 8192 } }),
    }).catch(() => {})
  }
})
