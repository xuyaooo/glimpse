// Starts the Laya decision service (decide/laya_service.py) for `npm run dev`, if it is set up
// (`npm run setup:decide`). Without it the engine still works: its rules pick the animations.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const python = path.join(root, 'decide', '.venv', 'bin', 'python')
const port = process.env.DECIDE_PORT || '8091'
const idle = () => setInterval(() => {}, 1 << 30) // stay up: concurrently stops everything when one exits

if (!existsSync(python)) {
  console.log('[decide] Laya is not set up (npm run setup:decide); the rules pick the animations.')
  idle()
} else {
  const running = await fetch(`http://127.0.0.1:${port}/health`).then((r) => r.ok).catch(() => false)
  if (running) {
    console.log(`[decide] Laya already running on :${port}`)
    idle()
  } else {
    const child = spawn(python, [path.join(root, 'decide', 'laya_service.py')], { stdio: 'inherit', env: { ...process.env, PYTHONWARNINGS: 'ignore' } })
    child.on('exit', (code) => {
      console.log(`[decide] Laya stopped (${code}); the rules pick the animations.`)
      idle()
    })
  }
}
