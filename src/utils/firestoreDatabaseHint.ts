/** Gợi ý khi app đọc sai Firestore database (Functions ghi `warmlist`). */

export function getConfiguredFirestoreDatabaseId(): string {
  const custom = (import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID as string | undefined)?.trim()
  return custom || '(default)'
}

export function firestoreDatabaseMismatchHint(): string | null {
  if (getConfiguredFirestoreDatabaseId() !== '(default)') return null
  return (
    'Ứng dụng đang đọc database Firestore «(default)». Dữ liệu OMICall/KPI thường nằm ở database «warmlist» — ' +
    'quản trị cần đặt VITE_FIREBASE_FIRESTORE_DATABASE_ID=warmlist khi build (Vercel / hosting) rồi deploy lại.'
  )
}
