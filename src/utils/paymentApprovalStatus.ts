import type { LeadPaymentApprovalStatus } from '../types'

/** Gộp dấu / khoảng trắng để so khớp trạng thái duyệt từ Sheet / nhập tay. */
export function foldFinanceStatusText(raw: string): string {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[đĐ]/g, 'D')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
}

/**
 * Chuẩn hóa trạng thái duyệt khoản thu → enum CRM.
 * Sheet cũ có thể ghi «Đồng ý», «Dong y», «Đã duyệt», «x»,…
 * Tránh false-positive: «CHƯA XÁC NHẬN», «KHÔNG ĐỒNG Ý».
 */
export function normalizePaymentApprovalStatus(raw: unknown): LeadPaymentApprovalStatus | '' {
  const original = String(raw ?? '').trim()
  if (!original) return ''
  const folded = foldFinanceStatusText(original)

  // Từ chối / phủ định trước — tránh «KHÔNG ĐỒNG Ý» bị coi là duyệt
  if (
    folded === 'TU CHOI' ||
    /\bTU CHOI\b/.test(folded) ||
    folded === 'REJECTED' ||
    folded === 'NO' ||
    folded === 'FALSE' ||
    /\bKHONG DONG Y\b/.test(folded) ||
    folded.includes('KHONG DUYET')
  ) {
    return 'TỪ CHỐI'
  }

  if (folded.includes('KIEM TRA') || folded.includes('CHUA XAC NHAN') || folded.includes('CHUA DUYET')) {
    return 'KIỂM TRA LẠI'
  }

  if (
    folded === 'DONG Y' ||
    /\bDONG Y\b/.test(folded) ||
    folded === 'APPROVED' ||
    folded === 'OK' ||
    folded === 'YES' ||
    folded === 'X' ||
    folded === '1' ||
    folded === 'TRUE' ||
    folded.includes('DA DUYET') ||
    /\bDA XAC NHAN\b/.test(folded) ||
    folded === 'XAC NHAN'
  ) {
    return 'ĐỒNG Ý'
  }

  if (original === 'ĐỒNG Ý' || original === 'TỪ CHỐI' || original === 'KIỂM TRA LẠI') {
    return original
  }
  return ''
}
