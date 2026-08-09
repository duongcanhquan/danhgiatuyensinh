/** Lấy message rõ từ lỗi httpsCallable (Firebase Functions). */
export function firebaseCallableErrorMessage(e: unknown, fallback = 'Lỗi gọi máy chủ'): string {
  if (!e || typeof e !== 'object') return fallback
  const err = e as { code?: string; message?: string; customData?: unknown }
  const raw = String(err.message ?? '').trim()
  // "Firebase: … (functions/failed-precondition)" → lấy phần giữa
  const m = raw.match(/^Firebase:\s*(.+?)\s*\(functions\//i)
  if (m?.[1]) return m[1].trim()
  if (raw && !raw.startsWith('Firebase:')) return raw
  if (raw) return raw.replace(/^Firebase:\s*/i, '').replace(/\s*\(functions\/[^)]+\)\s*$/i, '').trim() || fallback
  return fallback
}
