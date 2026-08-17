import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  type DocumentData,
} from 'firebase/firestore'
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronRight,
  ClipboardCheck,
  Equal,
  Loader2,
  Plus,
  RefreshCw,
  UserPlus,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useOrg } from '../hooks/useOrg'
import { getFirestoreDb } from '../services/firebase'
import {
  resolvePortalRegistration,
  type PortalRegistrationRow,
  type PortalSuggestedLead,
} from '../services/portalRegistrationControl'
import { FS_COLLECTIONS } from '../types'
import {
  canAccessPortalRegistrationControl,
  canResolvePortalRegistration,
  portalCompareKindLabel,
  portalCompareRows,
  portalMatchKindLabel,
  portalMatchKindTone,
  portalPayloadFieldValue,
  portalResolveLockActive,
  strongPortalMatch,
  type PortalCompareKind,
  type PortalMatchKind,
} from '../utils/portalRegistrationControl'
import { appAlert } from '../utils/appNotify'
import { appConfirm } from '../utils/appConfirm'
import { isAdminLikeRole } from '../auth/roleUtils'

function asRow(id: string, data: DocumentData): PortalRegistrationRow {
  const created = data.createdAt
  const createdAtMs =
    created && typeof created.toMillis === 'function' ? created.toMillis() : 0
  const suggestedLeads = Array.isArray(data.suggestedLeads) ? (data.suggestedLeads as PortalSuggestedLead[]) : []
  const payload =
    data.payload && typeof data.payload === 'object' ? (data.payload as Record<string, unknown>) : {}
  const resolvingAt = data.resolvingAt
  const resolvingAtMs =
    resolvingAt && typeof resolvingAt.toMillis === 'function' ? resolvingAt.toMillis() : 0
  return {
    id,
    orgId: String(data.orgId ?? ''),
    status: String(data.status ?? ''),
    matchKind: (String(data.matchKind ?? 'none') as PortalMatchKind) || 'none',
    counselorId: String(data.counselorId ?? ''),
    counselorName: String(data.counselorName ?? ''),
    studentFullName: String(data.studentFullName ?? ''),
    studentPhone: String(data.studentPhone ?? ''),
    studentNationalId: String(data.studentNationalId ?? ''),
    studentHighSchool: String(payload.highSchool ?? ''),
    studentDob: String(payload.dateOfBirth ?? ''),
    studentGradeClass: String(payload.gradeClass ?? ''),
    suggestedLeadId: String(data.suggestedLeadId ?? ''),
    suggestedLeadIds: Array.isArray(data.suggestedLeadIds) ? data.suggestedLeadIds.map(String) : [],
    suggestedLeads,
    createdAtMs,
    resolvingAtMs,
    payload,
  }
}

function fmtWhen(ms: number): string {
  if (!ms) return '—'
  return new Date(ms).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const KIND_ROW: Record<
  Exclude<PortalCompareKind, 'empty'>,
  { row: string; badge: string; portalCell: string; systemCell: string }
> = {
  same: {
    row: 'bg-emerald-50/70',
    badge: 'bg-emerald-600 text-white',
    portalCell: 'border-emerald-100',
    systemCell: '',
  },
  diff: {
    row: 'bg-amber-50',
    badge: 'bg-amber-500 text-amber-950',
    portalCell: 'border-amber-200 bg-amber-100/40',
    systemCell: 'bg-orange-50/80',
  },
  added: {
    row: 'bg-sky-50',
    badge: 'bg-sky-600 text-white',
    portalCell: 'border-sky-200 bg-sky-100/50',
    systemCell: 'bg-slate-50/80',
  },
  system_only: {
    row: 'bg-slate-50',
    badge: 'bg-slate-500 text-white',
    portalCell: 'border-slate-100',
    systemCell: 'bg-slate-100/70',
  },
}

function KindBadge({ kind }: { kind: PortalCompareKind }) {
  if (kind === 'empty') return null
  const tone = KIND_ROW[kind]
  const Icon = kind === 'same' ? Equal : kind === 'added' ? Plus : kind === 'diff' ? AlertTriangle : Check
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${tone.badge}`}>
      <Icon className="h-2.5 w-2.5" />
      {portalCompareKindLabel(kind)}
    </span>
  )
}

function SideSummary({
  title,
  tone,
  name,
  lines,
}: {
  title: string
  tone: 'portal' | 'system'
  name: string
  lines: string[]
}) {
  const toneCls =
    tone === 'portal'
      ? 'border-teal-300 bg-gradient-to-br from-teal-50 to-emerald-50'
      : 'border-indigo-200 bg-gradient-to-br from-indigo-50 to-slate-50'
  const titleCls = tone === 'portal' ? 'text-teal-800' : 'text-indigo-800'
  return (
    <div className={`min-w-0 rounded-xl border px-2.5 py-2 shadow-sm ${toneCls}`}>
      <p className={`text-[10px] font-bold uppercase tracking-wide ${titleCls}`}>{title}</p>
      <p className="truncate text-sm font-bold text-slate-900">{name || '—'}</p>
      {lines.filter(Boolean).map((line, i) => (
        <p key={`${i}-${line}`} className="truncate text-xs text-slate-600">
          {line}
        </p>
      ))}
    </div>
  )
}

function CompareValue({ value, kind, side }: { value: string; kind: PortalCompareKind; side: 'portal' | 'system' }) {
  if (!value) {
    return <span className="text-slate-400">—</span>
  }
  if (kind === 'diff') {
    return (
      <span className={`font-semibold ${side === 'portal' ? 'text-amber-950' : 'text-orange-900'}`}>{value}</span>
    )
  }
  if (kind === 'added' && side === 'portal') {
    return <span className="font-semibold text-sky-950">{value}</span>
  }
  if (kind === 'same') {
    return <span className="font-medium text-emerald-900">{value}</span>
  }
  return <span className="text-slate-800">{value}</span>
}

export function PortalRegistrationControlView() {
  const { profile, firebaseUser } = useAuth()
  const { effectiveOrgId } = useOrg()
  const uid = firebaseUser?.uid ?? profile?.id ?? ''
  const allowed = canAccessPortalRegistrationControl(profile?.role)
  const [rows, setRows] = useState<PortalRegistrationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pickedLead, setPickedLead] = useState<Record<string, string>>({})
  const [leadDetail, setLeadDetail] = useState<Record<string, unknown> | null>(null)
  const [leadLoading, setLeadLoading] = useState(false)

  const load = useCallback(async () => {
    const db = getFirestoreDb()
    if (!db || !effectiveOrgId || !allowed) {
      setRows([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const col = collection(db, FS_COLLECTIONS.portalRegistrations)
      const pendingQ = isAdminLikeRole(profile?.role)
        ? query(
            col,
            where('orgId', '==', effectiveOrgId),
            where('status', '==', 'pending_review'),
            orderBy('createdAt', 'desc'),
            limit(80),
          )
        : query(
            col,
            where('orgId', '==', effectiveOrgId),
            where('counselorId', '==', uid),
            where('status', '==', 'pending_review'),
            orderBy('createdAt', 'desc'),
            limit(80),
          )
      const resolvingQ = isAdminLikeRole(profile?.role)
        ? query(
            col,
            where('orgId', '==', effectiveOrgId),
            where('status', '==', 'resolving'),
            orderBy('createdAt', 'desc'),
            limit(20),
          )
        : query(
            col,
            where('orgId', '==', effectiveOrgId),
            where('counselorId', '==', uid),
            where('status', '==', 'resolving'),
            orderBy('createdAt', 'desc'),
            limit(20),
          )
      const [pendingSnap, resolvingSnap] = await Promise.all([getDocs(pendingQ), getDocs(resolvingQ)])
      const seen = new Set<string>()
      const next: PortalRegistrationRow[] = []
      for (const d of [...pendingSnap.docs, ...resolvingSnap.docs]) {
        if (seen.has(d.id)) continue
        seen.add(d.id)
        next.push(asRow(d.id, d.data()))
      }
      next.sort((a, b) => b.createdAtMs - a.createdAtMs)
      setRows(next)
      setSelectedId((prev) => (prev && next.some((r) => r.id === prev) ? prev : null))
    } catch (e) {
      appAlert(e instanceof Error ? e.message : 'Không tải được hàng đợi đăng ký.', 'error')
    } finally {
      setLoading(false)
    }
  }, [allowed, effectiveOrgId, profile?.role, uid])

  useEffect(() => {
    void load()
  }, [load])

  const selected = useMemo(
    () => (selectedId ? rows.find((r) => r.id === selectedId) ?? null : null),
    [rows, selectedId],
  )

  const activeLeadId = selected
    ? pickedLead[selected.id] || selected.suggestedLeadId || selected.suggestedLeads[0]?.id || ''
    : ''

  const activeSuggested =
    selected?.suggestedLeads.find((s) => s.id === activeLeadId) ?? selected?.suggestedLeads[0] ?? null

  useEffect(() => {
    let cancelled = false
    async function loadLead() {
      if (!selectedId || !activeLeadId) {
        setLeadDetail(null)
        setLeadLoading(false)
        return
      }
      const db = getFirestoreDb()
      if (!db) return
      const fallback = selected?.suggestedLeads.find((s) => s.id === activeLeadId) ?? selected?.suggestedLeads[0]
      setLeadLoading(true)
      try {
        const snap = await getDoc(doc(db, FS_COLLECTIONS.leads, activeLeadId))
        if (cancelled) return
        if (snap.exists()) {
          setLeadDetail({ id: snap.id, ...(snap.data() as Record<string, unknown>) })
        } else if (fallback) {
          setLeadDetail({
            id: fallback.id,
            fullName: fallback.fullName,
            phone: fallback.phone,
            gradeClass: fallback.gradeClass,
            highSchool: fallback.highSchool,
            assignedTo: fallback.assigneeId,
          })
        } else {
          setLeadDetail(null)
        }
      } catch {
        if (!cancelled && fallback) {
          setLeadDetail({
            id: fallback.id,
            fullName: fallback.fullName,
            phone: fallback.phone,
            gradeClass: fallback.gradeClass,
            highSchool: fallback.highSchool,
            assignedTo: fallback.assigneeId,
          })
        } else if (!cancelled) {
          setLeadDetail(null)
        }
      } finally {
        if (!cancelled) setLeadLoading(false)
      }
    }
    void loadLead()
    return () => {
      cancelled = true
    }
  }, [selectedId, activeLeadId, selected?.suggestedLeads])

  const compareRows = useMemo(
    () => (selected ? portalCompareRows(selected.payload, leadDetail) : []),
    [selected, leadDetail],
  )

  const stats = useMemo(() => {
    const init = { same: 0, diff: 0, added: 0, system_only: 0 }
    for (const r of compareRows) {
      if (r.kind === 'same') init.same += 1
      else if (r.kind === 'diff') init.diff += 1
      else if (r.kind === 'added') init.added += 1
      else if (r.kind === 'system_only') init.system_only += 1
    }
    return init
  }, [compareRows])

  if (!allowed) return <Navigate to="/leads" replace />

  async function resolve(row: PortalRegistrationRow, action: 'merge' | 'create_new') {
    if (!canResolvePortalRegistration(profile?.role, uid, row.counselorId)) {
      appAlert('Không có quyền xử lý phiếu này.', 'error')
      return
    }
    const leadId = pickedLead[row.id] || row.suggestedLeadId || row.suggestedLeads[0]?.id || ''
    if (action === 'merge' && !leadId) {
      appAlert('Chưa có hồ sơ hệ thống để gộp.', 'error')
      return
    }
    const hint =
      action === 'merge'
        ? `Gộp bản khai «${row.studentFullName}» vào hồ sơ cũ và chuyển phụ trách cho ${row.counselorName || 'TVV cổng'}.`
        : `Tạo hồ sơ mới cho «${row.studentFullName}» — không gộp với gợi ý trùng tên.`
    const ok = await appConfirm({
      title: action === 'merge' ? 'Gộp vào hồ sơ cũ?' : 'Tạo hồ sơ mới?',
      description: hint,
      confirmLabel: action === 'merge' ? 'Gộp hồ sơ' : 'Tạo mới',
      cancelLabel: 'Hủy',
      variant: action === 'merge' ? 'warning' : 'danger',
    })
    if (!ok) return
    setBusyId(row.id)
    try {
      const r = await resolvePortalRegistration({
        registrationId: row.id,
        action,
        ...(action === 'merge' && leadId ? { leadId } : {}),
      })
      appAlert(
        action === 'merge'
          ? r.hadActivity
            ? 'Đã gộp hồ sơ. TVV trước đã gọi/tương tác — phụ trách vẫn chuyển sang TVV cổng.'
            : 'Đã gộp thông tin cổng vào hồ sơ cũ.'
          : `Đã tạo hồ sơ mới${r.systemCode ? ` — mã ${r.systemCode}` : ''}.`,
        'success',
      )
      setSelectedId(null)
      await load()
    } catch (e) {
      appAlert(e instanceof Error ? e.message : 'Không xử lý được phiếu.', 'error')
    } finally {
      setBusyId('')
    }
  }

  const locked = selected
    ? portalResolveLockActive(selected.status, selected.resolvingAtMs || null)
    : false
  const canAct = selected
    ? canResolvePortalRegistration(profile?.role, uid, selected.counselorId) && !locked
    : false
  const busy = selected ? busyId === selected.id : false

  const detailPanel = selected ? (
    <div className="flex min-h-0 flex-1 flex-col bg-gradient-to-b from-white via-white to-slate-50">
      <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-3 sm:px-4">
        <button
          type="button"
          className="mb-2 inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200 lg:hidden"
          onClick={() => setSelectedId(null)}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Danh sách
        </button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-extrabold text-slate-900">{selected.studentFullName || '—'}</h2>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset ${portalMatchKindTone(selected.matchKind)}`}
              >
                {portalMatchKindLabel(selected.matchKind)}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              TVV cổng: <span className="font-semibold text-teal-800">{selected.counselorName || selected.counselorId}</span>
              {selected.createdAtMs ? ` · ${fmtWhen(selected.createdAtMs)}` : ''}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-900">
                {stats.same} trùng
              </span>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-950">
                {stats.diff} khác
              </span>
              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-950">
                {stats.added} thêm mới
              </span>
              {stats.system_only ? (
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                  {stats.system_only} chỉ hệ thống
                </span>
              ) : null}
            </div>
          </div>
          {activeLeadId ? (
            <Link
              to={`/leads?open=${activeLeadId}`}
              className="rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-bold text-indigo-900 hover:bg-indigo-100"
            >
              Mở hồ sơ hệ thống
            </Link>
          ) : null}
        </div>
      </div>

      {selected.suggestedLeads.length > 1 ? (
        <div className="shrink-0 border-b border-slate-100 bg-indigo-50/40 px-3 py-2.5 sm:px-4">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-indigo-800">
            Chọn hồ sơ hệ thống để đối chiếu
          </p>
          <div className="flex flex-wrap gap-2">
            {selected.suggestedLeads.map((s) => {
              const on = activeLeadId === s.id
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setPickedLead((prev) => ({ ...prev, [selected.id]: s.id }))}
                  className={`rounded-xl border px-2.5 py-1.5 text-left text-xs shadow-sm ${
                    on
                      ? 'border-indigo-600 bg-indigo-600 text-white'
                      : 'border-indigo-100 bg-white text-slate-700 hover:border-indigo-300'
                  }`}
                >
                  <span className="block font-semibold">{s.fullName || s.id.slice(0, 8)}</span>
                  <span className={on ? 'text-indigo-100' : 'text-slate-500'}>
                    {s.phone || '—'}
                    {s.assigneeName ? ` · ${s.assigneeName}` : ''}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      {locked ? (
        <p className="shrink-0 border-b border-slate-200 bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700 sm:px-4">
          Đang xử lý — đợi hoàn tất hoặc thử lại sau 2 phút.
        </p>
      ) : null}

      {activeSuggested?.hadActivity ? (
        <p className="flex shrink-0 items-start gap-2 border-b border-amber-200 bg-amber-100 px-3 py-2 text-xs font-medium text-amber-950 sm:px-4">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {activeSuggested.assigneeName || 'TVV trước'} đã gọi / đã tương tác — gộp vẫn chuyển phụ trách sang{' '}
          {selected.counselorName || 'TVV cổng'}.
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto pb-24">
        <div className="sticky top-0 z-10 grid grid-cols-2 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wide shadow-sm">
          <div className="border-r border-teal-200 bg-teal-600 px-3 py-2.5 text-white sm:px-4">
            Thông tin mới (cổng)
          </div>
          <div className="bg-indigo-600 px-3 py-2.5 text-white sm:px-4">Thông tin trên hệ thống</div>
        </div>

        {leadLoading ? (
          <p className="flex items-center gap-2 px-4 py-6 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Đang tải hồ sơ hệ thống…
          </p>
        ) : (
          <div>
            {activeLeadId ? (
              <div className="grid grid-cols-2 border-b border-slate-100 bg-slate-50 text-sm">
                <div className="border-r border-slate-100 px-3 py-2 text-xs text-slate-500 sm:px-4">Mã hệ thống</div>
                <div className="px-3 py-2 font-mono text-xs font-semibold text-indigo-900 sm:px-4">
                  {String(leadDetail?.systemCode ?? leadDetail?.customerId ?? activeLeadId).trim() || '—'}
                </div>
              </div>
            ) : null}
            {compareRows.map((r) => {
              const tone = KIND_ROW[r.kind as Exclude<PortalCompareKind, 'empty'>]
              return (
                <div key={r.key} className={`grid grid-cols-2 border-b border-white/60 text-sm ${tone.row}`}>
                  <div className={`border-r px-3 py-2.5 sm:px-4 ${tone.portalCell}`}>
                    <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{r.label}</p>
                      <KindBadge kind={r.kind} />
                    </div>
                    <CompareValue value={r.portal} kind={r.kind} side="portal" />
                  </div>
                  <div className={`px-3 py-2.5 sm:px-4 ${tone.systemCell}`}>
                    <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{r.label}</p>
                    <CompareValue value={r.system} kind={r.kind} side="system" />
                  </div>
                </div>
              )
            })}
            {!compareRows.length ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">Không có trường để đối chiếu.</p>
            ) : null}
          </div>
        )}
      </div>

      <div className="sticky bottom-0 z-20 border-t border-slate-200 bg-white/95 px-3 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur sm:px-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || !canAct || !activeLeadId}
            onClick={() => void resolve(selected, 'merge')}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-teal-700 px-4 text-sm font-bold text-white shadow-sm hover:bg-teal-800 disabled:opacity-40 sm:flex-none"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
            Gộp vào hồ sơ cũ
          </button>
          {!strongPortalMatch(selected.matchKind) ? (
            <button
              type="button"
              disabled={busy || !canAct}
              onClick={() => void resolve(selected, 'create_new')}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-40 sm:flex-none"
            >
              <UserPlus className="h-4 w-4" />
              Tạo hồ sơ mới
            </button>
          ) : null}
        </div>
      </div>
    </div>
  ) : (
    <div className="hidden min-h-0 flex-1 items-center justify-center bg-gradient-to-br from-slate-50 via-indigo-50/40 to-teal-50/50 p-8 text-center lg:flex">
      <div>
        <p className="text-base font-bold text-slate-800">Chọn một phiếu trong danh sách</p>
        <p className="mt-1 max-w-sm text-sm text-slate-500">
          Xanh = trùng · Vàng = khác · Xanh dương = thêm mới từ cổng
        </p>
      </div>
    </div>
  )

  return (
    <div className="-mx-3 -my-3 flex min-h-[calc(100dvh-5.25rem)] flex-col bg-gradient-to-br from-slate-100 via-teal-50/30 to-indigo-50/40 sm:-mx-4 sm:-my-4 md:-mx-6 md:-my-5 lg:-mx-8">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-teal-200/70 bg-white/90 px-3 py-3 shadow-sm backdrop-blur sm:px-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-teal-700">Cổng đăng ký</p>
          <h1 className="text-lg font-extrabold text-slate-900 sm:text-xl">Kiểm soát đăng ký</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-teal-600 px-3 py-1 text-xs font-bold text-white shadow-sm">
            {rows.length} phiếu chờ
          </span>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Tải lại
          </button>
        </div>
      </header>

      <div className="mx-2 mb-2 mt-2 flex flex-wrap gap-2 text-[11px] font-semibold sm:mx-3">
        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-900 ring-1 ring-emerald-200">
          Xanh · Trùng
        </span>
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-950 ring-1 ring-amber-200">
          Vàng · Khác nhau
        </span>
        <span className="rounded-full bg-sky-100 px-2.5 py-1 text-sky-950 ring-1 ring-sky-200">
          Xanh dương · Thêm mới từ cổng
        </span>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden rounded-t-2xl border border-slate-200/80 bg-white shadow-sm">
        <section
          className={`flex min-h-0 w-full flex-col border-slate-200 lg:w-[min(28rem,38%)] lg:border-r ${
            selected ? 'hidden lg:flex' : 'flex'
          }`}
        >
          <div className="grid shrink-0 grid-cols-2 gap-2 border-b border-slate-100 bg-gradient-to-r from-teal-600 to-indigo-600 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-white">
            <span>Thông tin mới</span>
            <span>Trên hệ thống</span>
          </div>

          {loading && !rows.length ? (
            <p className="flex items-center gap-2 px-4 py-8 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Đang tải phiếu chờ…
            </p>
          ) : !rows.length ? (
            <p className="px-4 py-10 text-center text-sm text-slate-500">Không có đăng ký nào đang chờ đối soát.</p>
          ) : (
            <ul className="min-h-0 flex-1 overflow-y-auto">
              {rows.map((row) => {
                const sid = pickedLead[row.id] || row.suggestedLeadId || row.suggestedLeads[0]?.id || ''
                const sys = row.suggestedLeads.find((s) => s.id === sid) ?? row.suggestedLeads[0]
                const active = selectedId === row.id
                const portalPhone =
                  portalPayloadFieldValue(row.payload, 'phone') || row.studentPhone || 'Không SĐT'
                const portalSchool =
                  [row.studentDob, row.studentGradeClass, row.studentHighSchool].filter(Boolean).join(' · ') ||
                  '—'
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(row.id)}
                      className={`flex w-full flex-col gap-2 border-b border-slate-100 px-3 py-3 text-left transition-colors hover:bg-teal-50/40 ${
                        active ? 'bg-teal-50 ring-2 ring-inset ring-teal-400' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset ${portalMatchKindTone(row.matchKind)}`}
                        >
                          {portalMatchKindLabel(row.matchKind)}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] font-medium text-slate-400">
                          {fmtWhen(row.createdAtMs)}
                          <ChevronRight className="h-3.5 w-3.5 text-teal-600" />
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <SideSummary
                          title="Cổng"
                          tone="portal"
                          name={row.studentFullName}
                          lines={[portalPhone, portalSchool]}
                        />
                        <SideSummary
                          title="Hệ thống"
                          tone="system"
                          name={sys?.fullName || 'Chưa có hồ sơ'}
                          lines={[
                            sys?.phone || '—',
                            [sys?.gradeClass, sys?.highSchool].filter(Boolean).join(' · ') ||
                              (sys?.assigneeName ? `TVV: ${sys.assigneeName}` : '—'),
                          ]}
                        />
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className={`min-h-0 min-w-0 flex-1 ${selected ? 'flex' : 'hidden lg:flex'}`}>
          {detailPanel}
        </section>
      </div>
    </div>
  )
}
