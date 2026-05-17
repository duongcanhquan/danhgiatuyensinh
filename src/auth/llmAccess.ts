import type { VietMyUserProfile } from '../types'
import { isAdminLikeRole, isSuperAdminRole } from './roleUtils'

/**
 * Được chạy phân tích AI trên hồ sơ / AI Miner — Siêu quản trị và Admin luôn được;
 * TVV / trưởng bộ môn cần Quản lý bật «Cho phép dùng AI trên hồ sơ» trên users/{uid}.
 */
export function isLlmAnalysisAllowedForProfile(profile: VietMyUserProfile | null | undefined): boolean {
  if (!profile) return false
  if (isSuperAdminRole(profile.role)) return true
  if (isAdminLikeRole(profile.role)) return true
  return profile.allowLlmAndAiTasks === true
}
