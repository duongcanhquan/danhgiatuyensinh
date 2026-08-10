import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { AppPageHeader } from '../components/AppPageHeader'
import { TabStrip } from '../components/TabStrip'
import { BentoCell, BentoGrid } from '../components/bento'
import { CrmAdminShortcuts } from '../components/CrmAdminShortcuts'
import { IntegrationsStatusStrip } from '../components/IntegrationsStatusStrip'
import {
  enabledSummaryTabs,
  resolveSummaryTab,
  SUMMARY_TAB_LABELS,
  type SummaryTabId,
} from '../utils/summaryNavigation'
import { DashboardView } from './DashboardView'
import { ScorecardView } from './ScorecardView'
import { CallHistoryView } from './CallHistoryView'
import { CommandCenterView } from './CommandCenterView'
import { PerformanceReportView } from './PerformanceReportView'
import { TeamRosterSummaryView } from './TeamRosterSummaryView'

const SUMMARY_PANEL_ID = 'summary-tabpanel'

export function SummaryHubView() {
  const { can } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabs = useMemo(() => enabledSummaryTabs(can), [can])
  const activeTab = resolveSummaryTab(searchParams.get('tab'), can)
  const tabItems = useMemo(
    () => tabs.map((tab) => ({ id: tab, label: SUMMARY_TAB_LABELS[tab] })),
    [tabs],
  )

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
    <div className="bento-board flex min-h-0 min-w-0 flex-1 flex-col">
      <CrmAdminShortcuts />
      <IntegrationsStatusStrip />

      <BentoGrid className="lg:!grid-cols-4">
        <BentoCell variant="hero" colSpan={4} className="!p-3 sm:!p-5">
          <AppPageHeader
            title="Tổng kết"
            meta={<span className="hidden sm:inline">Nhóm · KPI · bảng điểm · lịch gọi</span>}
            className="[&_h1]:text-white [&_.text-slate-500]:text-indigo-100/80"
          >
            <TabStrip
              tabs={tabItems}
              active={activeTab}
              onChange={setTab}
              ariaLabel="Phần trong Tổng kết"
              panelId={SUMMARY_PANEL_ID}
              className="-mx-0.5"
            />
          </AppPageHeader>
        </BentoCell>
      </BentoGrid>

      <BentoCell colSpan={4} className="min-h-0 flex-1 !p-2.5 sm:!p-4">
        <div
          id={SUMMARY_PANEL_ID}
          className="min-h-0 min-w-0 flex-1"
          role="tabpanel"
          aria-labelledby={`tab-${activeTab}`}
        >
          {activeTab === 'tong-quan' ? <DashboardView embedded /> : null}
          {activeTab === 'nhom-cua-toi' ? <TeamRosterSummaryView /> : null}
          {activeTab === 'kpi-nhan-su' ? <PerformanceReportView /> : null}
          {activeTab === 'bang-diem' ? <ScorecardView embedded /> : null}
          {activeTab === 'lich-goi' ? <CallHistoryView embedded /> : null}
          {activeTab === 'van-hanh' ? <CommandCenterView embedded /> : null}
        </div>
      </BentoCell>
    </div>
  )
}
