import { describe, expect, it } from 'vitest'
import {
  combineInvitationErrors,
  explainAppsScriptClientFailure,
  explainAppsScriptResponseBody,
  isAppsScriptDevUrl,
  isLikelyHtmlBody,
  sanitizeDriveFolderName,
  userFacingWebhookBodyError,
} from './inviteDriveErrors'

describe('inviteDriveErrors', () => {
  it('flags Apps Script /dev URLs', () => {
    expect(isAppsScriptDevUrl('https://script.google.com/macros/s/abc/dev')).toBe(true)
    expect(isAppsScriptDevUrl('https://script.google.com/macros/s/abc/exec')).toBe(false)
  })

  it('maps Failed to fetch to a machine-specific Drive hint', () => {
    expect(explainAppsScriptClientFailure(new Error('Failed to fetch'))).toMatch(/CORS|Anyone|\/exec/)
  })

  it('detects Google login HTML instead of JSON', () => {
    const html = '<!DOCTYPE html><html><body>Sign in – Google Accounts</body></html>'
    expect(isLikelyHtmlBody(html)).toBe(true)
    expect(explainAppsScriptResponseBody(html, 200)).toMatch(/\/dev|Only myself/)
  })

  it('reads JSON error from Apps Script body', () => {
    expect(explainAppsScriptResponseBody(JSON.stringify({ ok: false, error: 'Unauthorized token.' }), 200)).toBe(
      'Unauthorized token.',
    )
  })

  it('does not dump HTML from n8n', () => {
    expect(userFacingWebhookBodyError('<html>gateway timeout</html>', 502, 'n8n lỗi')).toMatch(/HTML/)
  })

  it('combines folder + n8n into one message', () => {
    expect(combineInvitationErrors('Failed to fetch', 'Webhook n8n quá lâu (8s).')).toMatch(
      /Webhook n8n quá lâu[\s\S]*thư mục Drive/,
    )
  })

  it('sanitizes Drive folder names without stripping Vietnamese', () => {
    expect(sanitizeDriveFolderName('Nguyễn Văn A_KH1')).toBe('Nguyễn_Văn_A_KH1')
    expect(sanitizeDriveFolderName('...')).toBe('HoSo')
  })
})
