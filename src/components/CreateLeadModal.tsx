import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { UserPlus, X } from 'lucide-react'
import type { Firestore } from 'firebase/firestore'
import type { ProfileCustomScoringSignal, ScoringProfile, VietMyUserProfile } from '../types'
import { LeadProfileCoreForm } from './LeadProfileCoreForm'
import { LeadProfileFinanceSection } from './LeadProfileFinanceSection'
import { emptyLeadCoreDraft } from '../utils/leadProfileEdit'
import {
  createManualLead,
  DuplicateLeadError,
  validateManualLeadDraft,
} from '../utils/manualLeadCreate'
import { commitAuditLog } from '../services/auditLog'
import { formatStaffDirectoryLabel } from '../utils/counselorDisplay'
import { isAdminLikeRole, isFieldStaffRole, isTeamLeadRole } from '../auth/roleUtils'
import { counselorIdsInManagerScope } from '../utils/teamScope'
import type { MasterDataBuckets } from '../utils/scoring'
import { useLeadProfileCatalogs } from '../hooks/useLeadProfileCatalogs'
import { useLeadSources } from '../hooks/useLeadSources'
import { useScholarships } from '../hooks/useScholarships'
import { useLeadClassificationRules } from '../contexts/LeadClassificationRulesContext'
import { useInfoScoreRules } from '../contexts/InfoScoreRulesContext'
import { emptyFinanceDraft, financeDraftHasContent } from '../utils/leadFinance'
import { persistLeadFinance } from '../utils/persistLeadFinance'
import { getDoc, doc } from 'firebase/firestore'
import { FS_COLLECTIONS } from '../types'
import { mapDoc } from '../hooks/useLeads'

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
  const [financeDraft, setFinanceDraft] = useState(emptyFinanceDraft)
  const [assigneeUid, setAssigneeUid] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [duplicateId, setDuplicateId] = useState<string | null>(null)
  const bodyScrollRef = useRef<HTMLDivElement>(null)
  const { active: leadSources } = useLeadSources()
  const { items: scholarships } = useScholarships()
  const { catalogs, onEnsureCatalogEntry } = useLeadProfileCatalogs()
  const { runtime: infoScoreRuntime } = useInfoScoreRules()
  const { runtime: classificationRuntime } = useLeadClassificationRules()

  const elevated = isAdminLikeRole(profile?.role)
  const teamLead = isTeamLeadRole(profile?.role)

  const pickList = useMemo(() => {
    if (!profile) return assigneeOptions
    if (elevated) return assigneeOptions
    if (teamLead) {
      const scope = new Set(counselorIdsInManagerScope(profile, directoryUsers))
      scope.add(profile.id)
      return assigneeOptions.filter((u) => scope.has(u.id))
    }
    return assigneeOptions.filter((u) => u.id === profile.id)
  }, [profile, elevated, teamLead, assigneeOptions, directoryUsers])

  const defaultAssignee = useMemo(() => {
    if (!profile) return ''
    if (elevated && !teamLead) return pickList[0]?.id ?? profile.id
    return profile.id
  }, [profile, elevated, teamLead, pickList])

  useEffect(() => {
    if (!open) return
    setDraft(emptyLeadCoreDraft())
    setFinanceDraft(emptyFinanceDraft())
    setAssigneeUid(defaultAssignee)
    setError(null)
    setDuplicateId(null)
    setBusy(false)
    queueMicrotask(() => bodyScrollRef.current?.scrollTo(0, 0))
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
          infoScoreRuntime,
          classificationRuntime: classificationRuntime.enabled ? classificationRuntime : null,
        },
      )

      if (financeDraftHasContent(financeDraft)) {
        const snap = await getDoc(doc(db, FS_COLLECTIONS.leads, id))
        const lead = snap.exists() ? mapDoc(id, snap.data() as Record<string, unknown>) : null
        if (lead) {
          await persistLeadFinance({
            db,
            lead,
            draft: financeDraft,
            counselorName: performer,
          })
        }
      }
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
    financeDraft,
    assigneeUid,
    scoringMasterBuckets,
    schoolTvvSignalDefs,
    infoScoreRuntime,
    classificationRuntime,
    onCreated,
    onClose,
  ])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-[72] flex items-center justify-center p-3 sm:p-4">
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
        className="relative z-10 flex max-h-[min(92dvh,880px)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p id="create-lead-title" className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <UserPlus className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
              Tạo hồ sơ mới
            </p>
            <p className="mt-0.5 text-sm text-slate-600">
              Điền thông tin cơ bản và tab <strong>Tài chính</strong> nếu thu tiền ngay — mã hệ thống sinh khi lưu.
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="shrink-0 rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:opacity-40"
            aria-label="Đóng"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div
          ref={bodyScrollRef}
          className="scroll-touch min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5"
        >
          {error ? (
            <div
              role="alert"
              className="mb-3 shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900"
            >
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

          <label className="mb-3 block shrink-0 text-sm sm:max-w-md">
            <span className="font-semibold text-slate-800">Nhân viên phụ trách</span>
            <select
              value={assigneeUid}
              disabled={busy || isFieldStaffRole(profile?.role)}
              onChange={(e) => setAssigneeUid(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/25 disabled:bg-slate-50"
            >
              {pickList.map((u) => (
                <option key={u.id} value={u.id}>
                  {formatStaffDirectoryLabel(u)}
                </option>
              ))}
            </select>
            {isFieldStaffRole(profile?.role) ? (
              <span className="mt-1 block text-xs text-slate-500">Hồ sơ mới tự gán cho bạn.</span>
            ) : teamLead ? (
              <span className="mt-1 block text-xs text-slate-500">Chọn nhân viên sale / CTV trong nhóm.</span>
            ) : null}
          </label>

          <LeadProfileCoreForm
            draft={draft}
            onChange={setDraft}
            disabled={busy}
            isNewLead
            leadSources={leadSources}
            scholarships={scholarships}
            catalogs={catalogs}
            onEnsureCatalogEntry={onEnsureCatalogEntry}
            layout="tabs"
            wideGrid
            scrollContained
            financePanel={
              <LeadProfileFinanceSection draft={financeDraft} onChange={setFinanceDraft} disabled={busy} />
            }
          />
        </div>

        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-100 px-4 py-3 sm:px-5">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="vm-btn vm-btn-secondary min-h-11 px-4"
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={busy || !db}
            onClick={() => void handleSubmit()}
            className="vm-btn vm-btn-accent min-h-11 px-4"
          >
            {busy ? 'Đang tạo…' : 'Tạo hồ sơ'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
