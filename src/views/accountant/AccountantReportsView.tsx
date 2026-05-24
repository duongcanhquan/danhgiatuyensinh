import { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useAccountantLeads } from '../../hooks/useAccountantLeads'
import { getFirestoreDb } from '../../services/firebase'
import { fetchRecentFinanceReports, sendFinanceReportFromLeads } from '../../utils/persistFinanceReport'
import type { FinanceReportLog } from '../../types'

export function AccountantReportsView() {
  const { can, profile } = useAuth()
  const canReports = can('finance:reports')
  const { leads, loading } = useAccountantLeads(can('finance:accountant'))
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
    <div className="space-y-4">
      <header>
        <h2 className="text-xl font-extrabold text-emerald-900">Báo cáo thu → n8n</h2>
        <p className="mt-1 text-sm text-slate-600">
          Webhook <code className="rounded bg-slate-100 px-1 text-xs">baocao-ngay</code> /{' '}
          <code className="rounded bg-slate-100 px-1 text-xs">baocao-thang</code> — cấu hình qua{' '}
          <code className="rounded bg-slate-100 px-1 text-xs">VITE_N8N_WEBHOOK_*</code> trên Vercel.
        </p>
      </header>
      <section className="rounded-2xl border border-sky-200/80 bg-sky-50/50 px-4 py-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={reportBusy !== null || loading}
            onClick={() => void sendReport('daily')}
            className="rounded-xl bg-sky-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            {reportBusy === 'daily' ? 'Đang gửi…' : 'Gửi báo cáo ngày'}
          </button>
          <button
            type="button"
            disabled={reportBusy !== null || loading}
            onClick={() => void sendReport('monthly')}
            className="rounded-xl border border-sky-600 bg-white px-4 py-2 text-sm font-bold text-sky-800 disabled:opacity-40"
          >
            {reportBusy === 'monthly' ? 'Đang gửi…' : 'Gửi báo cáo tháng'}
          </button>
        </div>
        {msg ? <p className="mt-3 text-sm font-medium text-emerald-800">{msg}</p> : null}
        {reportLogs.length > 0 ? (
          <ul className="mt-4 max-h-64 space-y-1 overflow-y-auto text-xs text-slate-700">
            {reportLogs.map((log) => (
              <li key={log.id} className="rounded border border-slate-200/80 bg-white px-2 py-1">
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
