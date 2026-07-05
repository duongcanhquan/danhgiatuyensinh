import { Link, useLocation, Navigate } from 'react-router-dom'
import { CheckCircle2, Copy, GraduationCap } from 'lucide-react'
import { useState } from 'react'

type SuccessState = {
  systemCode: string
  successMessage: string
  counselorName: string | null
  n8nOk?: boolean
}

export function StudentRegistrationSuccessView() {
  const location = useLocation()
  const state = location.state as SuccessState | null
  const [copied, setCopied] = useState(false)

  if (!state?.systemCode) {
    return <Navigate to="/dang-ky" replace />
  }

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(state.systemCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-slate-50">
      <header className="border-b border-emerald-100/80 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4 sm:px-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
            <GraduationCap className="h-6 w-6" aria-hidden />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Cao đẳng Việt Mỹ</p>
            <h1 className="text-lg font-extrabold text-slate-900">Đăng ký thành công</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="rounded-2xl border border-emerald-200 bg-white p-6 text-center shadow-sm sm:p-8">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <CheckCircle2 className="h-8 w-8" aria-hidden />
          </div>
          <p className="mt-4 text-sm leading-relaxed text-slate-700">{state.successMessage}</p>

          <div className="mx-auto mt-6 max-w-sm rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mã hồ sơ của bạn</p>
            <p className="mt-1 font-mono text-2xl font-extrabold tracking-wide text-emerald-800">{state.systemCode}</p>
            <button
              type="button"
              onClick={() => void copyCode()}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden />
              {copied ? 'Đã copy' : 'Copy mã'}
            </button>
          </div>

          {state.counselorName ? (
            <p className="mt-4 text-sm text-slate-600">
              Tư vấn viên phụ trách: <strong>{state.counselorName}</strong>
            </p>
          ) : null}

          {state.n8nOk === false ? (
            <p className="mt-3 text-xs text-amber-800">
              Hồ sơ đã lưu; email thông báo có thể gửi chậm — trường vẫn liên hệ qua SĐT/email bạn đã khai báo.
            </p>
          ) : (
            <p className="mt-3 text-xs text-slate-500">
              Email xác nhận sẽ gửi tới địa chỉ bạn đã khai báo (nếu trường đã bật thông báo tự động).
            </p>
          )}

          <Link
            to="/dang-ky"
            className="mt-8 inline-flex min-h-10 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-5 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
          >
            Quay lại trang đăng ký
          </Link>
        </div>
      </main>
    </div>
  )
}
