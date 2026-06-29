import type { Lead, LeadPaymentSlotKey } from '../types'
import { PAYMENT_SLOT_DEFS } from './leadFinance'

const SLOT_ORDER: LeadPaymentSlotKey[] = PAYMENT_SLOT_DEFS.map((s) => s.key)

function vnDayBounds(d: Date): { start: number; end: number; label: string } {
  const tz = 'Asia/Ho_Chi_Minh'
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)
  const day = Number(parts.find((p) => p.type === 'day')?.value)
  const month = Number(parts.find((p) => p.type === 'month')?.value)
  const year = Number(parts.find((p) => p.type === 'year')?.value)
  const label = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`
  const start = new Date(year, month - 1, day, 0, 0, 0, 0).getTime()
  const end = new Date(year, month - 1, day, 23, 59, 59, 999).getTime()
  return { start, end, label }
}

function parseCollectedTs(raw?: string): number {
  const s = String(raw ?? '').trim().replace(/^'/, '')
  if (!s) return 0
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.slice(0, 10).split('-').map(Number)
    return new Date(y, m - 1, d).getTime()
  }
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])).getTime()
  return 0
}

function evaluateLeadFinance(lead: Lead) {
  const sys = String(lead.educationLevel || '').toUpperCase()
  const st = String(lead.finance?.enrollmentStatus || 'MỚI').trim().toUpperCase()
  const isFullNE = String(lead.finance?.fullNeStatus || '').trim() === 'ĐÃ FULL NE'
  const is9Plus = sys.includes('9+')
  const isTCSC = sys.includes('TRUNG CẤP') || sys.includes('SƠ CẤP')
  const isDuHoc = sys.includes('DU HỌC') || sys.includes('NGẮN HẠN') || sys.includes('SBS')

  let totalApproved = 0
  const pay = lead.finance?.payments ?? {}
  for (const key of SLOT_ORDER) {
    const line = pay[key]
    if (line?.approvalStatus === 'ĐỒNG Ý' && line.amountVnd) totalApproved += line.amountVnd
  }

  let isCoc = false
  let isLpxt = false
  if (!isFullNE) {
    const threshold = is9Plus ? 2_000_000 : 1_000_000
    if (totalApproved >= threshold || st === 'CỌC THÀNH CÔNG' || st === 'ĐÃ HOÀN THIỆN') isCoc = true
    else if (totalApproved >= 150_000) isLpxt = true
  }

  return { isFullNE, isCoc, isLpxt, is9Plus, isTCSC, isDuHoc }
}

/** Báo cáo ngày — payload gửi `baocao-ngay` (giống `sendDailyReportToN8N`). */
export function buildDailyFinanceReportPayload(leads: Lead[], at = new Date()) {
  const { start, end, label } = vnDayBounds(at)

  let tongHocSinhNop = 0
  let tongTien = 0
  let cd_hs = 0,
    cd_tien = 0,
    cd_lpxt = 0,
    cd_coc = 0,
    cd_full_ne = 0
  let tc_hs = 0,
    tc_tien = 0,
    tc_lpxt = 0,
    tc_coc = 0,
    tc_full_ne = 0
  let dh_hs = 0,
    dh_tien = 0,
    dh_coc = 0,
    dh_hoanthien = 0

  for (const lead of leads) {
    if (!lead.customerId && !lead.id) continue
    const stEval = evaluateLeadFinance(lead)

    if (stEval.isFullNE) {
      cd_full_ne += stEval.isDuHoc ? 0 : stEval.isTCSC ? 0 : 1
      if (stEval.isTCSC) tc_full_ne++
      if (stEval.isDuHoc) dh_hoanthien++
    }

    let hasMoneyToday = false
    let moneyTodayOfStudent = 0
    const pay = lead.finance?.payments ?? {}
    for (const key of SLOT_ORDER) {
      const line = pay[key]
      const amt = line?.amountVnd ?? 0
      const status = String(line?.approvalStatus ?? '').trim().toUpperCase()
      const pTs = parseCollectedTs(line?.collectedAt)
      if (status === 'ĐỒNG Ý' && amt > 0 && pTs >= start && pTs <= end) {
        hasMoneyToday = true
        moneyTodayOfStudent += amt
        tongTien += amt
      }
    }

    if (!hasMoneyToday) continue
    tongHocSinhNop++
    if (stEval.isDuHoc) {
      dh_hs++
      dh_tien += moneyTodayOfStudent
      dh_coc++
    } else if (stEval.isTCSC) {
      tc_hs++
      tc_tien += moneyTodayOfStudent
      if (stEval.isCoc) tc_coc++
      else if (stEval.isLpxt) tc_lpxt++
    } else {
      cd_hs++
      cd_tien += moneyTodayOfStudent
      if (stEval.isCoc) cd_coc++
      else if (stEval.isLpxt) cd_lpxt++
    }
  }

  let detailHtml = `<b>KẾT QUẢ TUYỂN SINH ${label} :</b><br><b>Tổng số HS nộp tiền được Kế toán duyệt :</b> <font color="#d93025"><b>${tongHocSinhNop}</b></font><br><br>`
  if (cd_hs > 0 || cd_full_ne > 0) {
    detailHtml += `<b>I/ Hệ Cao đẳng/9+:</b> (Hồ sơ: <b>${cd_hs}</b> | Thu: <font color="#198754"><b>${cd_tien.toLocaleString('vi-VN')}đ</b></font>)<br>`
    if (cd_lpxt > 0) detailHtml += `+ Đã nộp LPXT: <font color="#0056b3"><b>${cd_lpxt}</b></font><br>`
    if (cd_coc > 0) detailHtml += `+ Hoàn thành cọc: <font color="#198754"><b>${cd_coc}</b></font><br>`
    if (cd_full_ne > 0) detailHtml += `+ Đã là NE: <font color="#8e44ad"><b>${cd_full_ne}</b></font><br><br>`
  }
  if (tc_hs > 0 || tc_full_ne > 0) {
    detailHtml += `<b>II/ Hệ Trung Cấp/Sơ Cấp:</b> (Hồ sơ: <b>${tc_hs}</b> | Thu: <font color="#198754"><b>${tc_tien.toLocaleString('vi-VN')}đ</b></font>)<br>`
    if (tc_lpxt > 0) detailHtml += `+ Đã nộp LPXT: <font color="#0056b3"><b>${tc_lpxt}</b></font><br>`
    if (tc_coc > 0) detailHtml += `+ Hoàn thành cọc: <font color="#198754"><b>${tc_coc}</b></font><br>`
    if (tc_full_ne > 0) detailHtml += `+ Đã là NE: <font color="#8e44ad"><b>${tc_full_ne}</b></font><br><br>`
  }
  if (dh_hs > 0 || dh_hoanthien > 0) {
    detailHtml += `<b>III/ Ngắn hạn & Du học:</b> (Hồ sơ: <b>${dh_hs}</b> | Thu: <font color="#198754"><b>${dh_tien.toLocaleString('vi-VN')}đ</b></font>)<br>`
    if (dh_coc > 0) detailHtml += `+ Đã nộp cọc: <font color="#e67e22"><b>${dh_coc}</b></font><br>`
    if (dh_hoanthien > 0) detailHtml += `+ Đã hoàn thiện: <font color="#198754"><b>${dh_hoanthien}</b></font><br><br>`
  }
  if (tongTien === 0 && cd_full_ne === 0 && tc_full_ne === 0 && dh_hoanthien === 0) {
    detailHtml += `<i>⏳ Hôm nay chưa có phát sinh giao dịch được duyệt hoặc hồ sơ hoàn thiện nào.</i><br><br>`
  }
  detailHtml += `----------------<br>💰 <b>Tổng số tiền Kế toán duyệt trong ngày:</b> <font color="#d93025" size="4"><b>${tongTien.toLocaleString('vi-VN')} VNĐ</b></font>`

  const chatText = [
    `📊 BÁO CÁO THU NGÀY ${label}`,
    `Tổng HS nộp tiền (KT duyệt): ${tongHocSinhNop}`,
    `Tổng tiền duyệt trong ngày: ${tongTien.toLocaleString('vi-VN')} VNĐ`,
    cd_hs > 0 ? `Cao đẳng/9+: ${cd_hs} HS · ${cd_tien.toLocaleString('vi-VN')}đ` : '',
    tc_hs > 0 ? `Trung cấp/Sơ cấp: ${tc_hs} HS · ${tc_tien.toLocaleString('vi-VN')}đ` : '',
    dh_hs > 0 ? `Du học/Ngắn hạn: ${dh_hs} HS · ${dh_tien.toLocaleString('vi-VN')}đ` : '',
  ]
    .filter(Boolean)
    .join('\n')

  return {
    date: label,
    dailyDetailHtml: detailHtml,
    message_vi: chatText,
    chat_text: chatText,
    notification_title: `📊 Tổng kết thu ngày ${label}`,
    tongTien,
    tongHocSinhNop,
  }
}

/** Báo cáo tháng — payload `baocao-thang`. */
export function buildMonthlyFinanceReportPayload(leads: Lead[], at = new Date()) {
  const tzMonth = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(at)
  const month = Number(tzMonth.find((p) => p.type === 'month')?.value)
  const year = Number(tzMonth.find((p) => p.type === 'year')?.value)
  const monthStr = `${String(month).padStart(2, '0')}/${year}`
  const startTs = new Date(year, month - 1, 1, 0, 0, 0).getTime()
  const endTs = new Date(year, month, 0, 23, 59, 59, 999).getTime()

  let nbMonth = 0
  let lpxtMonth = 0
  let neMonth = 0
  const tvvStats: Record<string, number> = {}

  for (const lead of leads) {
    const stEval = evaluateLeadFinance(lead)
    const createTs = lead.createdAt?.toMillis?.() ?? 0
    const tvvName = String(lead.uploaderName || lead.assignedTo || 'Khác').trim()

    let totalApproved = 0
    const pay = lead.finance?.payments ?? {}
    for (const key of SLOT_ORDER) {
      const line = pay[key]
      if (line?.approvalStatus === 'ĐỒNG Ý' && line.amountVnd) totalApproved += line.amountVnd
    }
    if (createTs >= startTs && createTs <= endTs && totalApproved === 0) nbMonth++

    let hasPaymentThisMonth = false
    for (const key of SLOT_ORDER) {
      const line = pay[key]
      const pTs = parseCollectedTs(line?.collectedAt)
      const amt = line?.amountVnd ?? 0
      const status = String(line?.approvalStatus ?? '').trim().toUpperCase()
      if (status === 'ĐỒNG Ý' && amt > 0 && pTs >= startTs && pTs <= endTs) hasPaymentThisMonth = true
    }

    if (hasPaymentThisMonth) {
      if (stEval.isCoc || stEval.isFullNE) {
        neMonth++
        tvvStats[tvvName] = (tvvStats[tvvName] || 0) + 1
      } else if (stEval.isLpxt) lpxtMonth++
    }
  }

  let topTvvName = 'Chưa có'
  let topTvvCount = 0
  for (const [name, count] of Object.entries(tvvStats)) {
    if (count > topTvvCount) {
      topTvvCount = count
      topTvvName = name
    }
  }

  return { month: monthStr, nbMonth, lpxtMonth, neMonth, topTvvName, topTvvCount }
}
