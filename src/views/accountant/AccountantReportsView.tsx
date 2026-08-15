import { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useOrg } from '../../contexts/OrgProvider'
import { useAccountantLeads } from '../../hooks/useAccountantLeads'
import { getFirestoreDb } from '../../services/firebase'
import { fetchRecentFinanceReports, sendFinanceReportFromLeads } from '../../utils/persistFinanceReport'
import type { FinanceReportLog } from '../../types'
import { canAccessAccountantPortal } from '../../auth/accountantPortal'

export function AccountantReportsView() {
  const { can, profile } = useAuth()
  const { effectiveOrgId } = useOrg()
  const canReports = can('finance:reports')
  const canPortal = canAccessAccountantPortal(can, profile)
  const { leads, loading } = useAccountantLeads(canPortal && canReports)
  const [reportLogs, setReportLogs] = useState<FinanceReportLog[]>([])
  const [reportBusy, setReportBusy] = useState<'daily' | 'monthly' | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    const db = getFirestoreDb()
    if (!db || !canReports) return
    void fetchRecentFinanceReports(db).then(setReportLogs).catch(console.error)
  }, [canReports, reportBusy])

  if (!canReports) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-950">
        Bạn không có quyền gửi báo cáo thu.
      </div>
    )
  }

  const sendReport = async (kind: 'daily' | 'monthly') => {
    const db = getFirestoreDb()
    if (!db || !profile) return
    setReportBusy(kind)
    setMsg(null)
    try {
      await sendFinanceReportFromLeads({
        db,
        leads,
        kind,
        triggeredBy: profile.id,
        triggeredByName: profile.displayName ?? profile.email,
        orgId: effectiveOrgId,
      })
      setMsg(kind === 'daily' ? 'Đã gửi báo cáo ngày qua n8n.' : 'Đã gửi báo cáo tháng qua n8n.')
      const logs = await fetchRecentFinanceReports(db)
      setReportLogs(logs)
    } catch (e) {
      console.error(e)
      setMsg(e instanceof Error ? e.message : 'Gửi báo cáo thất bại.')
    } finally {
      setReportBusy(null)
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 sm:max-w-2xl">
      <header>
        <h2 className="text-xl font-extrabold text-emerald-900">Báo cáo thu</h2>
        <p className="mt-1 text-sm text-slate-600">
          Gửi sang Chat qua webhook đã cấu hình (Cài đặt → Webhook n8n).
        </p>
      </header>
      <section className="rounded-2xl border border-sky-200/80 bg-sky-50/50 px-3 py-4 sm:px-4">
        <div className="grid gap-2">
          <button
            type="button"
            disabled={reportBusy !== null || loading}
            onClick={() => void sendReport('daily')}
            className="min-h-14 rounded-2xl bg-sky-700 px-4 text-base font-extrabold text-white shadow-sm active:bg-sky-800 disabled:opacity-40"
          >
            {reportBusy === 'daily' ? 'Đang gửi…' : 'Gửi báo cáo ngày'}
          </button>
          <button
            type="button"
            disabled={reportBusy !== null || loading}
            onClick={() => void sendReport('monthly')}
            className="min-h-14 rounded-2xl border-2 border-sky-600 bg-white px-4 text-base font-extrabold text-sky-900 active:bg-sky-50 disabled:opacity-40"
          >
            {reportBusy === 'monthly' ? 'Đang gửi…' : 'Gửi báo cáo tháng'}
          </button>
        </div>
        {msg ? <p className="mt-3 text-sm font-medium text-emerald-800">{msg}</p> : null}
        {reportLogs.length > 0 ? (
          <ul className="mt-4 max-h-72 space-y-1.5 overflow-y-auto text-xs text-slate-700">
            {reportLogs.map((log) => (
              <li key={log.id} className="rounded-xl border border-slate-200/80 bg-white px-3 py-2">
                <span className="font-bold">{log.kind === 'daily' ? 'Ngày' : 'Tháng'}</span> {log.periodLabel} —{' '}
                {log.payloadPreview ?? '—'}{' '}
                <span className={log.n8nOk ? 'text-emerald-700' : 'text-rose-700'}>{log.n8nOk ? 'OK' : 'Lỗi'}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  )
}
