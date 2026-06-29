import { describe, expect, it } from 'vitest'
import { buildFirebaseReceiptPath, buildReceiptObjectKey, sanitizeReceiptFileName } from './receiptStoragePaths'
import { isOptimizableReceiptImage } from './receiptImageOptimize'

describe('receiptStoragePaths', () => {
  it('buildReceiptObjectKey — phân cấp theo leadId + folder + slot', () => {
    const key = buildReceiptObjectKey({
      leadId: 'abc123',
      folderName: 'Nguyen_Van_A_KH001',
      slot: 'deposit',
      fileName: 'bill photo.jpg',
      uploadedAt: new Date('2026-05-28T10:15:00.000Z'),
    })
    expect(key).toMatch(/^receipts\/leads\/abc123\/Nguyen_Van_A_KH001\/deposit\/2026-05-28T10-15-00_/)
    expect(key).toContain('bill_photo.jpg')
  })

  it('sanitizeReceiptFileName', () => {
    expect(sanitizeReceiptFileName('  bill #1.png  ')).toBe('bill_1.png')
  })

  it('buildFirebaseReceiptPath — legacy fallback', () => {
    expect(buildFirebaseReceiptPath({ folderName: 'A_B', slot: 'supplementL1', fileName: 'x.pdf' })).toBe(
      'receipts/A_B/supplementL1_x.pdf',
    )
  })
})

describe('receiptImageOptimize', () => {
  it('isOptimizableReceiptImage', () => {
    expect(isOptimizableReceiptImage(new File([''], 'a.jpg', { type: 'image/jpeg' }))).toBe(true)
    expect(isOptimizableReceiptImage(new File([''], 'a.pdf', { type: 'application/pdf' }))).toBe(false)
  })
})
