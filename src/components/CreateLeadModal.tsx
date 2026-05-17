import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { UserPlus, X } from 'lucide-react'
import type { Firestore } from 'firebase/firestore'
import type { ProfileCustomScoringSignal, ScoringProfile, VietMyUserProfile } from '../types'
import { LeadProfileCoreForm } from './LeadProfileCoreForm'
import { emptyLeadCoreDraft } from '../utils/leadProfileEdit'
import {
  createManualLead,
  DuplicateLeadError,
  validateManualLeadDraft,
} from '../utils/manualLeadCreate'
import { commitAuditLog } from '../services/auditLog'
import { formatStaffDirectoryLabel } from '../utils/counselorDisplay'
import { isAdminLikeRole, isTeamLeadRole } from '../auth/roleUtils'
import { counselorIdsInManagerScope } from '../utils/teamScope'
import type { MasterDataBuckets } from '../utils/scoring'

export function CreateLeadModal({
  open,
  onClose,
  db,
  profile,
  assigneeOptions,
  directoryUsers,
  activeScoringProfile,
  scoringMasterBuckets,
  schoolTvvSignalDefs,
  onCreated,
  onOpenExisting,
}: {
  open: boolean
  onClose: () => void
  db: Firestore | null
  profile: VietMyUserProfile | null
  assigneeOptions: readonly VietMyUserProfile[]
  directoryUsers: readonly VietMyUserProfile[]
  activeScoringProfile: ScoringProfile | null
  scoringMasterBuckets: MasterDataBuckets
  schoolTvvSignalDefs: readonly ProfileCustomScoringSignal[]
  onCreated: (leadId: string) => void
  onOpenExisting?: (leadId: string) => void
}) {
  const [draft, setDraft] = useState(emptyLeadCoreDraft)
  const [assigneeUid, setAssigneeUid] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [duplicateId, setDuplicateId] = useState<string | null>(null)

  const elevated = isAdminLikeRole(profile?.role)
  const teamLead = isTeamLeadRole(profile?.role)

  const pickList = useMemo(() => {
    if (!profile) return assigneeOptions
    if (elevated) return assigneeOptions
    if (teamLead) {
      const scope = new Set(counselorIdsInManagerScope(profile, directoryUsers))
      return assigneeOptions.filter((u) => scope.has(u.id))
    }
    return assigneeOptions.filter((u) => u.id === profile.id)
  }, [profile, elevated, teamLead, assigneeOptions, directoryUsers])

  const defaultAssignee = useMemo(() => {
    if (!profile) return ''
    if (elevated) return pickList[0]?.id ?? profile.id
    return profile.id
  }, [profile, elevated, pickList])

  useEffect(() => {
    if (!open) return
    setDraft(emptyLeadCoreDraft())
    setAssigneeUid(defaultAssignee)
    setError(null)
    setDuplicateId(null)
    setBusy(false)
  }, [open, defaultAssignee])

  const handleSubmit = useCallback(async () => {
    if (!db || !profile) {
      setError('Chưa kết nối Firestore hoặc chưa đăng nhập.')
      return
    }
    if (!activeScoringProfile) {
      setError('Chưa có bộ chấm điểm — tạo profile trong Cài đặt → Cài đặt Profile.')
      return
    }
    const validationErr = validateManualLeadDraft(draft)
    if (validationErr) {
      setError(validationErr)
      return
    }
    setBusy(true)
    setError(null)
    setDuplicateId(null)
    try {
      const performer = profile.displayName?.trim() || profile.email || profile.id
      const counselorId = assigneeUid.trim() || profile.id
      const { id } = await createManualLead(
        db,
        {
          draft,
          assignedCounselorId: counselorId,
          createdByUid: profile.id,
          createdByName: performer,
        },
        {
          profile: activeScoringProfile,
          masterBuckets: scoringMasterBuckets,
          schoolTvvSignalDefs,
        },
      )
      await commitAuditLog(db, {
        leadId: id,
        actionType: 'SYSTEM_UPDATE',
        description: 'Tạo hồ sơ ứng viên mới (thủ công trên màn Hồ sơ)',
        performedBy: profile.id,
        performedByName: performer,
      })
      onCreated(id)
      onClose()
    } catch (e) {
      if (e instanceof DuplicateLeadError) {
        setDuplicateId(e.existingId)
        setError(e.message)
      } else {
        setError(e instanceof Error ? e.message : 'Không tạo được hồ sơ.')
      }
    } finally {
      setBusy(false)
    }
  }, [
    db,
    profile,
    activeScoringProfile,
    draft,
    assigneeUid,
    scoringMasterBuckets,
    schoolTvvSignalDefs,
    onCreated,
    onClose,
  ])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-[72] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
        aria-label="Đóng"
        onClick={() => !busy && onClose()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-lead-title"
        className="relative z-10 flex max-h-[min(92dvh,880px)] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p id="create-lead-title" className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <UserPlus className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
              Tạo hồ sơ mới
            </p>
            <p className="mt-0.5 text-sm text-slate-600">
              Nhập thông tin ứng viên. Hệ thống chấm điểm theo profile đang chọn và kiểm tra trùng SĐT / fingerprint.
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="shrink-0 rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            aria-label="Đóng"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5">
          {error ? (
            <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
              {error}
              {duplicateId && onOpenExisting ? (
                <button
                  type="button"
                  className="mt-2 block font-semibold text-rose-950 underline"
                  onClick={() => {
                    onOpenExisting(duplicateId)
                    onClose()
                  }}
                >
                  Mở hồ sơ đã có
                </button>
              ) : null}
            </div>
          ) : null}

          <label className="mb-3 block text-sm">
            <span className="font-semibold text-slate-800">Tư vấn viên phụ trách</span>
            <select
              value={assigneeUid}
              disabled={busy || (!elevated && !teamLead)}
              onChange={(e) => setAssigneeUid(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/25 disabled:bg-slate-50"
            >
              {pickList.map((u) => (
                <option key={u.id} value={u.id}>
                  {formatStaffDirectoryLabel(u)}
                </option>
              ))}
            </select>
            {!elevated && !teamLead ? (
              <span className="mt-1 block text-xs text-slate-500">Hồ sơ mới sẽ gán cho bạn.</span>
            ) : null}
          </label>

          <LeadProfileCoreForm draft={draft} onChange={setDraft} disabled={busy} />
        </div>

        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-100 px-4 py-3 sm:px-5">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={busy || !db}
            onClick={() => void handleSubmit()}
            className="rounded-xl border border-emerald-600 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-40"
          >
            {busy ? 'Đang tạo…' : 'Tạo hồ sơ'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
