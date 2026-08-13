/**
 * Báo cáo thu ngày/tháng theo lịch — parity `sendDailyReportToN8N` / `sendMonthlyReportToN8N`.
 */
import type { Firestore } from 'firebase-admin/firestore'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'

const SLOT_KEYS = ['deposit', 'supplementL1', 'supplementL2', 'supplementL3', 'supplementL4'] as const

type LeadFinanceLite = {
  id: string
  educationLevel: string
  uploaderName: string
  assignedTo: string
  createdAtMs: number
  finance?: {
    enrollmentStatus?: string
    fullNeStatus?: string
    fullNeAt?: string
    payments?: Record<
      string,
      { amountVnd?: number; approvalStatus?: string; collectedAt?: string }
    >
  }
}

function str(v: unknown): string {
  return String(v ?? '').trim()
}

/** Instant tường lịch ICT (UTC+7) — CF chạy UTC nên không dùng `new Date(y,m,d)` local. */
function ictWallMs(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  ms = 0,
): number {
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return Date.parse(
    `${year}-${p(month)}-${p(day)}T${p(hour)}:${p(minute)}:${p(second)}.${p(ms, 3)}+07:00`,
  )
}

function parseCollectedTs(raw?: string): number {
  const s = str(raw).replace(/^'/, '')
  if (!s) return 0
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.slice(0, 10).split('-').map(Number)
    return ictWallMs(y, m, d)
  }
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) return ictWallMs(Number(m[3]), Number(m[2]), Number(m[1]))
  return 0
}

function vnDayBounds(d: Date): { start: number; end: number; label: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)
  const day = Number(parts.find((p) => p.type === 'day')?.value)
  const month = Number(parts.find((p) => p.type === 'month')?.value)
  const year = Number(parts.find((p) => p.type === 'year')?.value)
  const label = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`
  const start = ictWallMs(year, month, day, 0, 0, 0, 0)
  const end = ictWallMs(year, month, day, 23, 59, 59, 999)
  return { start, end, label }
}

function evaluateLead(
  lead: LeadFinanceLite,
  thresholds: { lpxtMinVnd: number; depositStandardVnd: number; depositNinePlusVnd: number } = {
    lpxtMinVnd: 150_000,
    depositStandardVnd: 1_000_000,
    depositNinePlusVnd: 2_000_000,
  },
) {
  const sys = String(lead.educationLevel || '').toUpperCase()
  const st = String(lead.finance?.enrollmentStatus || 'MỚI').trim().toUpperCase()
  const isFullNE = String(lead.finance?.fullNeStatus || '').trim() === 'ĐÃ FULL NE'
  const is9Plus = sys.includes('9+')
  const isTCSC = sys.includes('TRUNG CẤP') || sys.includes('SƠ CẤP')
  const isDuHoc = sys.includes('DU HỌC') || sys.includes('NGẮN HẠN') || sys.includes('SBS')

  let totalApproved = 0
  const pay = lead.finance?.payments ?? {}
  for (const key of SLOT_KEYS) {
    const line = pay[key]
    if (line?.approvalStatus === 'ĐỒNG Ý' && line.amountVnd) totalApproved += line.amountVnd
  }

  let isCoc = false
  let isLpxt = false
  if (!isFullNE) {
    const threshold = is9Plus ? thresholds.depositNinePlusVnd : thresholds.depositStandardVnd
    if (totalApproved >= threshold || st === 'CỌC THÀNH CÔNG' || st === 'ĐÃ HOÀN THIỆN') isCoc = true
    else if (totalApproved >= thresholds.lpxtMinVnd) isLpxt = true
  }
  return { isFullNE, isCoc, isLpxt, isTCSC, isDuHoc, totalApproved }
}

export type FinanceThresholdsLite = {
  lpxtMinVnd: number
  depositStandardVnd: number
  depositNinePlusVnd: number
}

export function defaultFinanceThresholdsLite(): FinanceThresholdsLite {
  return { lpxtMinVnd: 150_000, depositStandardVnd: 1_000_000, depositNinePlusVnd: 2_000_000 }
}

export async function loadOrgFinanceThresholds(db: Firestore, orgId: string): Promise<FinanceThresholdsLite> {
  const base = defaultFinanceThresholdsLite()
  try {
    const snap = await db
      .collection('orgSettings')
      .doc(orgId)
      .collection('settings')
      .doc('financeThresholds')
      .get()
    const data = snap.data() as Record<string, unknown> | undefined
    if (!data) return base
    const pos = (v: unknown, fb: number) => {
      const n = typeof v === 'number' ? v : Number(v)
      return Number.isFinite(n) && n > 0 ? Math.round(n) : fb
    }
    return {
      lpxtMinVnd: pos(data.lpxtMinVnd, base.lpxtMinVnd),
      depositStandardVnd: pos(data.depositStandardVnd, base.depositStandardVnd),
      depositNinePlusVnd: pos(data.depositNinePlusVnd, base.depositNinePlusVnd),
    }
  } catch (e) {
    console.warn('[financeScheduled] financeThresholds', e)
    return base
  }
}

export async function listActiveOrgIdsForReports(db: Firestore): Promise<string[]> {
  const ids = new Set<string>(['vietmy'])
  try {
    const snap = await db.collection('organizations').where('status', '==', 'active').get()
    for (const d of snap.docs) ids.add(d.id)
  } catch (e) {
    console.warn('[financeScheduled] organizations', e)
  }
  return [...ids]
}

export function buildDailyPayload(
  leads: LeadFinanceLite[],
  at = new Date(),
  thresholds: FinanceThresholdsLite = defaultFinanceThresholdsLite(),
) {
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
    const stEval = evaluateLead(lead, thresholds)
    const fullNeTs = parseCollectedTs(lead.finance?.fullNeAt)
    if (stEval.isFullNE && fullNeTs >= start && fullNeTs <= end) {
      if (stEval.isDuHoc) dh_hoanthien++
      else if (stEval.isTCSC) tc_full_ne++
      else cd_full_ne++
    }

    let hasMoneyToday = false
    let moneyToday = 0
    const pay = lead.finance?.payments ?? {}
    for (const key of SLOT_KEYS) {
      const line = pay[key]
      const amt = line?.amountVnd ?? 0
      const status = str(line?.approvalStatus).toUpperCase()
      const pTs = parseCollectedTs(line?.collectedAt)
      if (status === 'ĐỒNG Ý' && amt > 0 && pTs >= start && pTs <= end) {
        hasMoneyToday = true
        moneyToday += amt
        tongTien += amt
      }
    }
    if (!hasMoneyToday) continue
    tongHocSinhNop++
    if (stEval.isDuHoc) {
      dh_hs++
      dh_tien += moneyToday
      dh_coc++
    } else if (stEval.isTCSC) {
      tc_hs++
      tc_tien += moneyToday
      if (stEval.isCoc) tc_coc++
      else if (stEval.isLpxt) tc_lpxt++
    } else {
      cd_hs++
      cd_tien += moneyToday
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

  return {
    event: 'daily_finance_report',
    date: label,
    dailyDetailHtml: detailHtml,
    tongTien,
    tongHocSinhNop,
    notification_title: `📊 Tổng kết thu ngày ${label}`,
  }
}

export function buildMonthlyPayload(
  leads: LeadFinanceLite[],
  at = new Date(),
  thresholds: FinanceThresholdsLite = defaultFinanceThresholdsLite(),
) {
  const tzMonth = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(at)
  const month = Number(tzMonth.find((p) => p.type === 'month')?.value)
  const year = Number(tzMonth.find((p) => p.type === 'year')?.value)
  const monthStr = `${String(month).padStart(2, '0')}/${year}`
  const startTs = ictWallMs(year, month, 1, 0, 0, 0, 0)
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const endTs = ictWallMs(year, month, lastDay, 23, 59, 59, 999)

  let nbMonth = 0
  let lpxtMonth = 0
  let neMonth = 0
  const tvvStats: Record<string, number> = {}

  for (const lead of leads) {
    const stEval = evaluateLead(lead, thresholds)
    const createTs = lead.createdAtMs
    const tvvName = str(lead.uploaderName || lead.assignedTo || 'Khác')
    if (createTs >= startTs && createTs <= endTs && stEval.totalApproved === 0) nbMonth++

    let hasPaymentThisMonth = false
    const pay = lead.finance?.payments ?? {}
    for (const key of SLOT_KEYS) {
      const line = pay[key]
      const pTs = parseCollectedTs(line?.collectedAt)
      const amt = line?.amountVnd ?? 0
      const status = str(line?.approvalStatus).toUpperCase()
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

/** true nếu ngày mai đã sang tháng khác (ngày cuối tháng) — như Apps Script. */
export function isLastDayOfMonthIct(at = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at)
  const day = Number(parts.find((p) => p.type === 'day')?.value)
  const month = Number(parts.find((p) => p.type === 'month')?.value)
  const year = Number(parts.find((p) => p.type === 'year')?.value)
  const tomorrow = new Date(year, month - 1, day + 1)
  return tomorrow.getMonth() !== month - 1
}

export async function loadOrgLeadsForFinanceReport(
  db: Firestore,
  orgId: string,
): Promise<LeadFinanceLite[]> {
  const snap = await db.collection('leads').where('orgId', '==', orgId).get()
  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>
    const createdAt = data.createdAt as { toMillis?: () => number } | undefined
    return {
      id: d.id,
      educationLevel: str(data.educationLevel),
      uploaderName: str(data.uploaderName),
      assignedTo: str(data.assignedTo),
      createdAtMs: createdAt?.toMillis?.() ?? 0,
      finance: data.finance as LeadFinanceLite['finance'],
    }
  })
}

export async function loadOrgDailyWebhook(db: Firestore, orgId: string): Promise<string> {
  try {
    const snap = await db
      .collection('orgSettings')
      .doc(orgId)
      .collection('settings')
      .doc('n8nWebhooks')
      .get()
    const daily = str(snap.data()?.daily)
    if (daily.startsWith('http')) return daily
  } catch (e) {
    console.warn('[financeScheduled] n8nWebhooks', e)
  }
  return ''
}

export async function loadOrgMonthlyWebhook(db: Firestore, orgId: string): Promise<string> {
  try {
    const snap = await db
      .collection('orgSettings')
      .doc(orgId)
      .collection('settings')
      .doc('n8nWebhooks')
      .get()
    const monthly = str(snap.data()?.monthly)
    if (monthly.startsWith('http')) return monthly
  } catch (e) {
    console.warn('[financeScheduled] n8nWebhooks monthly', e)
  }
  return ''
}

export async function postWebhook(url: string, payload: Record<string, unknown>): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `Webhook ${res.status}`)
  }
}

export async function logFinanceReport(
  db: Firestore,
  entry: {
    kind: 'daily' | 'monthly'
    periodLabel: string
    preview: string
    n8nOk: boolean
    errorMessage?: string
  },
): Promise<void> {
  await db.collection('financeReports').add({
    kind: entry.kind,
    periodLabel: entry.periodLabel,
    sentAt: Timestamp.now(),
    triggeredBy: 'system_schedule',
    triggeredByName: 'Cron Apps Script parity',
    payloadPreview: entry.preview,
    n8nOk: entry.n8nOk,
    errorMessage: entry.errorMessage ?? null,
    updatedAt: FieldValue.serverTimestamp(),
  })
}
