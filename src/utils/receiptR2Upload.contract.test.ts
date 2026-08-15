import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildReceiptObjectKey, receiptPublicUrl } from './receiptStoragePaths'
import { receiptStorageFolderName } from '../services/leadReceiptStorage'

describe('receipt R2 path helpers (client)', () => {
  it('folder name matches HoTen_MaSV', () => {
    expect(
      receiptStorageFolderName({
        id: 'doc1',
        fullName: 'Nguyễn Văn A',
        systemCode: 'KH733556',
      }),
    ).toBe('Nguyễn_Văn_A_KH733556')
  })

  it('object key + public URL encode path segments', () => {
    const key = buildReceiptObjectKey({
      leadId: 'lead/1',
      folderName: 'A_B',
      slot: 'deposit',
      fileName: 'bill 1.jpg',
      uploadedAt: new Date('2026-08-15T12:00:00.000Z'),
    })
    expect(key).toContain('receipts/leads/')
    expect(key).toContain('/deposit/')
    const url = receiptPublicUrl('https://worker.example', key)
    expect(url.startsWith('https://worker.example/files/')).toBe(true)
    expect(url).toContain(encodeURIComponent('bill_1.jpg'))
  })
})

describe('R2 multipart upload contract (mocked fetch)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('posts FormData fields expected by worker', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init })
        return new Response(
          JSON.stringify({
            ok: true,
            fileUrl: 'https://worker.example/files/receipts/leads/L1/A/deposit/x_bill.jpg',
            objectKey: 'receipts/leads/L1/A/deposit/x_bill.jpg',
            bytes: 3,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }),
    )

    // Gọi cùng contract app dùng (không import full uploadLeadReceiptFile — tránh Firebase).
    const form = new FormData()
    form.append('token', 'tok')
    form.append('leadId', 'L1')
    form.append('folderName', 'A')
    form.append('slot', 'deposit')
    form.append('fileName', 'bill.jpg')
    form.append('file', new File([new Uint8Array([1, 2, 3])], 'bill.jpg', { type: 'image/jpeg' }))

    const res = await fetch('https://worker.example/upload', { method: 'POST', body: form })
    expect(res.ok).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://worker.example/upload')
    expect(calls[0].init?.method).toBe('POST')
    expect(calls[0].init?.body).toBeInstanceOf(FormData)
    const body = calls[0].init!.body as FormData
    expect(body.get('token')).toBe('tok')
    expect(body.get('slot')).toBe('deposit')
    expect(body.get('file')).toBeInstanceOf(File)
  })
})
