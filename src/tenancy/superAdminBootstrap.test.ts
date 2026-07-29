import { describe, expect, it } from 'vitest'
import { shouldAttemptSuperAdminBootstrap } from './superAdminBootstrap'

describe('shouldAttemptSuperAdminBootstrap', () => {
  const superEmail = 'quan.duong@caodangvietmy.edu.vn'

  it('allows bootstrap when email matches and auth says missing/invalid', () => {
    expect(
      shouldAttemptSuperAdminBootstrap({
        email: superEmail,
        password: '123456',
        errorCode: 'auth/user-not-found',
        superAdminEmail: superEmail,
      }),
    ).toBe(true)
    expect(
      shouldAttemptSuperAdminBootstrap({
        email: '  quan.duong@caodangvietmy.edu.vn ',
        password: '123456',
        errorCode: 'auth/invalid-credential',
        superAdminEmail: superEmail,
      }),
    ).toBe(true)
  })

  it('rejects short password, wrong email, unrelated errors', () => {
    expect(
      shouldAttemptSuperAdminBootstrap({
        email: superEmail,
        password: '12345',
        errorCode: 'auth/user-not-found',
        superAdminEmail: superEmail,
      }),
    ).toBe(false)
    expect(
      shouldAttemptSuperAdminBootstrap({
        email: 'other@x.com',
        password: '123456',
        errorCode: 'auth/user-not-found',
        superAdminEmail: superEmail,
      }),
    ).toBe(false)
    expect(
      shouldAttemptSuperAdminBootstrap({
        email: superEmail,
        password: '123456',
        errorCode: 'auth/too-many-requests',
        superAdminEmail: superEmail,
      }),
    ).toBe(false)
  })
})
