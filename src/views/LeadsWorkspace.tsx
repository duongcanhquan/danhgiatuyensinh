import { LeadManagement } from './LeadManagement'

/**
 * Cổng `/leads`: một màn CRM hồ sơ đầy đủ cho mọi vai trò được phép.
 * Bảng «Tư vấn (TVV)» riêng đã gộp vào đây để tránh trùng UI; tham số lọc/tìm (`q`, `crm`, …) vẫn dùng chung trên URL.
 */
export function LeadsWorkspace() {
  return <LeadManagement />
}
