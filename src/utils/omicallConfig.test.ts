import { describe, expect, it } from 'vitest'
import {
  describeMissingOmicallSipParts,
  getDefaultOmicallConfig,
  resolveOmicallSipCredentials,
} from './omicallConfig'

describe('resolveOmicallSipCredentials', () => {
  const base = {
    ...getDefaultOmicallConfig(),
    enabled: true,
    sipRealm: 'omiteam',
    defaultSipUser: '100',
    defaultSipPassword: 'org-pass',
  }

  it('falls back to org defaults when profile SIP fields are empty strings', () => {
    const creds = resolveOmicallSipCredentials(base, {
      omicallSipUser: '',
      omicallSipPassword: '',
    })
    expect(creds).toEqual({
      sipRealm: 'omiteam',
      sipUser: '100',
      sipPassword: 'org-pass',
    })
  })

  it('prefers profile credentials when both are set', () => {
    const creds = resolveOmicallSipCredentials(base, {
      omicallSipUser: '201',
      omicallSipPassword: 'tvv-pass',
    })
    expect(creds).toEqual({
      sipRealm: 'omiteam',
      sipUser: '201',
      sipPassword: 'tvv-pass',
    })
  })

  it('uses org password when profile has sipUser but empty password', () => {
    const creds = resolveOmicallSipCredentials(base, {
      omicallSipUser: '201',
      omicallSipPassword: '',
    })
    expect(creds).toEqual({
      sipRealm: 'omiteam',
      sipUser: '201',
      sipPassword: 'org-pass',
    })
  })

  it('returns null when password missing everywhere', () => {
    const creds = resolveOmicallSipCredentials(
      { ...base, defaultSipPassword: undefined },
      { omicallSipUser: '201', omicallSipPassword: '' },
    )
    expect(creds).toBeNull()
    expect(describeMissingOmicallSipParts({ ...base, defaultSipPassword: undefined }, {
      omicallSipUser: '201',
      omicallSipPassword: '',
    })).toMatch(/mật khẩu SIP/)
  })
})
