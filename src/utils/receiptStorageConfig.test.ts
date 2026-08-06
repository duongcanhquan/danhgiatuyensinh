import { describe, expect, it } from 'vitest'
import {
  emptyReceiptStorageConfig,
  parseReceiptStorageConfig,
  resolveReceiptStorageRuntime,
} from './receiptStorageConfig'

describe('receiptStorageConfig', () => {
  it('parses provider and urls', () => {
    const cfg = parseReceiptStorageConfig({
      provider: 'drive',
      driveWebhookUrl: 'https://script.google.com/x',
      driveWebhookToken: 'tok',
    })
    expect(cfg.provider).toBe('drive')
    expect(cfg.driveWebhookUrl).toContain('script.google.com')
  })

  it('falls back to empty defaults', () => {
    expect(emptyReceiptStorageConfig().provider).toBe('auto')
  })

  it('resolve prefers org config over empty env-style blanks', () => {
    const runtime = resolveReceiptStorageRuntime({
      ...emptyReceiptStorageConfig(),
      provider: 'r2',
      r2UploadUrl: 'https://worker.example/upload',
      r2UploadToken: 'secret',
    })
    expect(runtime.provider).toBe('r2')
    expect(runtime.r2UploadUrl).toBe('https://worker.example/upload')
    expect(runtime.r2UploadToken).toBe('secret')
  })
})
