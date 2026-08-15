import { useEffect, useMemo, useState } from 'react'
import { Loader2, RefreshCw, Search } from 'lucide-react'
import type { Lead } from '../types'
import { useAuth } from '../hooks/useAuth'
import { useAccountantLeads } from '../hooks/useAccountantLeads'
import { useScholarships } from '../hooks/useScholarships'
import { getFirestoreDb } from '../services/firebase'
import { fetchRecentFinanceReports, sendFinanceReportFromLeads } from '../utils/persistFinanceReport'
import {
  leadHasFinanceActivity,
  leadHasPendingAccountantReview,
  leadPassesShowDoneFilter,
  countEnrollmentStatusStats,
} from '../utils/accountantFinanceFilter'
import { useOrg } from '../contexts/OrgProvider'
import { buildStudentCodeSequenceIndex } from '../utils/studentDisplayCode'
import { buildAccountantLeadSummary, type AccountantStatusTag } from '../utils/accountantLeadDisplay'
import { AccountantLeadReviewCard } from '../components/accountant/AccountantLeadReviewCard'
import { canAccessAccountantPortal } from '../auth/accountantPortal'

type QueueFilter = 'pending' | 'done' | 'all'

const STATUS_FILTER_OPTIONS: AccountantStatusTag[] = [
  'Mới',
  'Đang hoàn thiện',
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
  const { effectiveOrgId } = useOrg()
  const accountantName = profile?.displayName?.trim() || profile?.email?.trim() || undefined
  const canPortal = canAccessAccountantPortal(can, profile)
  const canWriteAccountant = can('finance:accountant')
  const canReports = can('finance:reports')
  const { leads, loading, error, reload } = useAccountantLeads(canPortal)
  const { items: scholarships } = useScholarships()
  const [rows, setRows] = useState<Lead[]>([])
  const [search, setSearch] = useState('')
  const [filterTag, setFilterTag] = useState<AccountantStatusTag | ''>('')
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('pending')
  const [showDone, setShowDone] = useState(false)
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
    return { pending, done, total: financeRows.length, enrollment: countEnrollmentStatusStats(financeRows) }
  }, [financeRows])

  const filtered = useMemo(() => {
    const q = normalizeSearch(search)
    const statusFilterActive = Boolean(filterTag)
    return financeRows
      .filter((lead) => {
        if (queueFilter === 'pending' && !leadHasPendingAccountantReview(lead)) return false
        if (queueFilter === 'done' && leadHasPendingAccountantReview(lead)) return false
        if (!leadPassesShowDoneFilter(lead, showDone, statusFilterActive)) return false
        const summary = summaryByLeadId.get(lead.id)
        if (filterTag && summary && summary.statusTag !== filterTag) return false
        if (!q) return true
        const hay = [
          lead.fullName,
          lead.customerId,
          summary?.studentCode,
          lead.id,
          lead.phone,
          lead.motherPhone,
          lead.fatherPhone,
          lead.nationalId,
          lead.studentEmail,
          lead.majorInterest,
          lead.uploaderName,
          lead.assignedTo,
          summary?.counselorName,
          ...(summary?.scholarships ?? []),
        ].map((x) => normalizeSearch(String(x ?? '')))
        return hay.some((h) => h.includes(q))
      })
      .sort((a, b) => {
        const pa = leadHasPendingAccountantReview(a) ? 1 : 0
        const pb = leadHasPendingAccountantReview(b) ? 1 : 0
        if (pb !== pa) return pb - pa
        const aMs = a.createdAt?.toMillis?.() ?? a.uploadedAt?.toMillis?.() ?? 0
        const bMs = b.createdAt?.toMillis?.() ?? b.uploadedAt?.toMillis?.() ?? 0
        return bMs - aMs
      })
  }, [financeRows, search, filterTag, queueFilter, showDone, summaryByLeadId])

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
        orgId: effectiveOrgId,
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

  if (!canPortal && !portalMode) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-950">
        Bạn chưa có quyền cổng kế toán. Liên hệ quản trị để được cấp quyền «Cổng kế toán».
      </div>
    )
  }

  return (
    <div className={portalMode ? 'space-y-3' : 'mx-auto max-w-3xl space-y-3 pb-4 sm:max-w-5xl sm:space-y-4'}>
      {!portalMode ? (
        <header className="flex items-center justify-between gap-2 rounded-2xl border border-emerald-200/80 bg-white px-3 py-3 shadow-sm sm:px-4 sm:py-4">
          <div className="min-w-0">
            <h1 className="text-lg font-extrabold text-emerald-800 sm:text-2xl">Hàng đợi duyệt</h1>
            <p className="mt-0.5 text-xs text-slate-600 sm:text-sm">
              <strong className="text-amber-800">{stats.pending}</strong> chờ · {stats.done} đã xử lý · {stats.total}{' '}
              có thu
            </p>
          </div>
          <button
            type="button"
            onClick={() => void reload()}
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-900 active:bg-emerald-100"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Tải lại
          </button>
        </header>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-slate-600">
            <strong className="text-amber-800">{stats.pending}</strong> chờ duyệt
          </p>
          <button
            type="button"
            onClick={() => void reload()}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-900"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Tải lại
          </button>
        </div>
      )}

      {!portalMode && canReports ? (
        <section className="hidden rounded-2xl border border-sky-200/80 bg-sky-50/50 px-4 py-3 sm:block">
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-sky-900">Báo cáo thu</h2>
          <p className="mt-1 text-xs text-slate-600">Trên điện thoại dùng tab Báo cáo phía dưới.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={reportBusy !== null || loading}
              onClick={() => void sendReport('daily')}
              className="min-h-10 rounded-xl bg-sky-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              {reportBusy === 'daily' ? 'Đang gửi…' : 'Gửi báo cáo ngày'}
            </button>
            <button
              type="button"
              disabled={reportBusy !== null || loading}
              onClick={() => void sendReport('monthly')}
              className="min-h-10 rounded-xl border border-sky-600 bg-white px-4 py-2 text-sm font-bold text-sky-800 disabled:opacity-40"
            >
              {reportBusy === 'monthly' ? 'Đang gửi…' : 'Gửi báo cáo tháng'}
            </button>
          </div>
          {msg ? <p className="mt-2 text-sm font-medium text-emerald-800">{msg}</p> : null}
        </section>
      ) : null}

      {/* Stats — cuộn ngang trên mobile */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:grid sm:grid-cols-5 sm:overflow-visible sm:px-0">
        {(
          [
            ['Mới', stats.enrollment.moi, 'text-slate-700'],
            ['Đang HT', stats.enrollment.dang, 'text-sky-700'],
            ['Cọc', stats.enrollment.coc, 'text-emerald-700'],
            ['Hoàn thiện', stats.enrollment.hoanThien, 'text-violet-700'],
            ['Kiểm tra lại', stats.enrollment.kiemTra, 'text-rose-700'],
          ] as const
        ).map(([label, value, cls]) => (
          <div
            key={label}
            className="min-w-[4.75rem] shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-center shadow-sm sm:min-w-0"
          >
            <p className="text-[10px] font-bold uppercase text-slate-500">{label}</p>
            <p className={`text-xl font-black tabular-nums ${cls}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Sticky filters */}
      <div className="sticky top-[calc(env(safe-area-inset-top)+4.75rem)] z-20 space-y-2 rounded-2xl border border-slate-200/90 bg-white/95 p-2.5 shadow-md backdrop-blur sm:top-auto sm:static sm:p-3 sm:shadow-sm">
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
          {(
            [
              ['pending', 'Chờ duyệt', stats.pending],
              ['done', 'Đã xử lý', stats.done],
              ['all', 'Tất cả', stats.total],
            ] as const
          ).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              onClick={() => setQueueFilter(id)}
              className={[
                'min-h-11 rounded-lg px-1 text-center text-[11px] font-extrabold leading-tight sm:text-xs',
                queueFilter === id ? 'bg-indigo-600 text-white shadow' : 'text-slate-600 active:bg-white',
              ].join(' ')}
            >
              <span className="block">{label}</span>
              <span className="tabular-nums opacity-90">{count}</span>
            </button>
          ))}
        </div>

        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="min-h-11 w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-base"
            placeholder="Tìm tên, mã SV, SĐT, CCCD…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            enterKeyHint="search"
            autoComplete="off"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <select
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold"
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
          <label className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={showDone}
              onChange={(e) => setShowDone(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Hiện CỌC
          </label>
        </div>
      </div>

      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      {loading ? (
        <p className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" /> Đang tải hồ sơ…
        </p>
      ) : null}

      <p className="text-xs font-medium text-slate-500">
        Đang hiện <strong className="text-slate-800">{filtered.length}</strong> hồ sơ
      </p>

      <div className="space-y-3 sm:space-y-4">
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
                disabled={loading || !canWriteAccountant}
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
