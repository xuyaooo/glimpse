// Vercel Function: the whole backend (server/app.js) as one function. vercel.json rewrites
// every /api/* request here; Express routes it.
import app from '../server/app.js'

export default app
