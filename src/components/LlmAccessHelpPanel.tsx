import { Link } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { isAdminLikeRole, isSuperAdminRole } from '../auth/roleUtils'

export function LlmAccessHelpPanel({ compact = false }: { compact?: boolean }) {
  const { profile, can, canRunLlmAnalysis } = useAuth()
  const canOpenStaffSettings = can('config:users') || can('config:users:team')

  if (canRunLlmAnalysis) return null

  const isElevated = isSuperAdminRole(profile?.role) || isAdminLikeRole(profile?.role)

  if (isElevated) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
        Tài khoản quản trị thường được dùng AI tự động. Nếu vẫn bị chặn, đăng xuất và đăng nhập lại, hoặc liên hệ Siêu
        quản trị kiểm tra quyền trên Firestore users.
      </p>
    )
  }

  return (
    <div
      className={
        compact
          ? 'rounded-xl border border-violet-200 bg-violet-50/90 px-3 py-2.5 text-sm text-violet-950'
          : 'rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-amber-50/80 px-4 py-3 text-sm text-violet-950'
      }
    >
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-700" aria-hidden />
        <div className="min-w-0 space-y-2">
          <p className="font-semibold text-violet-950">Chưa được phép dùng AI trên hồ sơ</p>
          {canOpenStaffSettings ? (
            <>
              <ol className="list-decimal space-y-1 pl-4 text-violet-900/95">
                <li>
                  Vào <strong>Cài đặt</strong> → tab <strong>KPI &amp; Nhân sự</strong> →{' '}
                  <strong>{can('config:users') ? 'Quản lý nhân sự' : 'Nhóm tư vấn'}</strong>
                </li>
                <li>
                  Bấm <strong>Sửa</strong> trên tài khoản cần dùng AI (hoặc chính bạn nếu là Trưởng nhóm)
                </li>
                <li>
                  Tick <strong>«Cho phép dùng AI trên hồ sơ»</strong> → <strong>Lưu</strong>
                </li>
                <li>Đăng xuất / đăng nhập lại (hoặc F5) rồi mở lại hồ sơ</li>
              </ol>
              <Link
                to="/staff"
                className="inline-flex rounded-lg bg-violet-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-900"
              >
                Mở Quản lý nhân sự
              </Link>
            </>
          ) : (
            <p className="leading-relaxed text-violet-900/95">
              Nhờ <strong>Quản lý</strong> bật quyền cá nhân và đảm bảo Admin đã lưu <strong>API + tác vụ AI toàn trường</strong>{' '}
              (Cài đặt → AI &amp; LLM). Sau đó Quản lý vào{' '}
              <strong>Cài đặt → KPI &amp; Nhân sự → Quản lý nhân sự</strong>, bấm <strong>Sửa</strong> tài khoản{' '}
              <strong>{profile?.displayName || profile?.email || 'của bạn'}</strong> và tick{' '}
              <strong>«Cho phép dùng AI trên hồ sơ»</strong> (hoặc dùng nút bật hàng loạt).
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
