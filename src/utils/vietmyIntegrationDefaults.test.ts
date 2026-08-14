import { describe, expect, it } from 'vitest'
import {
  N8N_WEBHOOK_FIELD_HINTS,
  VIETMY_DEFAULT_DRIVE_FOLDERS,
  VIETMY_DEFAULT_N8N_WEBHOOKS,
} from './vietmyIntegrationDefaults'

describe('vietmyIntegrationDefaults', () => {
  it('có đủ 4 URL http VietMy', () => {
    for (const url of Object.values(VIETMY_DEFAULT_N8N_WEBHOOKS)) {
      expect(url.startsWith('https://apchn-host.lapage.vn/webhook/')).toBe(true)
    }
  })

  it('có hint cho mọi ô webhook', () => {
    for (const key of Object.keys(VIETMY_DEFAULT_N8N_WEBHOOKS) as (keyof typeof VIETMY_DEFAULT_N8N_WEBHOOKS)[]) {
      expect(N8N_WEBHOOK_FIELD_HINTS[key].events.length).toBeGreaterThan(0)
    }
  })

  it('folder Drive gốc không rỗng', () => {
    expect(VIETMY_DEFAULT_DRIVE_FOLDERS.inviteRootFolderId.length).toBeGreaterThan(10)
    expect(VIETMY_DEFAULT_DRIVE_FOLDERS.receiptRootFolderId.length).toBeGreaterThan(10)
  })
})
