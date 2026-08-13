import type { Firestore } from 'firebase/firestore'
import { addDoc, collection, getDocs, limit, orderBy, query, Timestamp } from 'firebase/firestore'
import type { FinanceReportKind, FinanceReportLog, Lead } from '../types'
import { FS_COLLECTIONS } from '../types'
import { buildDailyFinanceReportPayload, buildMonthlyFinanceReportPayload } from './financeReports'
import { triggerDailyReportN8n, triggerMonthlyReportN8n } from './n8nIntegration'
import { DEFAULT_ORG_ID } from '../tenancy/orgConstants'

export async function fetchRecentFinanceReports(db: Firestore, max = 30): Promise<FinanceReportLog[]> {
  const q = query(collection(db, FS_COLLECTIONS.financeReports), orderBy('sentAt', 'desc'), limit(max))
  const snap = await getDocs(q)
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      kind: data.kind as FinanceReportKind,
      periodLabel: String(data.periodLabel ?? ''),
      sentAt: data.sentAt as FinanceReportLog['sentAt'],
      triggeredBy: data.triggeredBy as string | undefined,
      triggeredByName: data.triggeredByName as string | undefined,
      payloadPreview: data.payloadPreview as string | undefined,
      n8nOk: data.n8nOk === true,
      errorMessage: data.errorMessage as string | undefined,
    }
  })
}

export async function sendFinanceReportFromLeads(opts: {
  db: Firestore
  leads: Lead[]
  kind: FinanceReportKind
  triggeredBy?: string
  triggeredByName?: string
  orgId?: string
}): Promise<FinanceReportLog> {
  const { db, leads, kind, triggeredBy, triggeredByName } = opts
  const orgId =
    String(opts.orgId ?? '').trim() ||
    String(leads.find((l) => l.orgId)?.orgId ?? '').trim() ||
    DEFAULT_ORG_ID
  const at = new Date()
  let payload: Record<string, unknown>
  let periodLabel: string
  let preview: string

  if (kind === 'daily') {
    const built = buildDailyFinanceReportPayload(leads, at)
    payload = {
      event: 'daily_finance_report',
      orgId,
      date: built.date,
      dailyDetailHtml: built.dailyDetailHtml,
      message_vi: built.message_vi,
      chat_text: built.chat_text,
      notification_title: built.notification_title,
      tongTien: built.tongTien,
      tongHocSinhNop: built.tongHocSinhNop,
    }
    periodLabel = built.date
    preview = `Ngày ${built.date} — ${built.tongHocSinhNop} HS, ${built.tongTien.toLocaleString('vi-VN')}đ`
    await triggerDailyReportN8n(payload)
  } else {
    const built = buildMonthlyFinanceReportPayload(leads, at)
    payload = { ...built, orgId }
    periodLabel = built.month
    preview = `Tháng ${built.month} — NE: ${built.neMonth}, LPXT: ${built.lpxtMonth}`
    await triggerMonthlyReportN8n(payload)
  }

  const ref = await addDoc(collection(db, FS_COLLECTIONS.financeReports), {
    kind,
    periodLabel,
    sentAt: Timestamp.now(),
    triggeredBy: triggeredBy ?? null,
    triggeredByName: triggeredByName ?? null,
    payloadPreview: preview,
    n8nOk: true,
    errorMessage: null,
  })

  return {
    id: ref.id,
    kind,
    periodLabel,
    sentAt: Timestamp.now(),
    triggeredBy,
    triggeredByName,
    payloadPreview: preview,
    n8nOk: true,
  }
}
