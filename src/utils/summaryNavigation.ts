import type { Permission } from '../types'

export type SummaryTabId = 'tong-quan' | 'kpi-nhan-su' | 'bang-diem' | 'lich-goi' | 'van-hanh'

export const SUMMARY_TAB_ORDER: SummaryTabId[] = [
  'tong-quan',
  'kpi-nhan-su',
  'bang-diem',
  'lich-goi',
  'van-hanh',
]

export const SUMMARY_TAB_LABELS: Record<SummaryTabId, string> = {
  'tong-quan': 'Tổng quan',
  'kpi-nhan-su': 'KPI & nhân sự',
  'bang-diem': 'Bảng điểm tháng',
  'lich-goi': 'Lịch sử gọi',
  'van-hanh': 'Vận hành ngày',
}

export function canAccessSummaryTab(tab: SummaryTabId, can: (p: Permission) => boolean): boolean {
  switch (tab) {
    case 'tong-quan':
      return true
    case 'kpi-nhan-su':
      return can('dashboard:counselor') || can('analytics:advanced') || can('dashboard:team_lead')
    case 'bang-diem':
      return can('analytics:advanced')
    case 'lich-goi':
      return can('dashboard:counselor') || can('analytics:advanced') || can('dashboard:team_lead')
    case 'van-hanh':
      return can('dashboard:team_lead') || can('analytics:advanced') || can('leads:read:global')
    default:
      return false
  }
}

export function enabledSummaryTabs(can: (p: Permission) => boolean): SummaryTabId[] {
  return SUMMARY_TAB_ORDER.filter((t) => canAccessSummaryTab(t, can))
}

export function resolveSummaryTab(
  param: string | null,
  can: (p: Permission) => boolean,
): SummaryTabId {
  const tabs = enabledSummaryTabs(can)
  const fallback = tabs[0] ?? 'tong-quan'
  if (param && tabs.includes(param as SummaryTabId)) return param as SummaryTabId
  const legacy: Partial<Record<string, SummaryTabId>> = {
    pipeline: 'tong-quan',
    personnel: 'tong-quan',
    kpi: 'kpi-nhan-su',
    scorecard: 'bang-diem',
    calls: 'lich-goi',
    command: 'van-hanh',
  }
  const mapped = param ? legacy[param] : undefined
  if (mapped && tabs.includes(mapped)) return mapped
  return fallback
}
