import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ClipboardList, Users } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { isAdminLikeRole } from '../auth/roleUtils'
import { CounselorDashboard } from './CounselorDashboard'
import { LeadManagement } from './LeadManagement'

type WorkspaceMode = 'counselor' | 'full'

/**
 * Một cổng `/leads`: giữ nguyên hai bộ tính năng (TVV vs CRM đầy đủ), chỉ một màn được mount tại một thời điểm
 * để tránh tải lead hai lần. Chọn tab đồng bộ `view` trên URL; chỉ `open` (mở chi tiết hồ sơ) ép sang CRM đầy đủ — `q` giữ nguyên khi đổi tab.
 */
export function LeadsWorkspace() {
  const { profile, can } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const canCounselorBoard = can('dashboard:counselor')

  const viewParam = (searchParams.get('view') ?? '').trim().toLowerCase()
  const openLead = (searchParams.get('open') ?? '').trim()

  const defaultMode: WorkspaceMode = useMemo(() => {
    if (!canCounselorBoard) return 'full'
    if (profile?.role === 'counselor') return 'counselor'
    if (isAdminLikeRole(profile?.role)) return 'full'
    return 'counselor'
  }, [canCounselorBoard, profile?.role])

  const mode: WorkspaceMode = useMemo(() => {
    if (!canCounselorBoard) return 'full'
    if (openLead) return 'full'
    if (viewParam === 'counselor' || viewParam === 'tvv') return 'counselor'
    if (viewParam === 'full' || viewParam === 'leads') return 'full'
    return defaultMode
  }, [canCounselorBoard, viewParam, openLead, defaultMode])

  const setMode = useCallback(
    (next: WorkspaceMode) => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          if (next === 'counselor') p.set('view', 'counselor')
          else p.set('view', 'full')
          return p
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  if (!canCounselorBoard) {
    return <LeadManagement />
  }

  return (
    <div className="space-y-3">
      <div
        role="tablist"
        aria-label="Chế độ hồ sơ"
        className="flex flex-wrap gap-2 rounded-2xl border border-slate-200/90 bg-white/60 p-1 shadow-sm backdrop-blur-md"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'counselor'}
          onClick={() => setMode('counselor')}
          className={[
            'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition md:px-4',
            mode === 'counselor'
              ? 'bg-gradient-to-r from-teal-600 to-emerald-700 text-white shadow-md'
              : 'text-slate-700 hover:bg-white/90',
          ].join(' ')}
        >
          <ClipboardList className="h-4 w-4 shrink-0 opacity-90" strokeWidth={2} aria-hidden />
          Tư vấn (TVV)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'full'}
          onClick={() => setMode('full')}
          className={[
            'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition md:px-4',
            mode === 'full'
              ? 'bg-gradient-to-r from-amber-500 to-amber-700 text-white shadow-md'
              : 'text-slate-700 hover:bg-white/90',
          ].join(' ')}
        >
          <Users className="h-4 w-4 shrink-0 opacity-90" strokeWidth={2} aria-hidden />
          Hồ sơ đầy đủ
        </button>
      </div>

      {mode === 'counselor' ? <CounselorDashboard /> : <LeadManagement />}
    </div>
  )
}
