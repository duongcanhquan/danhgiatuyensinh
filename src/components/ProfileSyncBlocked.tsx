import { useAuth } from '../hooks/useAuth'

/** Khi Auth OK nhưng không tạo/ghi được Firestore users/{uid} (Rules / chưa bật Firestore). */
export function ProfileSyncBlocked() {
  const { firebaseUser } = useAuth()
  const uid = firebaseUser?.uid ?? '—'

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-100 px-4 py-10 text-slate-800">
      <div className="app-glass-panel max-w-lg rounded-2xl p-8 text-left shadow-xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-900">Chưa tạo được hồ sơ Firestore</p>
        <p className="mt-2 text-sm text-slate-600">
          Bạn đã đăng nhập Authentication, nhưng app không ghi/đọc được{' '}
          <code className="rounded bg-slate-200/80 px-1 py-0.5 text-xs">{`users/${uid}`}</code>.
        </p>
        <p className="mt-3 rounded-lg border border-slate-200/80 bg-slate-50/90 p-3 text-xs leading-relaxed text-slate-600">
          Trong <code className="text-slate-800">firebaseConfig</code>, trường <code className="text-slate-800">databaseURL</code>{' '}
          là <strong>Realtime Database</strong> (cây JSON). Hồ sơ CRM và <code className="text-slate-800">users</code> của
          app nằm ở <strong>Cloud Firestore</strong> — cùng <code className="text-slate-800">projectId</code> nhưng là
          tab &quot;Firestore Database&quot; trong Console, không phải tab Realtime.
        </p>
        <ul className="mt-4 list-inside list-disc space-y-2 text-xs text-slate-600">
          <li>
            Nếu lệnh <code className="text-slate-800">seed:super-admin</code> từng báo <code className="text-slate-800">NOT_FOUND</code>{' '}
            (mã 5): project chưa có <strong>Cloud Firestore</strong> — bắt buộc tạo ở bước dưới rồi chạy lại seed hoặc
            tải lại trang sau khi có Rules.
          </li>
          <li>
            Vào <strong>Firebase Console → Firestore Database</strong> — nếu chưa tạo database thì chọn chế độ (thường
            là location gần bạn) và tạo.
          </li>
          <li>
            Tab <strong>Rules</strong>: cho phép user đã đăng nhập ghi doc của chính họ (hoặc tạm thời dùng mẫu trong
            file <code className="text-slate-800">firestore.rules.example</code> ở thư mục project) rồi <strong>Publish</strong>.
          </li>
          <li>
            Nếu trên Firebase bạn dùng database tên riêng (vd. <code className="text-slate-800">warmlist</code>) thay vì{' '}
            <code className="text-slate-800">(default)</code>: biến{' '}
            <code className="text-slate-800">VITE_FIREBASE_FIRESTORE_DATABASE_ID</code> trên Vercel / GitHub Actions phải{' '}
            <strong>trùng</strong> tên đó — nếu thiếu hoặc sai, app có thể không đọc/ghi được{' '}
            <code className="text-slate-800">users/{'{'}uid{'}'}</code>.
          </li>
          <li>Sau đó bấm «Tải lại trang» bên dưới.</li>
        </ul>
        <div className="mt-6 flex flex-wrap gap-3">
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
