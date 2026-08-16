import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { getConfiguredFirestoreDatabaseId } from '../utils/firestoreDatabaseHint'

/** Khi Auth OK nhưng không tạo/ghi được Firestore users/{uid} (Rules / sai database). */
export function ProfileSyncBlocked() {
  const { firebaseUser, signOut, profileSyncError, reloadProfile } = useAuth()
  const uid = firebaseUser?.uid ?? '—'
  const dbLabel = getConfiguredFirestoreDatabaseId()
  const [retrying, setRetrying] = useState(false)

  const onRetry = async () => {
    setRetrying(true)
    try {
      await reloadProfile()
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-100 px-4 py-10 text-slate-800">
      <div className="app-surface-elevated max-w-lg rounded-2xl p-6 sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-900">Chưa tạo được hồ sơ Firestore</p>
        <p className="mt-2 text-sm text-slate-600">
          Bạn đã đăng nhập Authentication, nhưng app không đọc/ghi được{' '}
          <code className="rounded bg-slate-200/80 px-1 py-0.5 text-xs">{`users/${uid}`}</code>.
        </p>
        <p className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50/90 px-3 py-2 text-xs text-indigo-950">
          Database đang dùng: <code className="font-semibold">{dbLabel}</code>
          {dbLabel !== 'warmlist' ? (
            <span>
              {' '}
              — CRM VietMy thường cần <code className="font-semibold">warmlist</code>. Kiểm tra biến{' '}
              <code>VITE_FIREBASE_FIRESTORE_DATABASE_ID</code> trên Vercel.
            </span>
          ) : (
            <span> (đúng tên mặc định CRM).</span>
          )}
        </p>
        {profileSyncError ? (
          <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900" role="alert">
            Chi tiết: {profileSyncError}
          </p>
        ) : null}
        <ul className="mt-4 list-inside list-disc space-y-2 text-xs text-slate-600">
          <li>
            Quản trị: Publish lại <strong>Firestore Rules</strong> (database <code className="text-slate-800">{dbLabel}</code>
            ) từ file <code className="text-slate-800">firestore.rules</code> trong repo — lệnh{' '}
            <code className="text-slate-800">npm run deploy:firestore-rules</code>.
          </li>
          <li>
            Trong Console chọn đúng database <strong>{dbLabel}</strong> (không nhầm tab Realtime Database).
          </li>
          <li>
            Nếu doc <code className="text-slate-800">users/{'{'}uid{'}'}</code> chưa có: Rules phải cho phép tự tạo hồ sơ
            lần đầu, hoặc chạy seed / tạo nhân sự từ Siêu quản trị.
          </li>
        </ul>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={retrying}
            onClick={() => void onRetry()}
            className="rounded-xl border border-indigo-600 bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
          >
            {retrying ? 'Đang thử lại…' : 'Thử đồng bộ lại'}
          </button>
          <button
            type="button"
            onClick={() => void signOut()}
            className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
          >
            Đăng xuất
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50"
          >
            Tải lại trang
          </button>
        </div>
      </div>
    </div>
  )
}
