import { useEffect, useMemo, useState } from 'react'
import { Loader2, RefreshCw, Search } from 'lucide-react'
import type { Lead } from '../types'
import { useAuth } from '../hooks/useAuth'
import { useAccountantLeads } from '../hooks/useAccountantLeads'
import { useScholarships } from '../hooks/useScholarships'
import { useCounselorDirectory } from '../hooks/useCounselorDirectory'
import {
  leadHasFinanceActivity,
  leadBelongsInAccountantWorkQueue,
  compareAccountantWorkQueueOrder,
  countEnrollmentStatusStats,
} from '../utils/accountantFinanceFilter'
import { buildStudentCodeSequenceIndex } from '../utils/studentDisplayCode'
import { buildAccountantLeadSummary, type AccountantStatusTag } from '../utils/accountantLeadDisplay'
import { formatStaffDisplayName } from '../utils/counselorDisplay'
import { AccountantLeadReviewCard } from '../components/accountant/AccountantLeadReviewCard'
import { canAccessAccountantPortal } from '../auth/accountantPortal'

type QueueFilter = 'pending' | 'done' | 'all'

/** Nhãn Sheet trên bộ lọc nhanh — map sang tag thẻ kế toán. */
const QUICK_STATUS_FILTERS: { sheetLabel: string; tag: AccountantStatusTag }[] = [
  { sheetLabel: 'ĐANG HOÀN THIỆN', tag: 'Đang hoàn thiện' },
  { sheetLabel: 'CỌC THÀNH CÔNG', tag: 'Cọc' },
  { sheetLabel: 'KIỂM TRA LẠI', tag: 'Kiểm tra lại' },
]

const STATUS_FILTER_OPTIONS: { sheetLabel: string; tag: AccountantStatusTag }[] = [
  ...QUICK_STATUS_FILTERS,
  { sheetLabel: 'MỚI', tag: 'Mới' },
  { sheetLabel: 'ĐÃ HOÀN THIỆN', tag: 'Hoàn thiện phí' },
  { sheetLabel: 'Ghi danh', tag: 'Ghi danh' },
  { sheetLabel: 'Chờ Full NE', tag: 'Chờ Full NE' },
  { sheetLabel: 'Full NE', tag: 'Full NE' },
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
  const canPortal = canAccessAccountantPortal(can, profile)
  const canWriteAccountant = can('finance:accountant')
  const { leads, loading, error, reload } = useAccountantLeads(canPortal)
  const { items: scholarships } = useScholarships()
  const { users: directoryUsers } = useCounselorDirectory()
  const [rows, setRows] = useState<Lead[]>([])
  const [search, setSearch] = useState('')
  const [filterTag, setFilterTag] = useState<AccountantStatusTag | ''>('')
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('pending')

  useEffect(() => {
    setRows(leads)
  }, [leads])

  const financeRows = useMemo(() => rows.filter(leadHasFinanceActivity), [rows])

  const scholarshipById = useMemo(() => new Map(scholarships.map((s) => [s.id, s])), [scholarships])

  const codeSequenceIndex = useMemo(() => buildStudentCodeSequenceIndex(financeRows), [financeRows])

  const directoryNames = useMemo(() => {
    const m = new Map<string, string>()
    for (const u of directoryUsers) {
      m.set(u.id, formatStaffDisplayName(u))
    }
    return m
  }, [directoryUsers])

  const summaries = useMemo(
    () =>
      financeRows.map((lead) =>
        buildAccountantLeadSummary(lead, {
          scholarshipById,
          codeSequenceIndex,
          directoryNames,
          directoryUsers,
        }),
      ),
    [financeRows, scholarshipById, codeSequenceIndex, directoryNames, directoryUsers],
  )

  const summaryByLeadId = useMemo(() => new Map(summaries.map((s) => [s.leadId, s])), [summaries])

  const stats = useMemo(() => {
    let pending = 0
    let done = 0
    for (const l of financeRows) {
      if (leadBelongsInAccountantWorkQueue(l)) pending++
      else done++
    }
    return { pending, done, total: financeRows.length, enrollment: countEnrollmentStatusStats(financeRows) }
  }, [financeRows])

  const applyStatusFilter = (tag: AccountantStatusTag | '') => {
    setFilterTag(tag)
    // CỌC / KIỂM TRA LẠI nằm ngoài «Cần duyệt» — mở «Tất cả» để thấy ngay.
    if (tag) setQueueFilter('all')
  }

  const filtered = useMemo(() => {
    const q = normalizeSearch(search)
    return financeRows
      .filter((lead) => {
        // Khi chọn trạng thái Sheet → hiện toàn bộ khớp tag (kể cả CỌC ngoài Cần duyệt).
        if (filterTag) {
          const summary = summaryByLeadId.get(lead.id)
          if (!summary || summary.statusTag !== filterTag) return false
        } else {
          if (queueFilter === 'pending' && !leadBelongsInAccountantWorkQueue(lead)) return false
          if (queueFilter === 'done' && leadBelongsInAccountantWorkQueue(lead)) return false
        }
        if (!q) return true
        const summary = summaryByLeadId.get(lead.id)
        const hay = [
          lead.fullName,
          lead.systemCode,
          lead.customerId,
          summary?.studentCode,
          lead.id,
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
      .sort(compareAccountantWorkQueueOrder)
  }, [financeRows, search, filterTag, queueFilter, summaryByLeadId])

  const patchLead = (next: Lead) => {
    setRows((prev) => prev.map((l) => (l.id === next.id ? next : l)))
  }

  if (!canPortal && !portalMode) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-950">
        Bạn chưa có quyền cổng kế toán. Liên hệ quản trị để được cấp quyền «Cổng kế toán».
      </div>
    )
  }

  const enrollmentChipActive = (tag: AccountantStatusTag) => filterTag === tag

  const summaryBlock = (
    <div className="flex flex-wrap items-stretch gap-1.5 rounded-xl border border-slate-200 bg-white p-2 shadow-sm text-sm">
      <button
        type="button"
        onClick={() => {
          setFilterTag('')
          setQueueFilter('pending')
        }}
        className={[
          'min-w-[4.5rem] flex-1 rounded-lg border px-2 py-1.5 text-center',
          !filterTag && queueFilter === 'pending'
            ? 'border-amber-400 bg-amber-100 text-amber-900 ring-1 ring-amber-300'
            : 'border-amber-200 bg-amber-50 text-amber-800',
        ].join(' ')}
      >
        <p className="font-semibold opacity-80">Cần duyệt</p>
        <p className="font-semibold tabular-nums leading-tight">{stats.pending}</p>
      </button>
      {(
        [
          {
            sheetLabel: 'ĐANG HOÀN THIỆN',
            tag: 'Đang hoàn thiện' as const,
            count: stats.enrollment.dang,
            idle: 'text-sky-700 bg-white border-slate-200',
            active: 'border-sky-400 bg-sky-100 text-sky-900 ring-1 ring-sky-300',
          },
          {
            sheetLabel: 'CỌC THÀNH CÔNG',
            tag: 'Cọc' as const,
            count: stats.enrollment.coc,
            idle: 'text-emerald-700 bg-white border-slate-200',
            active: 'border-emerald-400 bg-emerald-100 text-emerald-900 ring-1 ring-emerald-300',
          },
          {
            sheetLabel: 'KIỂM TRA LẠI',
            tag: 'Kiểm tra lại' as const,
            count: stats.enrollment.kiemTra,
            idle: 'text-rose-700 bg-white border-slate-200',
            active: 'border-rose-400 bg-rose-100 text-rose-950 ring-1 ring-rose-300',
          },
        ] as const
      ).map((chip) => (
        <button
          key={chip.sheetLabel}
          type="button"
          onClick={() =>
            applyStatusFilter(enrollmentChipActive(chip.tag) ? '' : chip.tag)
          }
          title={`Lọc ${chip.sheetLabel}`}
          className={[
            'min-w-[4.5rem] flex-1 rounded-lg border px-2 py-1.5 text-center',
            enrollmentChipActive(chip.tag) ? chip.active : chip.idle,
          ].join(' ')}
        >
          <p className="font-semibold opacity-80 leading-tight">{chip.sheetLabel}</p>
          <p className="font-semibold tabular-nums leading-tight">{chip.count}</p>
        </button>
      ))}
      <button
        type="button"
        onClick={() => {
          setFilterTag('')
          setQueueFilter('done')
        }}
        className={[
          'min-w-[4.5rem] flex-1 rounded-lg border px-2 py-1.5 text-center',
          !filterTag && queueFilter === 'done'
            ? 'border-slate-400 bg-slate-200 text-slate-800 ring-1 ring-slate-300'
            : 'border-slate-200 bg-slate-50 text-slate-600',
        ].join(' ')}
      >
        <p className="font-semibold opacity-80">Đã xong</p>
        <p className="font-semibold tabular-nums leading-tight">{stats.done}</p>
      </button>
      <button
        type="button"
        onClick={() => void reload()}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 self-center rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-sm font-semibold text-emerald-900 active:bg-emerald-100"
      >
        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        Tải lại
      </button>
    </div>
  )

  return (
    <div
      className={
        portalMode
          ? 'space-y-2.5 text-sm text-slate-800'
          : 'mx-auto max-w-3xl space-y-2.5 pb-4 text-sm text-slate-800 sm:max-w-5xl sm:space-y-3'
      }
    >
      {!portalMode ? (
        <header className="rounded-2xl border border-emerald-200/80 bg-white px-3 py-3 shadow-sm sm:px-4">
          <h1 className="text-sm font-semibold text-emerald-800">Hàng đợi duyệt</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Cần duyệt = tiền mới về + ĐANG HOÀN THIỆN. Bấm ô trạng thái để xem CỌC / KIỂM TRA LẠI.
          </p>
          <div className="mt-2">{summaryBlock}</div>
        </header>
      ) : (
        summaryBlock
      )}

      <div className="sticky top-[calc(env(safe-area-inset-top)+2.75rem)] z-20 rounded-xl border border-slate-200/90 bg-white/95 p-2 shadow-md backdrop-blur sm:static sm:shadow-sm">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,auto)_minmax(0,1fr)] sm:items-stretch sm:gap-3">
          <div
            className="inline-flex h-fit self-start rounded-lg bg-slate-100 p-0.5"
            role="tablist"
            aria-label="Hàng đợi"
          >
            {(
              [
                ['pending', 'Cần duyệt', stats.pending],
                ['done', 'Đã xong', stats.done],
                ['all', 'Tất cả', stats.total],
              ] as const
            ).map(([id, label, count]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={!filterTag && queueFilter === id}
                onClick={() => {
                  setFilterTag('')
                  setQueueFilter(id)
                }}
                className={[
                  'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-semibold',
                  !filterTag && queueFilter === id
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-white',
                ].join(' ')}
              >
                <span>{label}</span>
                <span
                  className={[
                    'rounded px-1.5 py-px font-semibold tabular-nums',
                    !filterTag && queueFilter === id ? 'bg-white/20' : 'bg-white text-slate-500',
                  ].join(' ')}
                >
                  {count}
                </span>
              </button>
            ))}
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <label className="relative block min-w-0">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                inputMode="search"
                className="h-8 w-full rounded-lg border border-slate-200 bg-white py-1 pl-9 pr-2.5 text-sm"
                placeholder="Tìm tên, mã SV, CCCD, TVV…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                enterKeyHint="search"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
              />
            </label>
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              {QUICK_STATUS_FILTERS.map(({ sheetLabel, tag }) => (
                <button
                  key={sheetLabel}
                  type="button"
                  onClick={() => applyStatusFilter(filterTag === tag ? '' : tag)}
                  className={[
                    'h-8 rounded-lg border px-2 text-xs font-semibold sm:text-sm',
                    filterTag === tag
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-900'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                  ].join(' ')}
                >
                  {sheetLabel}
                </button>
              ))}
              <select
                className="h-8 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold"
                value={filterTag}
                onChange={(e) => {
                  const v = e.target.value as AccountantStatusTag | ''
                  if (!v) {
                    setFilterTag('')
                    return
                  }
                  applyStatusFilter(v)
                }}
              >
                <option value="">Trạng thái: tất cả</option>
                {STATUS_FILTER_OPTIONS.map(({ sheetLabel, tag }) => (
                  <option key={tag} value={tag}>
                    {sheetLabel}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      {loading ? (
        <p className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" /> Đang tải hồ sơ…
        </p>
      ) : null}

      <p className="text-sm text-slate-500">
        Đang hiện <strong className="font-semibold text-slate-800">{filtered.length}</strong> hồ sơ
        {filterTag
          ? ` · lọc ${STATUS_FILTER_OPTIONS.find((o) => o.tag === filterTag)?.sheetLabel ?? filterTag}`
          : queueFilter === 'pending'
            ? ' · Cần duyệt'
            : queueFilter === 'done'
              ? ' · Đã xong'
              : ''}
      </p>

      <div className="space-y-1.5">
        {filtered.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white px-3 py-6 text-center text-sm text-slate-500">
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
