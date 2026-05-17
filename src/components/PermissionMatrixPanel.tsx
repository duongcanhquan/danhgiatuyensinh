import { Fragment, useMemo } from 'react'
import { Check, X } from 'lucide-react'
import {
  PERMISSION_LABELS,
  PERMISSIONS,
  PERMISSION_TIERS,
  tierHasPermission,
} from '../auth/permissionsMatrix'
import type { Permission } from '../types'
import { useAuth } from '../hooks/useAuth'

const PERMISSION_GROUPS: { title: string; keys: Permission[] }[] = [
  {
    title: 'Hồ sơ & tương tác',
    keys: [
      'leads:read:self_assigned',
      'leads:read:team_scope',
      'leads:read:global',
      'leads:write:self_assigned',
      'leads:write:team_scope',
      'leads:reassign:peer',
      'leads:reassign:team',
      'interactions:create:self_assigned',
      'interactions:create:team_scope',
      'interactions:read:team_scope',
    ],
  },
  {
    title: 'Bảng điều khiển & phân tích',
    keys: [
      'dashboard:counselor',
      'dashboard:team_lead',
      'analytics:advanced',
    ],
  },
  {
    title: 'Cấu hình & AI',
    keys: [
      'config:scoring_rules',
      'config:scoring_profiles_own',
      'config:scoring_profiles_team',
      'config:master_data',
      'config:playbooks',
      'config:routing_policies',
      'config:users',
      'config:users:team',
      'data:intake',
      'ai:use',
      'config:ai_engine',
      'config:llm_api',
    ],
  },
]

export function PermissionMatrixPanel() {
  const { profile, permissions: myPerms } = useAuth()

  const extra = profile?.extraPermissions ?? []
  const denied = profile?.deniedPermissions ?? []

  const grouped = useMemo(() => {
    const seen = new Set<Permission>()
    const out = PERMISSION_GROUPS.map((g) => ({
      ...g,
      keys: g.keys.filter((k) => {
        seen.add(k)
        return true
      }),
    }))
    const rest = (PERMISSIONS as readonly Permission[]).filter((p) => !seen.has(p))
    if (rest.length) out.push({ title: 'Khác', keys: rest })
    return out
  }, [])

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm leading-relaxed text-slate-700">
        <p className="font-semibold text-slate-900">Ba tầng nghiệp vụ</p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-slate-700">
          <li>
            <strong>Tư vấn viên</strong> — cập nhật hồ sơ do mình phụ trách; tự tạo profile chấm điểm cá nhân.
          </li>
          <li>
            <strong>Trưởng nhóm</strong> — toàn bộ hồ sơ & profile nhóm; đổi TVV trong nhóm; mẫu tư vấn (Thông tin TV);
            quản lý TVV nhóm. Không cấu hình Tri thức / LLM / master data toàn trường.
          </li>
          <li>
            <strong>Quản trị</strong> — full quyền (Siêu quản trị thêm khóa API LLM).
          </li>
        </ul>
        <p className="mt-2 text-slate-600">
          Trưởng nhóm: gán danh sách TVV qua <code className="rounded bg-white px-1 font-mono text-xs">managedCounselorIds</code>{' '}
          trên hồ sơ user (màn Quản lý nhân sự → Sửa).
        </p>
        {extra.length || denied.length ? (
          <p className="mt-2 text-amber-900">
            Tài khoản đang đăng nhập:{' '}
            {extra.length ? `+${extra.length} quyền bổ sung` : null}
            {extra.length && denied.length ? ' · ' : null}
            {denied.length ? `−${denied.length} quyền thu hồi` : null}.
          </p>
        ) : null}
      </div>

      <div className="scroll-touch overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-[720px] w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-white text-xs font-semibold uppercase tracking-wide text-slate-600">
              <th className="sticky left-0 z-10 min-w-[14rem] bg-white px-3 py-2.5">Quyền</th>
              {PERMISSION_TIERS.map((t) => (
                <th key={t.id} className="min-w-[6.5rem] px-2 py-2.5 text-center">
                  {t.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grouped.map((group) => (
              <Fragment key={group.title}>
                <tr className="bg-slate-100/90">
                  <td
                    colSpan={PERMISSION_TIERS.length + 1}
                    className="sticky left-0 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700"
                  >
                    {group.title}
                  </td>
                </tr>
                {group.keys.map((p) => (
                  <tr key={p} className="border-b border-slate-100 hover:bg-amber-50/30">
                    <td className="sticky left-0 z-[1] bg-white px-3 py-2 text-slate-800" title={p}>
                      <span className="font-medium">{PERMISSION_LABELS[p]}</span>
                      <span className="mt-0.5 block font-mono text-[0.65rem] text-slate-400">{p}</span>
                    </td>
                    {PERMISSION_TIERS.map((tier) => {
                      const on = tierHasPermission(tier.id, p)
                      return (
                        <td key={tier.id} className="px-2 py-2 text-center">
                          {on ? (
                            <Check className="mx-auto h-4 w-4 text-emerald-600" aria-label="Có" />
                          ) : (
                            <X className="mx-auto h-4 w-4 text-slate-300" aria-label="Không" />
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500">
        Quyền hiện tại của bạn: {myPerms.length} mục. Chỉnh ma trận mặc định trong{' '}
        <code className="font-mono">src/auth/permissions.ts</code>.
      </p>
    </div>
  )
}
