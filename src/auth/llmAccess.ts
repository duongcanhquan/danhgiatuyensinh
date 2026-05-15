import type { VietMyUserProfile } from '../types'
import { isSuperAdminRole } from './roleUtils'

/**
 * Được chạy phân tích AI trên hồ sơ / AI Miner / Phòng thử — Siêu quản trị luôn được;
 * các vai trò khác cần Quản lý bật «Cho phép dùng AI trên hồ sơ» trên users/{uid}.
 */
export function isLlmAnalysisAllowedForProfile(profile: VietMyUserProfile | null | undefined): boolean {
  if (!profile) return false
  if (isSuperAdminRole(profile.role)) return true
  return profile.allowLlmAndAiTasks === true
}
