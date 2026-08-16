import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { TabStrip } from '../components/TabStrip'
import { BentoCell } from '../components/bento'
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
import { OpsMonitorView } from './OpsMonitorView'
import { AdmissionsReportsView } from './AdmissionsReportsView'

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

      <BentoCell className="!p-2 sm:!p-2.5">
        <TabStrip
          tabs={tabItems}
          active={activeTab}
          onChange={setTab}
          ariaLabel="Phần trong Tổng kết"
          panelId={SUMMARY_PANEL_ID}
          className="-mx-0.5"
        />
      </BentoCell>

      <BentoCell colSpan={4} className="min-h-0 flex-1 !p-2.5 sm:!p-4">
        <div
          id={SUMMARY_PANEL_ID}
          className="min-h-0 min-w-0 flex-1"
          role="tabpanel"
          aria-labelledby={`tab-${activeTab}`}
        >
          {activeTab === 'tong-quan' ? <DashboardView embedded /> : null}
          {activeTab === 'bao-cao-toan-dien' ? <AdmissionsReportsView embedded /> : null}
          {activeTab === 'quan-ly-team' ? <OpsMonitorView mode="team" /> : null}
          {activeTab === 'quan-ly-truong' ? <OpsMonitorView mode="school" /> : null}
          {activeTab === 'kpi-nhan-su' ? <PerformanceReportView /> : null}
          {activeTab === 'bang-diem' ? <ScorecardView embedded /> : null}
          {activeTab === 'lich-goi' ? <CallHistoryView embedded /> : null}
          {activeTab === 'van-hanh' ? <CommandCenterView embedded /> : null}
        </div>
      </BentoCell>
    </div>
  )
}
