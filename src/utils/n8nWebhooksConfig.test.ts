import { describe, expect, it } from 'vitest'
import {
  emptyOrgN8nWebhooks,
  parseOrgN8nWebhooks,
  pickOrgWebhook,
  setOrgN8nWebhookOverrides,
} from './n8nWebhooksConfig'

describe('parseOrgN8nWebhooks', () => {
  it('parses and trims URLs', () => {
    expect(
      parseOrgN8nWebhooks({
        giayMoi: ' https://a.example/giay ',
        ctsv: 'https://a.example/ctsv',
        daily: '',
        monthly: '  ',
      }),
    ).toEqual({
      giayMoi: 'https://a.example/giay',
      ctsv: 'https://a.example/ctsv',
      daily: '',
      monthly: '',
      updatedAt: undefined,
      updatedBy: undefined,
    })
  })
})

describe('pickOrgWebhook', () => {
  it('returns http override only for matching org', () => {
    setOrgN8nWebhookOverrides('demo', {
      ...emptyOrgN8nWebhooks(),
      ctsv: 'https://hook.example/ctsv',
      giayMoi: 'not-a-url',
    })
    expect(pickOrgWebhook('ctsv', 'demo')).toBe('https://hook.example/ctsv')
    expect(pickOrgWebhook('ctsv', 'other')).toBe('')
    expect(pickOrgWebhook('giayMoi', 'demo')).toBe('')
    setOrgN8nWebhookOverrides('demo', null)
  })
})
