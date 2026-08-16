import type { Permission } from '../types'
import { canAccessTeamRosterTab } from './teamRosterMembers'

export type SummaryTabId =
  | 'tong-quan'
  | 'bao-cao-toan-dien'
  | 'kpi-nhan-su'
  | 'bang-diem'
  | 'lich-goi'
  | 'van-hanh'
  | 'quan-ly-team'
  | 'quan-ly-truong'

export const SUMMARY_TAB_ORDER: SummaryTabId[] = [
  'tong-quan',
  'bao-cao-toan-dien',
  'quan-ly-team',
  'quan-ly-truong',
  'kpi-nhan-su',
  'bang-diem',
  'lich-goi',
  'van-hanh',
]

/** Nhãn tab ngắn — dễ chọn trên điện thoại (vuốt ngang). */
export const SUMMARY_TAB_LABELS: Record<SummaryTabId, string> = {
  'tong-quan': 'Tổng quan',
  'bao-cao-toan-dien': 'Báo cáo',
  'quan-ly-team': 'Quản lý team',
  'quan-ly-truong': 'Quản lý trường',
  'kpi-nhan-su': 'Đánh giá',
  'bang-diem': 'Bảng điểm',
  'lich-goi': 'Lịch gọi',
  'van-hanh': 'Vận hành',
}

export function canAccessSummaryTab(tab: SummaryTabId, can: (p: Permission) => boolean): boolean {
  switch (tab) {
    case 'tong-quan':
      return true
    case 'bao-cao-toan-dien':
      return can('analytics:advanced') || can('leads:read:global') || can('dashboard:team_lead')
    case 'quan-ly-team':
      return canAccessTeamRosterTab(can)
    case 'quan-ly-truong':
      return can('leads:read:global')
    case 'kpi-nhan-su':
      return can('dashboard:counselor') || can('analytics:advanced') || can('dashboard:team_lead')
    case 'bang-diem':
      return can('analytics:advanced') || can('leads:read:global') || can('dashboard:team_lead')
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
    'nhom-cua-toi': 'quan-ly-team',
    'bao-cao-tuyen-sinh': 'bao-cao-toan-dien',
  }
  const mapped = param ? legacy[param] : undefined
  if (mapped && tabs.includes(mapped)) return mapped
  return fallback
}
