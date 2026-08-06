/** First-login bootstrap: create Auth user only for the configured superadmin email. */
export function shouldAttemptSuperAdminBootstrap(input: {
  email: string
  password: string
  errorCode: string
  superAdminEmail: string
}): boolean {
  const email = input.email.trim().toLowerCase()
  const superEmail = input.superAdminEmail.trim().toLowerCase()
  if (!email || !superEmail || email !== superEmail) return false
  if (!input.password || input.password.length < 6) return false
  return (
    input.errorCode === 'auth/user-not-found' ||
    input.errorCode === 'auth/invalid-credential' ||
    input.errorCode === 'auth/invalid-login-credentials'
  )
}

export function defaultSuperAdminEmailFromEnv(): string {
  return String(import.meta.env.VITE_SUPER_ADMIN_EMAIL ?? 'quan.duong@caodangvietmy.edu.vn')
    .trim()
    .toLowerCase()
}
