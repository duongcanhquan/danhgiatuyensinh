/**
 * Database Firestore CRM VietMy.
 * Dữ liệu thật nằm ở `warmlist`; `(default)` thường trống.
 * Env `VITE_FIREBASE_FIRESTORE_DATABASE_ID` vẫn ghi đè được (vd. `(default)` khi cố ý).
 */
export const DEFAULT_CRM_FIRESTORE_DATABASE_ID = 'warmlist'

/**
 * Id truyền vào `initializeFirestore` / `getFirestore`.
 * Env trống → `warmlist`. Env `(default)` → `undefined` (Firebase default).
 */
export function resolveFirestoreDatabaseIdForCrm(
  envValue: string | undefined | null = typeof import.meta !== 'undefined'
    ? (import.meta.env?.VITE_FIREBASE_FIRESTORE_DATABASE_ID as string | undefined)
    : undefined,
): string | undefined {
  const raw = (envValue ?? '').trim()
  if (raw === '(default)') return undefined
  if (raw) return raw
  return DEFAULT_CRM_FIRESTORE_DATABASE_ID
}

export function getConfiguredFirestoreDatabaseId(): string {
  return resolveFirestoreDatabaseIdForCrm() ?? '(default)'
}

export function firestoreDatabaseMismatchHint(): string | null {
  if (getConfiguredFirestoreDatabaseId() !== '(default)') return null
  return (
    'Ứng dụng đang đọc database Firestore «(default)». Dữ liệu OMICall/KPI thường nằm ở database «warmlist» — ' +
    'quản trị cần đặt VITE_FIREBASE_FIRESTORE_DATABASE_ID=warmlist khi build (Vercel / hosting) rồi deploy lại.'
  )
}
