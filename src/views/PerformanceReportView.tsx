import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, CalendarDays, ClipboardList, Users } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import {
  resolveEffectiveReportScope,
  reportScopeDescription,
  REPORT_SCOPE_LABELS,
  reportScopeLabel,
} from '../utils/reportScope'
import { useManagementViewScope } from '../contexts/ManagementViewScopeContext'
import { AdminPersonnelKpiPanel } from '../components/AdminPersonnelKpiPanel'
import { CounselorKpiView } from './CounselorKpiView'
import { PersonalMonthlyKpiSection } from '../components/PersonalMonthlyKpiSection'
import { PeriodKpiReportSection } from '../components/PeriodKpiReportSection'
import { BentoCell } from '../components/bento'

type ReportTab = 'tong-hop' | 'bao-cao-ky' | 'danh-gia-thang' | 'diem-ca-nhan'

function canAccessPersonnelReport(can: (p: import('../types').Permission) => boolean): boolean {
  return can('analytics:advanced') || can('leads:read:global') || can('dashboard:team_lead')
}

export function PerformanceReportView() {
  const { can, profile } = useAuth()
  const { preferTeamScope } = useManagementViewScope()
  const scope = resolveEffectiveReportScope(can, profile?.role, preferTeamScope)
  const scopeLabel =
    scope === 'self'
      ? reportScopeLabel(can, profile)
      : REPORT_SCOPE_LABELS[scope]
  const showManagerPanel = canAccessPersonnelReport(can)

  const tabs = useMemo((): { id: ReportTab; label: string }[] => {
    if (scope === 'self') {
      return [
        { id: 'tong-hop', label: 'Tổng hợp kỳ' },
        { id: 'diem-ca-nhan', label: 'Điểm tháng' },
      ]
    }
    return [
      { id: 'tong-hop', label: 'Tổng hợp kỳ' },
      { id: 'bao-cao-ky', label: 'Báo cáo kỳ' },
      { id: 'danh-gia-thang', label: 'Đánh giá tháng' },
    ]
  }, [scope])

  const [activeTab, setActiveTab] = useState<ReportTab>(tabs[0]?.id ?? 'tong-hop')

  const safeTab = tabs.some((t) => t.id === activeTab) ? activeTab : tabs[0]?.id ?? 'tong-hop'

  return (
    <div className="bento-board">
      <BentoCell className="!p-3 sm:!p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Báo cáo đánh giá</p>
            <h2 className="mt-0.5 text-lg font-bold text-slate-950">{scopeLabel}</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">{reportScopeDescription(scope)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {scope === 'self' ? (
              <Link
                to="/my-day"
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-900 hover:bg-sky-100"
              >
                <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                Ngày của tôi
              </Link>
            ) : null}
            {showManagerPanel ? (
              <Link
                to="/tong-ket?tab=van-hanh"
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-900 hover:bg-indigo-100"
              >
                <BarChart3 className="h-3.5 w-3.5" aria-hidden />
                Vận hành ngày
              </Link>
            ) : null}
            <Link
              to="/tong-ket?tab=lich-goi"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              <Users className="h-3.5 w-3.5" aria-hidden />
              Lịch sử gọi
            </Link>
            {can('analytics:advanced') ? (
              <Link
                to="/tong-ket?tab=bang-diem"
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
              >
                <ClipboardList className="h-3.5 w-3.5" aria-hidden />
                Bảng điểm tháng
              </Link>
            ) : null}
          </div>
        </div>

        <div
          className="app-tab-segmented scroll-touch mt-4 flex flex-wrap gap-0.5"
          role="tablist"
          aria-label="Loại báo cáo"
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={safeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="app-tab-segmented-btn"
              data-active={safeTab === tab.id ? 'true' : 'false'}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </BentoCell>

      {safeTab === 'tong-hop' ? <CounselorKpiView embedded /> : null}
      {safeTab === 'bao-cao-ky' && showManagerPanel ? (
        <BentoCell className="!p-3 sm:!p-4">
          <PeriodKpiReportSection />
        </BentoCell>
      ) : null}
      {safeTab === 'danh-gia-thang' && showManagerPanel ? (
        <BentoCell className="!p-3 sm:!p-4">
          <AdminPersonnelKpiPanel variant="monthly-only" />
        </BentoCell>
      ) : null}
      {safeTab === 'diem-ca-nhan' ? (
        <BentoCell className="!p-3 sm:!p-4">
          <PersonalMonthlyKpiSection />
        </BentoCell>
      ) : null}
    </div>
  )
}
