#!/usr/bin/env node
/**
 * Smoke test upload R2 — chạy khi wrangler dev đang listen (mặc định :8787).
 * Usage: node scripts/smoke-receipt-r2.mjs [baseUrl] [token]
 */
import { writeFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const base = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/+$/, '')
const token = process.argv[3] || 'test-upload-token-local'

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

const tmp = join(tmpdir(), `vietmy-r2-smoke-${Date.now()}.jpg`)
writeFileSync(tmp, Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array.from({ length: 120 }, (_, i) => i % 256)]))

try {
  const health = await fetch(`${base}/`)
  assert(health.ok, `health ${health.status}`)
  const h = await health.json()
  assert(h.ok === true, 'health.ok')

  const form = new FormData()
  form.append('token', token)
  form.append('leadId', 'smoke-lead')
  form.append('folderName', 'Smoke_Test')
  form.append('slot', 'deposit')
  form.append('fileName', 'smoke.jpg')
  const blob = new Blob([await import('node:fs').then((fs) => fs.readFileSync(tmp))], { type: 'image/jpeg' })
  form.append('file', blob, 'smoke.jpg')

  const up = await fetch(`${base}/upload`, {
    method: 'POST',
    headers: { Origin: 'https://admission.vietmycollege.com' },
    body: form,
  })
  const body = await up.json()
  assert(up.status === 200 && body.ok, `upload fail: ${JSON.stringify(body)}`)
  assert(typeof body.fileUrl === 'string' && body.fileUrl.includes('/files/'), 'fileUrl')

  const get = await fetch(body.fileUrl)
  assert(get.ok, `GET file ${get.status}`)
  const bytes = Buffer.from(await get.arrayBuffer())
  assert(bytes.length === body.bytes, `size mismatch ${bytes.length} vs ${body.bytes}`)

  console.log('OK smoke receipt-r2')
  console.log('  fileUrl=', body.fileUrl)
  console.log('  bytes=', body.bytes)
} finally {
  try {
    unlinkSync(tmp)
  } catch {
    /* ignore */
  }
}
