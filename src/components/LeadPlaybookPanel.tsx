import { useMemo, useState } from 'react'
import type { Lead } from '../types'
import {
  describePlaybookMatch,
  PLAYBOOK_MATCH_KIND_LABEL,
  playbooksMatchingLead,
  type PlaybookMatchKind,
  type PlaybookMatchResult,
} from '../utils/playbookMatch'
import type { ConsultingPlaybook } from '../types'

type KindFilter = 'show_all' | PlaybookMatchKind

function PlaybookCard({ result }: { result: PlaybookMatchResult }) {
  const pb = result.playbook
  const kindLabel = PLAYBOOK_MATCH_KIND_LABEL[result.kind]
  return (
    <article className="rounded-xl border border-amber-200/80 bg-amber-50/90 p-4 shadow-inner sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-semibold text-amber-950 sm:text-base">{pb.title}</p>
        <span className="shrink-0 rounded-full border border-amber-300/80 bg-white/90 px-2 py-0.5 text-[11px] font-medium text-amber-900">
          {kindLabel}
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-600">{describePlaybookMatch(result)}</p>
      {pb.keySellingPoints?.length ? (
        <ul className="mt-2 list-inside list-disc text-sm leading-relaxed text-slate-700">
          {pb.keySellingPoints.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      ) : null}
      {pb.strategy?.trim() ? (
        <p className="mt-2 text-sm leading-relaxed text-slate-800">{pb.strategy}</p>
      ) : null}
      {pb.objectionHandling?.length ? (
        <div className="mt-3 border-t border-slate-200/80 pt-2">
          <p className="text-xs font-medium text-amber-800 sm:text-sm">Phản đối dự kiến</p>
          <ul className="mt-1.5 list-inside list-decimal text-sm leading-relaxed text-slate-600">
            {pb.objectionHandling.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  )
}

export function LeadPlaybookPanel({
  lead,
  playbooks,
  showDraftHint,
}: {
  lead: Lead
  playbooks: ConsultingPlaybook[]
  /** true khi đang dùng bản xem trước từ form chưa lưu */
  showDraftHint?: boolean
}) {
  const matched = useMemo(() => playbooksMatchingLead(lead, playbooks), [lead, playbooks])
  const [kindFilter, setKindFilter] = useState<KindFilter>('show_all')
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    let list = matched
    if (kindFilter !== 'show_all') list = list.filter((m) => m.kind === kindFilter)
    const q = query.trim().toLowerCase()
    if (!q) return list
    return list.filter((m) => {
      const pb = m.playbook
      const blob = [pb.title, pb.strategy, ...(pb.keySellingPoints ?? []), ...(pb.objectionHandling ?? [])]
        .join(' ')
        .toLowerCase()
      return blob.includes(q)
    })
  }, [matched, kindFilter, query])

  const counts = useMemo(() => {
    const c: Record<PlaybookMatchKind, number> = { all: 0, conditions: 0, keywords: 0 }
    for (const m of matched) c[m.kind]++
    return c
  }, [matched])

  return (
    <div className="space-y-4">
      {showDraftHint ? (
        <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-950 sm:text-sm">
          Đang xem theo thông tin trên form (kể cả chưa lưu). Lưu hồ sơ để đồng bộ với hệ thống.
        </p>
      ) : null}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200/80 bg-slate-50/80 p-3 sm:p-4">
        <p className="w-full text-sm text-slate-700 sm:w-auto sm:flex-1">
          <strong className="font-semibold text-slate-900">{matched.length}</strong> playbook khớp hồ sơ này
          {filtered.length !== matched.length ? (
            <>
              {' '}
              — đang hiển thị <strong className="font-semibold">{filtered.length}</strong>
            </>
          ) : null}
        </p>
        <label className="min-w-[10rem] flex-1 text-sm">
          <span className="font-medium text-slate-700">Lọc trong danh sách</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm tiêu đề, chiến lược…"
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          />
        </label>
        <label className="w-full min-w-[9rem] max-w-[14rem] text-sm sm:w-auto">
          <span className="font-medium text-slate-700">Loại khớp</span>
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as KindFilter)}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value="show_all">Tất cả ({matched.length})</option>
            <option value="conditions">
              {PLAYBOOK_MATCH_KIND_LABEL.conditions} ({counts.conditions})
            </option>
            <option value="keywords">
              {PLAYBOOK_MATCH_KIND_LABEL.keywords} ({counts.keywords})
            </option>
            <option value="all">
              {PLAYBOOK_MATCH_KIND_LABEL.all} ({counts.all})
            </option>
          </select>
        </label>
      </div>

      {filtered.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((m) => (
            <PlaybookCard key={m.playbook.id} result={m} />
          ))}
        </div>
      ) : matched.length ? (
        <p className="text-sm text-slate-500">Không có playbook khớp bộ lọc hiện tại.</p>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center text-sm text-slate-600">
          <p>Chưa có playbook khớp hồ sơ này.</p>
          <p className="mt-2 text-xs text-slate-500">
            Thêm từ khóa hoặc điều kiện trong Cài đặt → Tư vấn → Playbook; kiểm tra ngành, tỉnh, nhãn HOT/WARM trên
            hồ sơ.
          </p>
        </div>
      )}
    </div>
  )
}
