// Database for sessions (and so students), the same SQL everywhere:
//   - Neon Postgres when DATABASE_URL / POSTGRES_URL is set (Vercel Marketplace, free tier);
//     uses Neon's HTTP driver, which suits serverless functions (no connection pool).
//   - Otherwise PGlite: real Postgres compiled to WebAssembly, in this process, saved under
//     data/pglite (in memory on Vercel, where the disk is read-only: set DATABASE_URL there).
import path from 'node:path'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const SCHEMA = [
  `create table if not exists glimpse_sessions (
     id text primary key,
     student_id text not null,
     state jsonb not null,
     started_at timestamptz not null default now(),
     updated_at timestamptz not null default now()
   )`,
  `create index if not exists glimpse_sessions_student on glimpse_sessions (student_id, updated_at desc)`,
  // History: every line read (with a small photo), question, worked solution and session summary.
  // ref = "<session>:<what>" so a record can be updated (a line read again, a corrected answer).
  `create table if not exists glimpse_history (
     ref text primary key,
     session_id text not null,
     student_id text not null,
     kind text not null,
     at timestamptz not null default now(),
     data jsonb not null
   )`,
  `create index if not exists glimpse_history_student on glimpse_history (student_id, at desc)`,
  `create index if not exists glimpse_history_session on glimpse_history (session_id, at)`,
]

let ready = null
let known = null // the database's kind once connected ('unavailable' after a failed try)

async function connect() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL
  let query
  let kind
  if (url) {
    const { neon } = await import('@neondatabase/serverless')
    const sql = neon(url)
    query = async (text, params = []) => sql.query(text, params)
    kind = 'neon'
  } else {
    const { PGlite } = await import('@electric-sql/pglite')
    const dir = process.env.VERCEL
      ? undefined // in memory
      : process.env.PGLITE_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'pglite')
    if (dir) await mkdir(dir, { recursive: true })
    const db = dir ? new PGlite(dir) : new PGlite()
    query = async (text, params = []) => (await db.query(text, params)).rows
    kind = dir ? 'pglite' : 'pglite-memory'
  }
  for (const stmt of SCHEMA) await query(stmt)
  return { query, kind }
}

export function db() {
  ready ??= connect().then(
    (x) => {
      known = x.kind
      return x
    },
    (err) => {
      ready = null
      known = 'unavailable'
      throw err
    },
  )
  return ready
}

// Postgres refuses NUL characters (\u0000) and unpaired surrogates in text and jsonb: a typed
// line or a model's answer with one would make the whole save fail. They're dropped / replaced.
const cleanText = (v) => v.replaceAll('\u0000', '').toWellFormed()
const BAD_KEY = /[\u0000\ud800-\udfff]/
const toJson = (v) =>
  JSON.stringify(v, (_k, x) => {
    if (typeof x === 'string') return cleanText(x)
    if (x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).some((k) => BAD_KEY.test(k))) {
      return Object.fromEntries(Object.entries(x).map(([k, y]) => [cleanText(k), y]))
    }
    return x
  })
const textParam = (v) => (typeof v === 'string' ? cleanText(v) : v)

export async function loadSession(id) {
  const { query } = await db()
  const rows = await query('select state from glimpse_sessions where id = $1', [id])
  return rows[0]?.state ?? null
}

export async function saveSession(state) {
  const { query } = await db()
  await query(
    `insert into glimpse_sessions (id, student_id, state, started_at, updated_at)
     values ($1, $2, $3::jsonb, to_timestamp($4 / 1000.0), now())
     on conflict (id) do update set state = excluded.state, student_id = excluded.student_id, updated_at = now()`,
    [textParam(state.id), textParam(state.student) || 'unknown', toJson(state), state.startedAt || Date.now()],
  )
}

// The newest sessions of every student (at most `perStudent` each), newest first. Capped per
// student, not overall, so a child who hasn't practised lately stays on the dashboard.
export async function listSessions({ perStudent = 50 } = {}) {
  const { query } = await db()
  const rows = await query(
    `select state from (
       select state, updated_at, row_number() over (partition by student_id order by updated_at desc) as n from glimpse_sessions
     ) t where n <= $1 order by updated_at desc`,
    [perStudent],
  )
  return rows.map((r) => r.state)
}

// records: [{ kind, ref, at, data }] (from the engine's state.history). A record saved again (a
// line read again, its answer corrected) keeps the time it was first saved: the session's
// history stays in the order things happened.
export async function saveHistory(sessionId, studentId, records) {
  if (!records?.length) return
  const { query } = await db()
  for (const r of records) {
    await query(
      `insert into glimpse_history (ref, session_id, student_id, kind, at, data)
       values ($1, $2, $3, $4, to_timestamp($5 / 1000.0), $6::jsonb)
       on conflict (ref) do update set session_id = excluded.session_id, student_id = excluded.student_id, kind = excluded.kind, data = excluded.data, at = least(glimpse_history.at, excluded.at)`,
      [textParam(r.ref), textParam(sessionId), textParam(studentId) || 'unknown', textParam(r.kind), r.at || Date.now(), toJson(r.data)],
    )
  }
}

const historyRow = (r) => ({ ref: r.ref, sessionId: r.session_id, studentId: r.student_id, kind: r.kind, at: new Date(r.at).getTime(), data: r.data })

// The newest records of a student (or of everyone), optionally only some kinds.
// limit: 1-500 (default 100). Paging: before = the last record's `at` (ms), and beforeRef = its
// `ref` so records with the same time aren't skipped.
export async function listHistory({ student, kinds, limit = 100, before, beforeRef } = {}) {
  const { query } = await db()
  const where = []
  const params = []
  const n = Math.trunc(Number(limit))
  if (student) where.push(`student_id = $${params.push(student)}`)
  if (kinds?.length) where.push(`kind = any($${params.push(kinds)})`)
  if (before !== undefined && before !== null && Number.isFinite(Number(before))) {
    const at = `to_timestamp($${params.push(Math.min(8.64e15, Math.max(0, Number(before))))} / 1000.0)` // dates Postgres can hold
    where.push(typeof beforeRef === 'string' && beforeRef ? `(at, ref) < (${at}, $${params.push(beforeRef)})` : `at < ${at}`)
  }
  params.push(Number.isFinite(n) && n > 0 ? Math.min(500, n) : 100)
  const rows = await query(`select * from glimpse_history ${where.length ? `where ${where.join(' and ')}` : ''} order by at desc, ref desc limit $${params.length}`, params)
  return rows.map(historyRow)
}

// One record by its ref (null if there is none)
export async function historyRecord(ref) {
  const { query } = await db()
  const rows = await query('select * from glimpse_history where ref = $1', [textParam(ref)])
  return rows[0] ? historyRow(rows[0]) : null
}

export async function sessionHistory(sessionId) {
  const { query } = await db()
  return (await query('select * from glimpse_history where session_id = $1 order by at, ref', [sessionId])).map(historyRow)
}

export async function storeKind() {
  return (await db()).kind
}

// The same without waiting: the kind once connected, else the one the settings give (and the
// database starts connecting in the background). For /api/engine/hello, which must be quick.
export function storeKindNow() {
  db().catch(() => {})
  return known ?? (process.env.DATABASE_URL || process.env.POSTGRES_URL ? 'neon' : process.env.VERCEL ? 'pglite-memory' : 'pglite')
}
