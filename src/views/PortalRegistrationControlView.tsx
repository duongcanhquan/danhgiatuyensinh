import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  type DocumentData,
} from 'firebase/firestore'
import { AlertTriangle, ClipboardCheck, Loader2, UserPlus } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useOrg } from '../hooks/useOrg'
import { getFirestoreDb } from '../services/firebase'
import { resolvePortalRegistration, type PortalRegistrationRow, type PortalSuggestedLead } from '../services/portalRegistrationControl'
import { FS_COLLECTIONS } from '../types'
import {
  canAccessPortalRegistrationControl,
  canResolvePortalRegistration,
  portalMatchKindLabel,
  portalResolveLockActive,
  strongPortalMatch,
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
  }
}

export function PortalRegistrationControlView() {
  const { profile, firebaseUser } = useAuth()
  const { effectiveOrgId } = useOrg()
  const uid = firebaseUser?.uid ?? profile?.id ?? ''
  const allowed = canAccessPortalRegistrationControl(profile?.role)
  const [rows, setRows] = useState<PortalRegistrationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [pickedLead, setPickedLead] = useState<Record<string, string>>({})

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
    } catch (e) {
      appAlert(e instanceof Error ? e.message : 'Không tải được hàng đợi đăng ký.', 'error')
    } finally {
      setLoading(false)
    }
  }, [allowed, effectiveOrgId, profile?.role, uid])

  useEffect(() => {
    void load()
  }, [load])

  if (!allowed) return <Navigate to="/leads" replace />

  async function resolve(row: PortalRegistrationRow, action: 'merge' | 'create_new') {
    if (!canResolvePortalRegistration(profile?.role, uid, row.counselorId)) {
      appAlert('Không có quyền xử lý phiếu này.', 'error')
      return
    }
    const leadId = pickedLead[row.id] || row.suggestedLeadId
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
      await load()
    } catch (e) {
      appAlert(e instanceof Error ? e.message : 'Không xử lý được phiếu.', 'error')
    } finally {
      setBusyId('')
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-3 py-4 sm:px-6">
      <header className="mb-4">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Cổng đăng ký</p>
        <h1 className="text-xl font-extrabold text-slate-900">Kiểm soát đăng ký</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Bản khai trùng CCCD, SĐT hoặc họ tên với hồ sơ đang chạy. Xác nhận gộp — hoặc tạo mới khi chỉ trùng tên.
        </p>
      </header>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Đang tải phiếu chờ…
        </p>
      ) : !rows.length ? (
        <p className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
          Không có đăng ký nào đang chờ đối soát.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => {
            const selected = pickedLead[row.id] || row.suggestedLeadId
            const selectedLead = row.suggestedLeads.find((s) => s.id === selected) ?? row.suggestedLeads[0]
            const warn = selectedLead?.hadActivity
            const locked = portalResolveLockActive(row.status, row.resolvingAtMs || null)
            const canAct = canResolvePortalRegistration(profile?.role, uid, row.counselorId) && !locked
            const busy = busyId === row.id
            return (
              <li key={row.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-slate-900">{row.studentFullName || '—'}</p>
                    <p className="text-xs text-slate-500">
                      {row.studentPhone || 'Không SĐT'}
                      {row.studentNationalId ? ` · CCCD ${row.studentNationalId}` : ''}
                    </p>
                    <p className="text-xs text-slate-500">
                      {[row.studentDob, row.studentGradeClass, row.studentHighSchool].filter(Boolean).join(' · ') ||
                        'Cổng không gửi lớp — đối chiếu trường / ngày sinh với hồ sơ cũ'}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      TVV cổng: {row.counselorName || row.counselorId}
                      {row.createdAtMs
                        ? ` · ${new Date(row.createdAtMs).toLocaleString('vi-VN')}`
                        : ''}
                    </p>
                  </div>
                  <span className="rounded-md bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-950">
                    {portalMatchKindLabel(row.matchKind)}
                  </span>
                </div>

                {row.suggestedLeads.length ? (
                  <div className="mt-3 space-y-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Hồ sơ gợi ý</p>
                    {row.suggestedLeads.map((s) => (
                      <label key={s.id} className="flex items-start gap-2 rounded-md border border-slate-100 px-2 py-1.5 text-sm">
                        <input
                          type="radio"
                          name={`lead-${row.id}`}
                          checked={selected === s.id}
                          onChange={() => setPickedLead((prev) => ({ ...prev, [row.id]: s.id }))}
                          className="mt-1"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="font-semibold text-slate-800">{s.fullName || s.id.slice(0, 8)}</span>
                          <span className="block text-xs text-slate-500">
                            {s.phone || '—'} · {s.gradeClass || 'chưa có lớp'} · {s.highSchool || 'chưa có trường'}
                            {s.assigneeName ? ` · đang của ${s.assigneeName}` : ''}
                          </span>
                          <Link className="text-xs font-semibold text-emerald-800 hover:underline" to={`/leads?open=${s.id}`}>
                            Mở hồ sơ
                          </Link>
                        </span>
                      </label>
                    ))}
                  </div>
                ) : null}

                {locked ? (
                  <p className="mt-3 text-xs font-medium text-slate-600">Đang xử lý — đợi hoàn tất hoặc thử lại sau 2 phút.</p>
                ) : null}

                {warn ? (
                  <p className="mt-3 flex items-start gap-2 rounded-md bg-amber-50 px-2 py-2 text-xs font-medium text-amber-950">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {selectedLead?.assigneeName || 'TVV trước'} đã gọi / đã tương tác — vẫn chuyển phụ trách sang{' '}
                    {row.counselorName || 'TVV cổng'}.
                  </p>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy || !canAct || !selected}
                    onClick={() => void resolve(row, 'merge')}
                    className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-40"
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardCheck className="h-3.5 w-3.5" />}
                    Gộp vào hồ sơ cũ
                  </button>
                  {!strongPortalMatch(row.matchKind) ? (
                    <button
                      type="button"
                      disabled={busy || !canAct}
                      onClick={() => void resolve(row, 'create_new')}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-800 disabled:opacity-40"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      Tạo hồ sơ mới
                    </button>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
