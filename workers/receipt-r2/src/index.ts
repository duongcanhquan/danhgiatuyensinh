/**
 * Cloudflare Worker — lưu chứng từ tài chính lên R2 theo từng ứng viên.
 *
 * POST /upload
 *   - multipart/form-data: token, leadId, folderName, slot, fileName?, file
 *   - JSON (legacy): { token, leadId, folderName, slot, fileName, contentType, base64 }
 * GET  /files/* — phục vụ file công khai (xem bill / Chat / kế toán)
 */

export interface Env {
  RECEIPTS_BUCKET: R2Bucket
  UPLOAD_TOKEN: string
  PUBLIC_BASE_URL?: string
  ALLOWED_ORIGINS?: string
}

type UploadFields = {
  token: string
  leadId: string
  folderName: string
  slot: string
  fileName: string
  contentType: string
  bytes: Uint8Array
}

const RECEIPT_ROOT = 'receipts'
const ALLOWED_SLOTS = ['deposit', 'supplementL1', 'supplementL2', 'supplementL3', 'supplementL4']

function corsHeaders(origin: string | null, env: Env): HeadersInit {
  const allowed = (env.ALLOWED_ORIGINS ?? '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  let allowOrigin = '*'
  if (!allowed.includes('*')) {
    if (origin && allowed.includes(origin)) {
      allowOrigin = origin
    } else if (
      origin &&
      allowed.some((a) => a.startsWith('https://*.') && origin.endsWith(a.slice('https://*.'.length)))
    ) {
      allowOrigin = origin
    } else {
      // Origin không khớp — không giả mạo Allow-Origin (trình duyệt sẽ chặn đúng).
      allowOrigin = 'null'
    }
  } else if (origin) {
    allowOrigin = origin
  }
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
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
  return (
    String(name ?? 'bill')
      .trim()
      .replace(/[^\w.\-()À-ỹ]+/gi, '_')
      .slice(0, 120) || 'bill'
  )
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

async function parseUpload(request: Request): Promise<UploadFields | { error: string; status: number }> {
  const ct = (request.headers.get('Content-Type') || '').toLowerCase()

  if (ct.includes('multipart/form-data')) {
    const form = await request.formData()
    const token = String(form.get('token') ?? '')
    const leadId = String(form.get('leadId') ?? '').trim()
    const folderName = String(form.get('folderName') ?? '').trim()
    const slot = String(form.get('slot') ?? '').trim()
    const file = form.get('file')
    // Workers / Node: field file là File hoặc Blob — không chỉ `instanceof File`.
    if (!(file instanceof Blob)) {
      return { error: 'Thiếu file (multipart field «file»)', status: 400 }
    }
    const fileName =
      String(form.get('fileName') ?? (file instanceof File ? file.name : '') ?? 'bill').trim() || 'bill'
    const buf = new Uint8Array(await file.arrayBuffer())
    return {
      token,
      leadId,
      folderName,
      slot,
      fileName,
      contentType: file.type || 'application/octet-stream',
      bytes: buf,
    }
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return { error: 'JSON không hợp lệ', status: 400 }
  }
  const base64 = String(body.base64 ?? '').trim()
  if (!base64) return { error: 'Thiếu base64 hoặc multipart file', status: 400 }
  return {
    token: String(body.token ?? ''),
    leadId: String(body.leadId ?? '').trim(),
    folderName: String(body.folderName ?? '').trim(),
    slot: String(body.slot ?? '').trim(),
    fileName: String(body.fileName ?? 'bill').trim() || 'bill',
    contentType: String(body.contentType ?? 'application/octet-stream').trim(),
    bytes: decodeBase64(base64),
  }
}

async function handleUpload(request: Request, env: Env, cors: HeadersInit): Promise<Response> {
  const parsed = await parseUpload(request)
  if ('error' in parsed) {
    return json({ ok: false, error: parsed.error }, parsed.status, cors)
  }

  if (!env.UPLOAD_TOKEN || parsed.token !== env.UPLOAD_TOKEN) {
    return json({ ok: false, error: 'Token không hợp lệ' }, 401, cors)
  }

  const { leadId, folderName, slot, fileName, contentType, bytes } = parsed
  if (!leadId || !folderName || !slot) {
    return json({ ok: false, error: 'Thiếu leadId, folderName hoặc slot' }, 400, cors)
  }
  if (!ALLOWED_SLOTS.includes(slot)) {
    return json({ ok: false, error: 'slot không hợp lệ' }, 400, cors)
  }
  if (bytes.length > 12 * 1024 * 1024) {
    return json({ ok: false, error: 'File quá lớn (tối đa 12 MB)' }, 413, cors)
  }
  if (bytes.length === 0) {
    return json({ ok: false, error: 'File rỗng' }, 400, cors)
  }

  const objectKey = buildObjectKey({ leadId, folderName, slot, fileName })
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
  return json({ ok: true, fileUrl, objectKey, bytes: bytes.length }, 200, cors)
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
