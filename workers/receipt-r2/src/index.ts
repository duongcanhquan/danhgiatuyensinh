/**
 * Cloudflare Worker — lưu chứng từ tài chính lên R2 theo từng ứng viên.
 *
 * POST /upload  — JSON { token, leadId, folderName, slot, fileName, contentType, base64 }
 * GET  /files/* — phục vụ file (cache 1 năm)
 */

export interface Env {
  RECEIPTS_BUCKET: R2Bucket
  UPLOAD_TOKEN: string
  PUBLIC_BASE_URL?: string
  ALLOWED_ORIGINS?: string
}

type UploadBody = {
  token?: string
  leadId?: string
  folderName?: string
  slot?: string
  fileName?: string
  contentType?: string
  base64?: string
}

const RECEIPT_ROOT = 'receipts'

function corsHeaders(origin: string | null, env: Env): HeadersInit {
  const allowed = (env.ALLOWED_ORIGINS ?? '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const allowOrigin =
    allowed.includes('*') || (origin && allowed.includes(origin)) ? origin ?? allowed[0] ?? '*' : allowed[0] ?? '*'
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  }
}

function json(data: unknown, status: number, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra },
  })
}

function sanitizeSegment(s: string, max = 80): string {
  return (
    String(s ?? '')
      .trim()
      .replace(/[^\w.\-()À-ỹ\s]/gi, '_')
      .replace(/\s+/g, '_')
      .slice(0, max) || 'unknown'
  )
}

function sanitizeFileName(name: string): string {
  return String(name ?? 'bill')
    .trim()
    .replace(/[^\w.\-()À-ỹ]+/gi, '_')
    .slice(0, 120) || 'bill'
}

export function buildObjectKey(opts: {
  leadId: string
  folderName: string
  slot: string
  fileName: string
  uploadedAt?: Date
}): string {
  const ts = (opts.uploadedAt ?? new Date()).toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const leadId = sanitizeSegment(opts.leadId)
  const folder = sanitizeSegment(opts.folderName)
  const safe = sanitizeFileName(opts.fileName)
  return `${RECEIPT_ROOT}/leads/${leadId}/${folder}/${opts.slot}/${ts}_${safe}`
}

function decodeBase64(b64: string): Uint8Array {
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
  return out
}

function publicFileUrl(request: Request, env: Env, objectKey: string): string {
  const base = (env.PUBLIC_BASE_URL ?? new URL(request.url).origin).replace(/\/+$/, '')
  const encoded = objectKey
    .split('/')
    .map((p) => encodeURIComponent(p))
    .join('/')
  return `${base}/files/${encoded}`
}

async function handleUpload(request: Request, env: Env, cors: HeadersInit): Promise<Response> {
  let body: UploadBody
  try {
    body = (await request.json()) as UploadBody
  } catch {
    return json({ ok: false, error: 'JSON không hợp lệ' }, 400, cors)
  }

  if (!env.UPLOAD_TOKEN || body.token !== env.UPLOAD_TOKEN) {
    return json({ ok: false, error: 'Token không hợp lệ' }, 401, cors)
  }

  const leadId = String(body.leadId ?? '').trim()
  const folderName = String(body.folderName ?? '').trim()
  const slot = String(body.slot ?? '').trim()
  const fileName = String(body.fileName ?? 'bill').trim()
  const base64 = String(body.base64 ?? '').trim()

  if (!leadId || !folderName || !slot || !base64) {
    return json({ ok: false, error: 'Thiếu leadId, folderName, slot hoặc base64' }, 400, cors)
  }

  const allowedSlots = ['deposit', 'supplementL1', 'supplementL2', 'supplementL3', 'supplementL4']
  if (!allowedSlots.includes(slot)) {
    return json({ ok: false, error: 'slot không hợp lệ' }, 400, cors)
  }

  const bytes = decodeBase64(base64)
  if (bytes.length > 12 * 1024 * 1024) {
    return json({ ok: false, error: 'File quá lớn (tối đa 12 MB)' }, 413, cors)
  }

  const objectKey = buildObjectKey({ leadId, folderName, slot, fileName })
  const contentType = String(body.contentType ?? 'application/octet-stream').trim()

  await env.RECEIPTS_BUCKET.put(objectKey, bytes, {
    httpMetadata: { contentType },
    customMetadata: {
      leadId,
      folderName,
      slot,
      originalName: fileName,
      uploadedAt: new Date().toISOString(),
    },
  })

  const fileUrl = publicFileUrl(request, env, objectKey)
  return json(
    {
      ok: true,
      fileUrl,
      objectKey,
      bytes: bytes.length,
    },
    200,
    cors,
  )
}

async function handleGetFile(pathname: string, env: Env, cors: HeadersInit): Promise<Response> {
  const prefix = '/files/'
  if (!pathname.startsWith(prefix)) {
    return new Response('Not found', { status: 404, headers: cors })
  }
  const encodedPath = pathname.slice(prefix.length)
  const objectKey = encodedPath
    .split('/')
    .map((p) => decodeURIComponent(p))
    .join('/')

  if (!objectKey.startsWith(`${RECEIPT_ROOT}/`)) {
    return new Response('Forbidden', { status: 403, headers: cors })
  }

  const obj = await env.RECEIPTS_BUCKET.get(objectKey)
  if (!obj) {
    return new Response('Not found', { status: 404, headers: cors })
  }

  const headers = new Headers(cors)
  headers.set('Content-Type', obj.httpMetadata?.contentType ?? 'application/octet-stream')
  headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  if (obj.httpEtag) headers.set('ETag', obj.httpEtag)

  return new Response(obj.body, { status: 200, headers })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin')
    const cors = corsHeaders(origin, env)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }

    const url = new URL(request.url)

    if (request.method === 'POST' && url.pathname === '/upload') {
      return handleUpload(request, env, cors)
    }

    if (request.method === 'GET' && url.pathname.startsWith('/files/')) {
      return handleGetFile(url.pathname, env, cors)
    }

    if (request.method === 'GET' && url.pathname === '/') {
      return json({ ok: true, service: 'vietmy-receipt-r2', endpoints: ['POST /upload', 'GET /files/…'] }, 200, cors)
    }

    return new Response('Not found', { status: 404, headers: cors })
  },
}
