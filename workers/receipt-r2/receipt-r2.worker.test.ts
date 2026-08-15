/**
 * Unit tests cho Worker R2 — mock bucket, không cần Cloudflare account.
 */
import { describe, expect, it } from 'vitest'
import worker, { buildObjectKey, type Env } from './src/index'

class MockR2Object {
  constructor(
    readonly body: Uint8Array,
    readonly httpMetadata?: { contentType?: string },
    readonly httpEtag = '"etag-1"',
  ) {}
}

class MockR2Bucket {
  store = new Map<string, { bytes: Uint8Array; meta?: { contentType?: string } }>()

  async put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | string | ReadableStream | Blob | null,
    options?: { httpMetadata?: { contentType?: string } },
  ) {
    let bytes: Uint8Array
    if (value == null) bytes = new Uint8Array()
    else if (typeof value === 'string') bytes = new TextEncoder().encode(value)
    else if (value instanceof Blob) bytes = new Uint8Array(await value.arrayBuffer())
    else if (ArrayBuffer.isView(value)) bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    else if (value instanceof ArrayBuffer) bytes = new Uint8Array(value)
    else throw new Error('unsupported put value')
    this.store.set(key, { bytes, meta: options?.httpMetadata })
  }

  async get(key: string) {
    const hit = this.store.get(key)
    if (!hit) return null
    return new MockR2Object(hit.bytes, hit.meta)
  }
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    RECEIPTS_BUCKET: new MockR2Bucket() as unknown as R2Bucket,
    UPLOAD_TOKEN: 'test-token',
    PUBLIC_BASE_URL: 'https://receipts.example',
    ALLOWED_ORIGINS: 'http://localhost:5173,https://admission.vietmycollege.com',
    ...overrides,
  }
}

describe('buildObjectKey', () => {
  it('builds stable receipts/leads path', () => {
    const key = buildObjectKey({
      leadId: 'lead-1',
      folderName: 'Nguyen Van A_KH1',
      slot: 'deposit',
      fileName: 'bill.jpg',
      uploadedAt: new Date('2026-08-15T10:15:00.000Z'),
    })
    expect(key).toBe('receipts/leads/lead-1/Nguyen_Van_A_KH1/deposit/2026-08-15T10-15-00_bill.jpg')
  })
})

describe('receipt-r2 worker', () => {
  it('health check GET /', async () => {
    const res = await worker.fetch(new Request('https://r2.test/'), makeEnv())
    expect(res.status).toBe(200)
    const data = (await res.json()) as { ok: boolean; service: string }
    expect(data.ok).toBe(true)
    expect(data.service).toBe('vietmy-receipt-r2')
  })

  it('OPTIONS returns CORS for allowed origin', async () => {
    const res = await worker.fetch(
      new Request('https://r2.test/upload', {
        method: 'OPTIONS',
        headers: { Origin: 'https://admission.vietmycollege.com' },
      }),
      makeEnv(),
    )
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://admission.vietmycollege.com')
  })

  it('OPTIONS does not spoof Allow-Origin for unknown origin', async () => {
    const res = await worker.fetch(
      new Request('https://r2.test/upload', {
        method: 'OPTIONS',
        headers: { Origin: 'https://evil.example' },
      }),
      makeEnv(),
    )
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('null')
  })

  it('rejects bad token', async () => {
    const form = new FormData()
    form.append('token', 'wrong')
    form.append('leadId', 'L1')
    form.append('folderName', 'A_1')
    form.append('slot', 'deposit')
    form.append('file', new File([new Uint8Array([1, 2, 3])], 'bill.jpg', { type: 'image/jpeg' }))
    const res = await worker.fetch(new Request('https://r2.test/upload', { method: 'POST', body: form }), makeEnv())
    expect(res.status).toBe(401)
  })

  it('uploads multipart and serves file', async () => {
    const env = makeEnv()
    const bytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4])
    const form = new FormData()
    form.append('token', 'test-token')
    form.append('leadId', 'leadABC')
    form.append('folderName', 'Tran_Van_B_KH99')
    form.append('slot', 'supplementL1')
    form.append('fileName', 'hoa-don.png')
    form.append('file', new File([bytes], 'hoa-don.png', { type: 'image/png' }))

    const up = await worker.fetch(
      new Request('https://r2.test/upload', {
        method: 'POST',
        body: form,
        headers: { Origin: 'http://localhost:5173' },
      }),
      env,
    )
    expect(up.status).toBe(200)
    const data = (await up.json()) as { ok: boolean; fileUrl: string; objectKey: string; bytes: number }
    expect(data.ok).toBe(true)
    expect(data.bytes).toBe(bytes.length)
    expect(data.objectKey).toMatch(/^receipts\/leads\/leadABC\/Tran_Van_B_KH99\/supplementL1\//)
    expect(data.fileUrl).toContain('https://receipts.example/files/')
    expect(up.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173')

    const get = await worker.fetch(new Request(data.fileUrl), env)
    expect(get.status).toBe(200)
    expect(get.headers.get('Content-Type')).toBe('image/png')
    const got = new Uint8Array(await get.arrayBuffer())
    expect([...got]).toEqual([...bytes])
  })

  it('uploads legacy JSON base64', async () => {
    const env = makeEnv()
    const raw = 'hello-bill'
    const base64 = btoa(raw)
    const res = await worker.fetch(
      new Request('https://r2.test/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'test-token',
          leadId: 'L2',
          folderName: 'Test_1',
          slot: 'deposit',
          fileName: 'bill.txt',
          contentType: 'text/plain',
          base64,
        }),
      }),
      env,
    )
    expect(res.status).toBe(200)
    const data = (await res.json()) as { ok: boolean; objectKey: string }
    expect(data.ok).toBe(true)
    const get = await worker.fetch(
      new Request(`https://receipts.example/files/${data.objectKey.split('/').map(encodeURIComponent).join('/')}`),
      env,
    )
    expect(await get.text()).toBe(raw)
  })

  it('rejects empty file and bad slot', async () => {
    const env = makeEnv()
    const empty = new FormData()
    empty.append('token', 'test-token')
    empty.append('leadId', 'L1')
    empty.append('folderName', 'A')
    empty.append('slot', 'deposit')
    empty.append('file', new File([], 'empty.jpg', { type: 'image/jpeg' }))
    expect((await worker.fetch(new Request('https://r2.test/upload', { method: 'POST', body: empty }), env)).status).toBe(
      400,
    )

    const badSlot = new FormData()
    badSlot.append('token', 'test-token')
    badSlot.append('leadId', 'L1')
    badSlot.append('folderName', 'A')
    badSlot.append('slot', 'weird')
    badSlot.append('file', new File([new Uint8Array([1])], 'a.jpg', { type: 'image/jpeg' }))
    expect(
      (await worker.fetch(new Request('https://r2.test/upload', { method: 'POST', body: badSlot }), env)).status,
    ).toBe(400)
  })
})
