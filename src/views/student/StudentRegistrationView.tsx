import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { GraduationCap, Loader2, Send } from 'lucide-react'
import { FirebaseError } from 'firebase/app'
import { isFirebaseConfigured } from '../../services/firebase'
import {
  fetchPublicRegistrationMeta,
  submitPublicRegistration,
  type PublicRegistrationMeta,
} from '../../services/publicRegistration'
import {
  emptyPublicRegistrationForm,
  PUBLIC_REG_INPUT_CLS,
  validatePublicRegistrationForm,
} from '../../utils/publicRegistrationForm'

const ACADEMIC_OPTIONS = ['Yếu', 'Trung Bình', 'Khá', 'Giỏi'] as const

export function StudentRegistrationView() {
  const navigate = useNavigate()
  const [meta, setMeta] = useState<PublicRegistrationMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState(emptyPublicRegistrationForm)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setLoading(false)
      setError('Hệ thống chưa cấu hình Firebase — không thể nhận đăng ký online.')
      return
    }
    let cancelled = false
    void fetchPublicRegistrationMeta()
      .then((m) => {
        if (cancelled) return
        setMeta(m)
        if (!m.enabled) {
          setError('Cổng đăng ký đang tạm đóng. Vui lòng liên hệ trường để được hỗ trợ.')
        }
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Không tải được cấu hình cổng đăng ký.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const patch = useCallback((partial: Partial<typeof form>) => {
    setForm((f) => ({ ...f, ...partial }))
  }, [])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const validationErr = validatePublicRegistrationForm(form)
    if (validationErr) {
      setError(validationErr)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await submitPublicRegistration({
        ...form,
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        studentEmail: form.studentEmail.trim(),
        studyIntention: (form.educationLevel ?? '').trim(),
      })
      navigate('/dang-ky/thanh-cong', {
        replace: true,
        state: {
          systemCode: result.systemCode,
          successMessage: result.successMessage,
          counselorName: result.counselorName,
          n8nOk: result.n8nOk,
        },
      })
    } catch (err) {
      let msg = 'Không gửi được đăng ký. Thử lại sau.'
      if (err instanceof FirebaseError) {
        if (err.code === 'functions/already-exists') {
          msg = 'Đã có hồ sơ trùng số điện thoại trên hệ thống. Vui lòng liên hệ tư vấn viên.'
        } else if (err.message) {
          msg = err.message
        }
      } else if (err instanceof Error && err.message) {
        msg = err.message
      }
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-slate-50">
      <header className="border-b border-emerald-100/80 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4 sm:px-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
            <GraduationCap className="h-6 w-6" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Cao đẳng Việt Mỹ</p>
            <h1 className="truncate text-lg font-extrabold text-slate-900 sm:text-xl">
              {meta?.portalTitle ?? 'Đăng ký tuyển sinh'}
            </h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-16 text-slate-600 shadow-sm">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            Đang tải…
          </div>
        ) : meta?.enabled ? (
          <>
            <p className="mb-6 text-sm leading-relaxed text-slate-700">{meta.introText}</p>

            {error ? (
              <div
                className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
                role="alert"
              >
                {error}
              </div>
            ) : null}

            <form
              onSubmit={(e) => void onSubmit(e)}
              className="space-y-6 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6"
            >
              <section>
                <h2 className="text-sm font-bold text-slate-900">Thông tin liên hệ</h2>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <label className="sm:col-span-2 block">
                    <span className="text-sm font-semibold text-slate-800">Họ và tên *</span>
                    <input
                      className={`mt-1 ${PUBLIC_REG_INPUT_CLS}`}
                      value={form.fullName}
                      onChange={(e) => patch({ fullName: e.target.value })}
                      required
                      autoComplete="name"
                    />
                  </label>
                  <label>
                    <span className="text-sm font-semibold text-slate-800">Số điện thoại *</span>
                    <input
                      className={`mt-1 ${PUBLIC_REG_INPUT_CLS}`}
                      value={form.phone}
                      onChange={(e) => patch({ phone: e.target.value })}
                      inputMode="tel"
                      required
                      autoComplete="tel"
                    />
                  </label>
                  <label>
                    <span className="text-sm font-semibold text-slate-800">Email *</span>
                    <input
                      className={`mt-1 ${PUBLIC_REG_INPUT_CLS}`}
                      type="email"
                      value={form.studentEmail}
                      onChange={(e) => patch({ studentEmail: e.target.value })}
                      required
                      autoComplete="email"
                    />
                  </label>
                  <label>
                    <span className="text-sm font-semibold text-slate-800">Ngày sinh</span>
                    <input
                      className={`mt-1 ${PUBLIC_REG_INPUT_CLS}`}
                      placeholder="vd. 15/08/2008"
                      value={form.dateOfBirth}
                      onChange={(e) => patch({ dateOfBirth: e.target.value })}
                    />
                  </label>
                  <label>
                    <span className="text-sm font-semibold text-slate-800">SĐT phụ huynh</span>
                    <input
                      className={`mt-1 ${PUBLIC_REG_INPUT_CLS}`}
                      value={form.parentPhone}
                      onChange={(e) => patch({ parentPhone: e.target.value })}
                      inputMode="tel"
                    />
                  </label>
                </div>
              </section>

              <section>
                <h2 className="text-sm font-bold text-slate-900">Học tập & nguyện vọng</h2>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <label>
                    <span className="text-sm font-semibold text-slate-800">Tỉnh / Thành phố</span>
                    {meta.provinces.length ? (
                      <select
                        className={`mt-1 ${PUBLIC_REG_INPUT_CLS}`}
                        value={form.province}
                        onChange={(e) => patch({ province: e.target.value })}
                      >
                        <option value="">— Chọn —</option>
                        {meta.provinces.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className={`mt-1 ${PUBLIC_REG_INPUT_CLS}`}
                        value={form.province}
                        onChange={(e) => patch({ province: e.target.value })}
                      />
                    )}
                  </label>
                  <label>
                    <span className="text-sm font-semibold text-slate-800">Trường THPT</span>
                    <input
                      className={`mt-1 ${PUBLIC_REG_INPUT_CLS}`}
                      value={form.highSchool}
                      onChange={(e) => patch({ highSchool: e.target.value })}
                    />
                  </label>
                  <label>
                    <span className="text-sm font-semibold text-slate-800">Lớp</span>
                    <input
                      className={`mt-1 ${PUBLIC_REG_INPUT_CLS}`}
                      value={form.gradeClass}
                      onChange={(e) => patch({ gradeClass: e.target.value })}
                    />
                  </label>
                  <label>
                    <span className="text-sm font-semibold text-slate-800">Hệ / hình thức đào tạo</span>
                    <input
                      className={`mt-1 ${PUBLIC_REG_INPUT_CLS}`}
                      placeholder="vd. CĐ 9+, CĐ chính quy…"
                      value={form.educationLevel}
                      onChange={(e) => patch({ educationLevel: e.target.value })}
                    />
                  </label>
                  <label>
                    <span className="text-sm font-semibold text-slate-800">Ngành quan tâm</span>
                    <input
                      className={`mt-1 ${PUBLIC_REG_INPUT_CLS}`}
                      value={form.majorInterest}
                      onChange={(e) => patch({ majorInterest: e.target.value })}
                    />
                  </label>
                  <label>
                    <span className="text-sm font-semibold text-slate-800">Học lực</span>
                    <select
                      className={`mt-1 ${PUBLIC_REG_INPUT_CLS}`}
                      value={form.academicPerformance}
                      onChange={(e) => patch({ academicPerformance: e.target.value })}
                    >
                      <option value="">— Chọn —</option>
                      {ACADEMIC_OPTIONS.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="sm:col-span-2">
                    <span className="text-sm font-semibold text-slate-800">Ghi chú thêm</span>
                    <textarea
                      className={`mt-1 min-h-[88px] ${PUBLIC_REG_INPUT_CLS}`}
                      value={form.description}
                      onChange={(e) => patch({ description: e.target.value })}
                      rows={3}
                    />
                  </label>
                </div>
              </section>

              <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-500">
                  Sau khi gửi, bạn nhận <strong>mã hồ sơ</strong> — tư vấn viên liên hệ qua SĐT hoặc email đã khai báo.
                </p>
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" />}
                  {busy ? 'Đang gửi…' : 'Gửi đăng ký'}
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-8 text-center text-sm text-amber-950">
            <p>{error ?? 'Cổng đăng ký chưa mở.'}</p>
            <p className="mt-2 text-xs text-amber-800">
              Quản trị viên: bật tại <strong>Cài đặt → Tích hợp → Cổng đăng ký SV</strong>.
            </p>
          </div>
        )}

        <p className="mt-8 text-center text-xs text-slate-500">
          Nhân viên tuyển sinh?{' '}
          <Link to="/login" className="font-semibold text-emerald-700 hover:underline">
            Đăng nhập hệ thống quản trị
          </Link>
        </p>
      </main>
    </div>
  )
}
