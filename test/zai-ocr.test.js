// GLM-OCR in the cloud (Z.ai layout_parsing): the same model as local, its Markdown made into lines.
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'

const seen = []
const server = http.createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    const j = JSON.parse(body)
    seen.push({ url: req.url, auth: req.headers.authorization, model: j.model, file: j.file.slice(0, 30) })
    res.setHeader('Content-Type', 'application/json')
    // like a server that refuses the data: prefix, then reads bare base64
    if (j.file.startsWith('data:')) return res.writeHead(400).end(JSON.stringify({ code: 1214, message: 'bad file' }))
    res.end(JSON.stringify({ id: 't1', model: 'glm-ocr', md_results: '# Exercise Sheet\n\na) $34 + 25 = 59$\n\n$\\frac{1}{2} + \\frac{1}{3} =$' }))
  })
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
after(() => server.close())
Object.assign(process.env, { OCR_BASE_URL: `http://127.0.0.1:${server.address().port}/api/paas/v4`, OCR_API_KEY: 'test-key', OCR_MODEL: 'glm-ocr', OCR_LAYOUT_PARSING: '1', ENGINE_DEBUG: '0' })
const { readFrame } = await import('../server/engine/reader.js')

test('the page goes to layout_parsing (data URL, then bare base64) and comes back as lines', async () => {
  const read = await readFrame(Buffer.from('fake-jpeg'))
  assert.deepEqual(read.lines, ['Exercise Sheet', 'a) $34 + 25 = 59$', '$\\frac{1}{2} + \\frac{1}{3} =$'])
  assert.equal(seen.length, 2)
  assert.deepEqual(seen.map((x) => [x.url, x.auth, x.model]), [['/api/paas/v4/layout_parsing', 'Bearer test-key', 'glm-ocr'], ['/api/paas/v4/layout_parsing', 'Bearer test-key', 'glm-ocr']])
  assert.match(seen[0].file, /^data:image\/jpeg;base64,/)
})
