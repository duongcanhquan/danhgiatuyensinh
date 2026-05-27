import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { VietMyAccentHeading } from '../components/VietMyAccentHeading'
import {
  enabledSummaryTabs,
  resolveSummaryTab,
  SUMMARY_TAB_LABELS,
  type SummaryTabId,
} from '../utils/summaryNavigation'
import { AdminPersonnelKpiPanel } from '../components/AdminPersonnelKpiPanel'
import { DashboardView } from './DashboardView'
import { CounselorKpiView } from './CounselorKpiView'
import { ScorecardView } from './ScorecardView'
import { CallHistoryView } from './CallHistoryView'
import { CommandCenterView } from './CommandCenterView'

const TAB_BTN =
  'shrink-0 rounded-xl px-3 py-2 text-sm font-semibold transition whitespace-nowrap border'

export function SummaryHubView() {
  const { can, profile } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabs = useMemo(() => enabledSummaryTabs(can), [can])
  const activeTab = resolveSummaryTab(searchParams.get('tab'), can)
  const showPersonnelEval =
    can('analytics:advanced') || can('dashboard:team_lead') || can('leads:read:global')

  const setTab = (tab: SummaryTabId) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('tab', tab)
        return next
      },
      { replace: true },
    )
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
      <header className="app-glass-panel rounded-2xl px-4 py-4 shadow-sm sm:px-5">
        <VietMyAccentHeading as="h1" tone="onLight" size="xl" className="block">
          Tổng kết
        </VietMyAccentHeading>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600">
          Một nơi xem <strong>tổng quan</strong>, <strong>KPI &amp; cuộc gọi</strong>, <strong>bảng điểm tháng</strong>{' '}
          và vận hành ngày — mỗi tab một việc, không trùng menu Hồ sơ.
        </p>
        {tabs.length > 1 ? (
          <nav
            className="mt-4 flex gap-2 overflow-x-auto overscroll-x-contain pb-0.5"
            aria-label="Phần trong Tổng kết"
          >
            {tabs.map((tab) => {
              const on = activeTab === tab
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setTab(tab)}
                  className={
                    on
                      ? `${TAB_BTN} border-amber-400/50 bg-amber-50 text-amber-950 shadow-sm`
                      : `${TAB_BTN} border-slate-200/90 bg-white/80 text-slate-700 hover:border-slate-300 hover:bg-white`
                  }
                  aria-current={on ? 'page' : undefined}
                >
                  {SUMMARY_TAB_LABELS[tab]}
                </button>
              )
            })}
          </nav>
        ) : null}
        {profile?.role === 'counselor' && activeTab === 'tong-quan' ? (
          <p className="mt-3 text-xs text-slate-500">
            Công việc hằng ngày: mục <strong>Ngày của tôi</strong> trên menu.
          </p>
        ) : null}
      </header>

      <div className="min-h-0 min-w-0 flex-1" role="tabpanel">
        {activeTab === 'tong-quan' ? <DashboardView embedded /> : null}
        {activeTab === 'kpi-nhan-su' ? (
          <div className="space-y-6">
            {showPersonnelEval ? (
              <section className="app-glass-panel rounded-2xl p-4 shadow-sm sm:p-5">
                <h2 className="text-sm font-bold text-slate-900">Đánh giá tuân thủ &amp; điểm nhân sự</h2>
                <p className="mt-1 text-xs text-slate-600">Theo nhóm / từng TVV — nhập điểm và xem 4 trụ KPI.</p>
                <div className="mt-4">
                  <AdminPersonnelKpiPanel />
                </div>
              </section>
            ) : null}
            <CounselorKpiView embedded />
          </div>
        ) : null}
        {activeTab === 'bang-diem' ? <ScorecardView embedded /> : null}
        {activeTab === 'lich-goi' ? <CallHistoryView embedded /> : null}
        {activeTab === 'van-hanh' ? <CommandCenterView embedded /> : null}
      </div>
    </div>
  )
}
