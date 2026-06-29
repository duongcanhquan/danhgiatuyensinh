import { useEffect, useMemo, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import type { Lead } from '../types'
import { useAuth } from '../hooks/useAuth'
import { useAccountantLeads } from '../hooks/useAccountantLeads'
import { useScholarships } from '../hooks/useScholarships'
import { getFirestoreDb } from '../services/firebase'
import { fetchRecentFinanceReports, sendFinanceReportFromLeads } from '../utils/persistFinanceReport'
import {
  leadHasFinanceActivity,
  leadHasPendingAccountantReview,
} from '../utils/accountantFinanceFilter'
import { buildStudentCodeSequenceIndex } from '../utils/studentDisplayCode'
import { buildAccountantLeadSummary, type AccountantStatusTag } from '../utils/accountantLeadDisplay'
import { AccountantLeadReviewCard } from '../components/accountant/AccountantLeadReviewCard'

type QueueFilter = 'pending' | 'done' | 'all'

const STATUS_FILTER_OPTIONS: AccountantStatusTag[] = [
  'Mới',
  'Cọc',
  'Ghi danh',
  'Hoàn thiện phí',
  'Kiểm tra lại',
  'Full NE',
]

function normalizeSearch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
}

export function AccountantView({ portalMode = false }: { portalMode?: boolean }) {
  const { can, profile } = useAuth()
  const accountantName = profile?.displayName?.trim() || profile?.email?.trim() || undefined
  const canAccountant = can('finance:accountant')
  const canReports = can('finance:reports')
  const { leads, loading, error, reload } = useAccountantLeads(canAccountant)
  const { items: scholarships } = useScholarships()
  const [rows, setRows] = useState<Lead[]>([])
  const [search, setSearch] = useState('')
  const [filterTag, setFilterTag] = useState<AccountantStatusTag | ''>('')
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('pending')
  const [reportBusy, setReportBusy] = useState<'daily' | 'monthly' | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    setRows(leads)
  }, [leads])

  const financeRows = useMemo(() => rows.filter(leadHasFinanceActivity), [rows])

  const scholarshipById = useMemo(() => new Map(scholarships.map((s) => [s.id, s])), [scholarships])

  const codeSequenceIndex = useMemo(() => buildStudentCodeSequenceIndex(financeRows), [financeRows])

  const summaries = useMemo(
    () =>
      financeRows.map((lead) =>
        buildAccountantLeadSummary(lead, {
          scholarshipById,
          codeSequenceIndex,
        }),
      ),
    [financeRows, scholarshipById, codeSequenceIndex],
  )

  const summaryByLeadId = useMemo(() => new Map(summaries.map((s) => [s.leadId, s])), [summaries])

  const stats = useMemo(() => {
    let pending = 0
    let done = 0
    for (const l of financeRows) {
      if (leadHasPendingAccountantReview(l)) pending++
      else done++
    }
    return { pending, done, total: financeRows.length }
  }, [financeRows])

  const filtered = useMemo(() => {
    const q = normalizeSearch(search)
    return financeRows
      .filter((lead) => {
        if (queueFilter === 'pending' && !leadHasPendingAccountantReview(lead)) return false
        if (queueFilter === 'done' && leadHasPendingAccountantReview(lead)) return false
        const summary = summaryByLeadId.get(lead.id)
        if (filterTag && summary && summary.statusTag !== filterTag) return false
        if (!q) return true
        const hay = [
          lead.fullName,
          lead.customerId,
          summary?.studentCode,
          lead.id,
          lead.phone,
          lead.nationalId,
          lead.majorInterest,
        ].map((x) => normalizeSearch(String(x ?? '')))
        return hay.some((h) => h.includes(q))
      })
      .sort((a, b) => {
        const pa = leadHasPendingAccountantReview(a) ? 1 : 0
        const pb = leadHasPendingAccountantReview(b) ? 1 : 0
        return pb - pa
      })
  }, [financeRows, search, filterTag, queueFilter, summaryByLeadId])

  const patchLead = (next: Lead) => {
    setRows((prev) => prev.map((l) => (l.id === next.id ? next : l)))
  }

  const sendReport = async (kind: 'daily' | 'monthly') => {
    const db = getFirestoreDb()
    if (!db || !profile) return
    setReportBusy(kind)
    setMsg(null)
    try {
      await sendFinanceReportFromLeads({
        db,
        leads: financeRows,
        kind,
        triggeredBy: profile.id,
        triggeredByName: profile.displayName ?? profile.email,
      })
      setMsg(kind === 'daily' ? 'Đã gửi báo cáo ngày qua n8n.' : 'Đã gửi báo cáo tháng qua n8n.')
      await fetchRecentFinanceReports(db)
    } catch (e) {
      console.error(e)
      setMsg(e instanceof Error ? e.message : 'Gửi báo cáo thất bại.')
    } finally {
      setReportBusy(null)
    }
  }

  if (!canAccountant && !portalMode) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-950">
        Bạn chưa có quyền cổng kế toán. Liên hệ quản trị để được cấp quyền «Cổng kế toán».
      </div>
    )
  }

  return (
    <div className={portalMode ? 'space-y-4' : 'mx-auto max-w-5xl space-y-4 px-1 pb-10 md:px-0'}>
      {!portalMode ? (
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200/80 bg-white px-4 py-4 shadow-md">
          <div>
            <h1 className="text-xl font-extrabold text-emerald-800 md:text-2xl">Cổng kế toán</h1>
            <p className="text-sm text-slate-600">
              Hồ sơ có phát sinh thu — mã SV dạng DDMMYY + 4 số/ngày. Duyệt từng đợt, xem bill, học bổng.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void reload()}
            className="inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-900"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Tải lại
          </button>
        </header>
      ) : (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void reload()}
            className="inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-900"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Tải lại
          </button>
        </div>
      )}

      {!portalMode && canReports ? (
        <section className="rounded-2xl border border-sky-200/80 bg-sky-50/50 px-4 py-4">
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-sky-900">Báo cáo thu (n8n)</h2>
          <div className="mt-3 flex flex-wrap gap-2">
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
          {msg ? <p className="mt-2 text-sm font-medium text-emerald-800">{msg}</p> : null}
        </section>
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Chờ duyệt', value: stats.pending, cls: 'text-amber-700' },
          { label: 'Đã xử lý', value: stats.done, cls: 'text-emerald-700' },
          { label: 'Có phát sinh thu', value: stats.total, cls: 'text-sky-700' },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm">
            <p className="text-xs font-bold uppercase text-slate-500">{s.label}</p>
            <p className={`text-2xl font-black tabular-nums ${s.cls}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 p-1">
          {(
            [
              ['pending', 'Chờ duyệt'],
              ['done', 'Đã xử lý'],
              ['all', 'Tất cả có thu'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setQueueFilter(id)}
              className={[
                'rounded-md px-3 py-1.5 text-xs font-bold',
                queueFilter === id ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-50',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          className="min-w-[12rem] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
          placeholder="Tìm tên, mã SV, ngành, SĐT…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold"
          value={filterTag}
          onChange={(e) => setFilterTag(e.target.value as AccountantStatusTag | '')}
        >
          <option value="">Trạng thái: tất cả</option>
          {STATUS_FILTER_OPTIONS.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
      </div>

      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      {loading ? (
        <p className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" /> Đang tải hồ sơ…
        </p>
      ) : null}

      <div className="space-y-4">
        {filtered.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-slate-500">
            {financeRows.length === 0
              ? 'Chưa có hồ sơ phát sinh thu — TVV cần ghi tiền / bill trên hồ sơ.'
              : 'Không có hồ sơ phù hợp bộ lọc.'}
          </p>
        ) : (
          filtered.map((lead) => {
            const summary = summaryByLeadId.get(lead.id)
            if (!summary) return null
            return (
              <AccountantLeadReviewCard
                key={lead.id}
                summary={summary}
                lead={lead}
                disabled={loading}
                accountantName={accountantName}
                onDone={patchLead}
              />
            )
          })
        )}
      </div>
    </div>
  )
}
