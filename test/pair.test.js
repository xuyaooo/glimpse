// The phone as the camera: the engine passes the offer and the answer by a short code, once.
import test from 'node:test'
import assert from 'node:assert/strict'
process.env.ENGINE_DEBUG = '0'
process.env.PGLITE_DIR = ''
process.env.VERCEL = '1' // the database in memory, as on Vercel without Neon
const { default: app } = await import('../server/app.js')
const server = app.listen(0, '127.0.0.1')
await new Promise((r) => server.once('listening', r))
const base = `http://127.0.0.1:${server.address().port}`
const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
test.after(() => server.close())

test('offer -> code -> the phone reads it and answers once -> the computer reads the answer', async () => {
  const offer = 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\n'
  const r = await post('/api/pair', { offer })
  assert.equal(r.status, 200)
  const { code } = await r.json()
  assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/)
  let got = await (await fetch(`${base}/api/pair/${code}`)).json()
  assert.deepEqual(got, { offer, answer: null })
  assert.equal((await post(`/api/pair/${code}/answer`, { answer: 'v=0\r\nanswer\r\n' })).status, 200)
  assert.equal((await post(`/api/pair/${code}/answer`, { answer: 'v=0\r\nanother\r\n' })).status, 409) // only one phone
  got = await (await fetch(`${base}/api/pair/${code}`)).json()
  assert.equal(got.answer, 'v=0\r\nanswer\r\n')
})

test('bad input is refused, an unknown code is not found', async () => {
  assert.equal((await post('/api/pair', { offer: 'hello' })).status, 400)
  assert.equal((await fetch(`${base}/api/pair/ZZZZZZ`)).status, 404)
  assert.equal((await fetch(`${base}/api/pair/../../x`)).status, 404)
  assert.equal((await post('/api/pair/ZZZZZZ/answer', { answer: 'v=0' })).status, 409)
})
