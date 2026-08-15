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
import { isFieldStaffRole, isTeamLeadRole } from '../auth/roleUtils'
import { counselorIdsInManagerScope } from '../utils/teamScope'
import type { MasterDataBuckets } from '../utils/scoring'
import { useLeadProfileCatalogs } from '../hooks/useLeadProfileCatalogs'
import { useLeadSources } from '../hooks/useLeadSources'
import { useScholarships } from '../hooks/useScholarships'
import { useLeadClassificationRules } from '../contexts/LeadClassificationRulesContext'
import { useInfoScoreRules } from '../contexts/InfoScoreRulesContext'
import {
  emptyFinanceDraft,
  financeDraftHasContent,
  financeDraftNotifiesN8n,
  financeDraftToRecord,
  PAYMENT_SLOT_DEFS,
} from '../utils/leadFinance'
import { describeFinanceDepositAudit } from '../utils/leadFinanceAudit'
import { clearFinancePendingFiles, persistLeadFinance } from '../utils/persistLeadFinance'
import { getDoc, doc } from 'firebase/firestore'
import {
  defaultPublicRegistrationConfig,
  FS_COLLECTIONS,
  SCORING_AUX_PUBLIC_REGISTRATION_DOC_ID,
} from '../types'
import { mapDoc } from '../hooks/useLeads'
import { useOrg } from '../hooks/useOrg'
import { useAuth } from '../hooks/useAuth'
import { orgSettingsDocSegments } from '../tenancy/orgSettingsPaths'

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
  onCreated: (
    leadId: string,
    meta?: { warning?: string | null; systemCode?: string; n8nOk?: boolean; n8nError?: string | null },
  ) => void
  onOpenExisting?: (leadId: string) => void
}) {
  const [draft, setDraft] = useState(emptyLeadCoreDraft)
  const [financeDraft, setFinanceDraft] = useState(emptyFinanceDraft)
  const [assigneeUid, setAssigneeUid] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [duplicateId, setDuplicateId] = useState<string | null>(null)
  const bodyScrollRef = useRef<HTMLDivElement>(null)
  const submittingRef = useRef(false)
  const { active: leadSources } = useLeadSources()
  const { items: scholarships } = useScholarships()
  const { can } = useAuth()
  const { catalogs, onEnsureCatalogEntry } = useLeadProfileCatalogs()
  const { runtime: infoScoreRuntime } = useInfoScoreRules()
  const { runtime: classificationRuntime } = useLeadClassificationRules()
  const { effectiveOrgId } = useOrg()

  const elevated = can('leads:read:global')
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

  const wasOpenRef = useRef(false)
  const assigneeTouchedRef = useRef(false)

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false
      assigneeTouchedRef.current = false
      return
    }
    const justOpened = !wasOpenRef.current
    wasOpenRef.current = true
    if (!justOpened) return

    const seedSource1 = defaultPublicRegistrationConfig().defaultSource1
    setDraft({ ...emptyLeadCoreDraft(), source1: seedSource1, source: '' })
    setFinanceDraft(emptyFinanceDraft())
    setAssigneeUid(defaultAssignee)
    assigneeTouchedRef.current = false
    setError(null)
    setDuplicateId(null)
    setBusy(false)
    submittingRef.current = false
    queueMicrotask(() => bodyScrollRef.current?.scrollTo(0, 0))
  }, [open, defaultAssignee])

  useEffect(() => {
    if (!open || assigneeTouchedRef.current) return
    if (!defaultAssignee) return
    setAssigneeUid((prev) => (prev === defaultAssignee ? prev : defaultAssignee))
  }, [open, defaultAssignee])

  useEffect(() => {
    if (!open || !db) return
    let cancelled = false
    void (async () => {
      let raw = ''
      try {
        const orgSnap = await getDoc(
          doc(db, ...orgSettingsDocSegments(effectiveOrgId, SCORING_AUX_PUBLIC_REGISTRATION_DOC_ID)),
        )
        if (orgSnap.exists()) {
          raw = String((orgSnap.data() as { defaultSource1?: unknown }).defaultSource1 ?? '').trim()
        } else {
          const legacy = await getDoc(
            doc(db, FS_COLLECTIONS.scoringAux, SCORING_AUX_PUBLIC_REGISTRATION_DOC_ID),
          )
          if (legacy.exists()) {
            raw = String((legacy.data() as { defaultSource1?: unknown }).defaultSource1 ?? '').trim()
          }
        }
      } catch {
        /* giữ mặc định code */
      }
      if (cancelled || !raw) return
      setDraft((d) => {
        const fallback = defaultPublicRegistrationConfig().defaultSource1
        const stillSeed = !d.source1.trim() || d.source1.trim() === fallback
        if (!stillSeed) return d
        return { ...d, source1: raw }
      })
    })()
    return () => {
      cancelled = true
    }
  }, [open, db, effectiveOrgId])

  const handleSubmit = useCallback(async () => {
    if (submittingRef.current || busy) return
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
    submittingRef.current = true
    setBusy(true)
    setError(null)
    setDuplicateId(null)
    let createdId: string | null = null
    let createdSystemCode: string | null = null
    let postWriteWarning: string | null = null
    try {
      const performer = profile.displayName?.trim() || profile.email || profile.id
      const counselorId = assigneeUid.trim() || profile.id
      const financeOnCreate =
        financeDraftHasContent(financeDraft)
          ? financeDraftToRecord(clearFinancePendingFiles(financeDraft))
          : null
      const { id, systemCode, n8nOk, n8nError } = await createManualLead(
        db,
        {
          draft,
          assignedCounselorId: counselorId,
          createdByUid: profile.id,
          createdByName: performer,
          orgId: effectiveOrgId,
          leadSources,
          finance: financeOnCreate,
        },
        {
          profile: activeScoringProfile,
          masterBuckets: scoringMasterBuckets,
          schoolTvvSignalDefs,
          infoScoreRuntime,
          classificationRuntime: classificationRuntime.enabled ? classificationRuntime : null,
        },
      )
      createdId = id
      createdSystemCode = systemCode

      // Báo thu n8n chỉ khi có tiền/bill/Full NE — không bắn khi tạo hồ sơ trống tài chính.
      const shouldNotifyFinanceN8n = financeDraftNotifiesN8n(financeDraft)
      const hasPendingReceipt = PAYMENT_SLOT_DEFS.some((s) => Boolean(financeDraft.payments[s.key].pendingFile))
      if (shouldNotifyFinanceN8n || hasPendingReceipt) {
        try {
          const snap = await getDoc(doc(db, FS_COLLECTIONS.leads, id))
          const leadRaw = snap.exists() ? mapDoc(id, snap.data() as Record<string, unknown>) : null
          const assignee =
            directoryUsers.find((u) => u.id === counselorId) ??
            assigneeOptions.find((u) => u.id === counselorId)
          const assigneeLabel = assignee
            ? formatStaffDirectoryLabel(assignee)
            : performer
          if (leadRaw) {
            const saved = await persistLeadFinance({
              db,
              lead: leadRaw,
              draft: financeDraft,
              counselorName: assigneeLabel,
              forceNotifyN8n: shouldNotifyFinanceN8n,
            })
            const bits: string[] = []
            if (saved.receiptUploadWarnings.length) {
              bits.push(`Chứng từ chưa lên: ${saved.receiptUploadWarnings.join('; ')}`)
            } else if (saved.receiptsUploaded.length) {
              const prov = [...new Set(saved.receiptsUploaded.map((r) => r.provider))]
                .map((p) => (p === 'r2' ? 'R2' : p === 'drive' ? 'Drive' : 'Firebase'))
                .join('/')
              bits.push(`Chứng từ đã lên ${prov}.`)
            }
            if (saved.n8nAttempted && !saved.n8nOk) {
              bits.push(`Tin báo thu n8n chưa gửi: ${saved.n8nError || 'lỗi'}`)
            } else if (saved.n8nOk) {
              bits.push('Đã gửi tin báo thu sang n8n.')
            }
            if (bits.length) {
              postWriteWarning = [postWriteWarning, ...bits].filter(Boolean).join(' ')
            }
          } else {
            postWriteWarning = [
              postWriteWarning,
              'Hồ sơ đã tạo; chưa đọc lại được để gửi tin báo thu — mở hồ sơ và Lưu tài chính lại nếu cần.',
            ]
              .filter(Boolean)
              .join(' ')
          }
        } catch (fe) {
          console.warn('[CreateLeadModal] finance after create', fe)
          postWriteWarning =
            fe instanceof Error
              ? `Hồ sơ và tiền đã lưu; chứng từ/n8n lỗi: ${fe.message}`
              : 'Hồ sơ và tiền đã lưu; chứng từ hoặc tin báo thu chưa xong — mở hồ sơ để thử lại.'
        }
      }

      if (financeOnCreate) {
        const financeAudit = describeFinanceDepositAudit(financeDraft)
        if (financeAudit) {
          try {
            await commitAuditLog(db, {
              leadId: id,
              actionType: 'SYSTEM_UPDATE',
              description: financeAudit,
              performedBy: profile.id,
              performedByName: performer,
            })
          } catch (ae) {
            console.warn('[CreateLeadModal] finance audit', ae)
          }
        }
      }
      // Audit «Tạo hồ sơ» + n8n đã ghi trong createManualLead.

      if (!n8nOk && n8nError) {
        postWriteWarning = [
          postWriteWarning,
          `Tin n8n đăng ký chưa gửi được: ${n8nError}`,
        ]
          .filter(Boolean)
          .join(' ')
      }

      onCreated(id, { warning: postWriteWarning, systemCode, n8nOk, n8nError })
      onClose()
    } catch (e) {
      if (createdId) {
        // Đã ghi Firestore — vẫn coi là thành công, tránh bấm lại báo trùng.
        onCreated(createdId, {
          warning:
            e instanceof Error
              ? `Hồ sơ đã tạo nhưng bước sau lỗi: ${e.message}`
              : 'Hồ sơ đã tạo nhưng có lỗi phụ.',
          systemCode: createdSystemCode ?? undefined,
        })
        onClose()
      } else if (e instanceof DuplicateLeadError) {
        setDuplicateId(e.existingId)
        setError(e.message)
      } else {
        setError(e instanceof Error ? e.message : 'Không tạo được hồ sơ.')
      }
    } finally {
      submittingRef.current = false
      setBusy(false)
    }
  }, [
    busy,
    db,
    profile,
    effectiveOrgId,
    activeScoringProfile,
    draft,
    financeDraft,
    assigneeUid,
    scoringMasterBuckets,
    schoolTvvSignalDefs,
    infoScoreRuntime,
    classificationRuntime,
    leadSources,
    directoryUsers,
    assigneeOptions,
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
              <UserPlus className="h-5 w-5 shrink-0 text-indigo-600" aria-hidden />
              Tạo hồ sơ mới
            </p>
            <p className="mt-0.5 text-sm text-slate-600">
              Điền đủ thông tin như form cổng đăng ký; tab <strong>Tài chính</strong> nếu thu tiền ngay.
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
              onChange={(e) => {
                assigneeTouchedRef.current = true
                setAssigneeUid(e.target.value)
              }}
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/25 disabled:bg-slate-50"
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
