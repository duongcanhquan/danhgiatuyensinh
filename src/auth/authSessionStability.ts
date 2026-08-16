/**
 * Quyết định xử lý sự kiện Auth `user === null` (tránh đẩy về /login khi Firebase nháy null tạm).
 */
export type AuthNullDecision =
  | { action: 'logout_now' }
  | { action: 'grace'; ms: number }
  | { action: 'ignore' }

export function decideAuthNullEvent(input: {
  /** Đã từng có phiên (uid) trong app. */
  hadSession: boolean
  /** auth.authStateReady() đã xong. */
  authReady: boolean
  /** Firebase vẫn còn currentUser (false alarm). */
  currentUserPresent: boolean
}): AuthNullDecision {
  if (input.currentUserPresent) return { action: 'ignore' }
  if (!input.authReady) return { action: 'grace', ms: 600 }
  if (input.hadSession) return { action: 'grace', ms: 1200 }
  return { action: 'logout_now' }
}

/** Có thể bỏ qua pipeline authenticating nặng khi cùng uid đã có hồ sơ. */
export function shouldSoftRefreshAuthSession(input: {
  incomingUid: string
  currentUid: string | null
  status: string
  hasProfile: boolean
}): boolean {
  return (
    Boolean(input.currentUid) &&
    input.currentUid === input.incomingUid &&
    input.status === 'authenticated' &&
    input.hasProfile
  )
}
