import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMasterData } from '../hooks/useMasterData'
import { evaluateLead } from '../utils/scoring'
import { PROFILE_SCORING_SAMPLE_LEAD, profileHasActiveRules } from '../utils/scoringProfileUtils'
import { useCounselorDirectory } from '../hooks/useCounselorDirectory'
import {
  buildScoringProfileScopePayload,
  canBuildScoringProfiles,
  canEditScoringProfile,
  filterManageableScoringProfiles,
  isGlobalScoringProfile,
  scoringProfileScopeLabel,
} from '../utils/scoringProfileAccess'
import { isAdminLikeRole } from '../auth/roleUtils'
import { deleteDoc, doc, setDoc, Timestamp, writeBatch } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import { ChevronRight, CircleHelp, Maximize2, X, ChevronsRight } from 'lucide-react'
import type { ScoringProfile } from '../types'
import { FS_COLLECTIONS } from '../types'
import { useScoringProfiles } from '../hooks/useScoringProfiles'
import { useAuth } from '../hooks/useAuth'
import { ProfileDropCanvas } from './ProfileDropCanvas'
import { RuleLibrarySidebar } from './RuleLibrarySidebar'
import { useScoringRuleTemplates } from '../hooks/useScoringRuleTemplates'
import type { RuleLibraryTemplate } from '../utils/ruleLibrary'
function emptyProfileDraft(): Omit<ScoringProfile, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    profileName: '',
    description: '',
    rules: [],
    ruleBlocks: [],
    customScoringSignals: [],
    thresholds: { hotMinScore: 80, warmMinScore: 50 },
    isDefaultForImport: false,
  }
}

function cloneProfile(p: ScoringProfile): Omit<ScoringProfile, 'createdAt' | 'updatedAt'> {
  return {
    id: p.id,
    profileName: p.profileName,
    description: p.description,
    rules: p.rules.map((r) => ({ ...r })),
    ruleBlocks: (p.ruleBlocks ?? []).map((b) => ({
      ...b,
      rows: b.rows.map((row) => ({ ...row })),
    })),
    customScoringSignals: (p.customScoringSignals ?? []).map((s) => ({ ...s })),
    thresholds: { ...p.thresholds },
    isDefaultForImport: p.isDefaultForImport,
    createdBy: p.createdBy,
    scope: p.scope,
    scopeOwnerUid: p.scopeOwnerUid,
  }
}

function ProfileEditorPanel({
  db,
  profile,
  allProfiles,
  profileList,
  onSelectProfileId,
  profilesLoading,
  canEditProfile,
  busy,
  setBusy,
  setSaveMsg,
  onDeleted,
  workspaceLayout,
  workspaceFullscreen,
  setWorkspaceFullscreen,
  onCreateProfile,
  ruleTemplateExtras,
  canCreateProfile,
  canSetDefaultImport,
  sessionUid,
  directoryUsers,
}: {
  db: Firestore
  profile: ScoringProfile
  /** Toàn bộ profile (để gỡ cờ mặc định khác khi lưu). */
  allProfiles: ScoringProfile[]
  /** Danh sách profile cho dropdown chọn nhanh. */
  profileList: ScoringProfile[]
  onSelectProfileId: (id: string) => void
  profilesLoading: boolean
  /** Sửa / lưu / xóa profile hiện tại (profile của mình hoặc quản trị toàn phần). */
  canEditProfile: boolean
  /** Hiện nút «+ Tạo» profile mới. */
  canCreateProfile: boolean
  /** Chỉ quản trị: đặt profile mặc định import (ảnh hưởng mọi profile khác). */
  canSetDefaultImport: boolean
  /** UID đăng nhập — ghi phạm vi profile nhóm / global. */
  sessionUid: string | null
  directoryUsers: readonly import('../types').VietMyUserProfile[]
  busy: boolean
  setBusy: (v: boolean) => void
  setSaveMsg: (v: string | null) => void
  onDeleted: () => void
  workspaceLayout?: boolean
  workspaceFullscreen: boolean
  setWorkspaceFullscreen: (v: boolean) => void
  onCreateProfile: () => void
  /** Mẫu trường tự tạo (lưu online) — hiện trên cùng mỗi nhóm trong thư viện kéo-thả. */
  ruleTemplateExtras?: readonly RuleLibraryTemplate[]
}) {
  const [draft, setDraft] = useState(() => cloneProfile(profile))
  /** Thu gọn cột thư viện — canvas rộng hơn; mặc định mở để dễ kéo mẫu. */
  const [ruleLibraryCollapsed, setRuleLibraryCollapsed] = useState(false)
  /** Thu gọn khối tên / mặc định / HOT·WARM / mô tả — dễ tập trung vào canvas (đặc biệt toàn màn). */
  const [metaCollapsed, setMetaCollapsed] = useState(false)
  const isDefaultProfile = Boolean(profile.isDefaultForImport)
  const {
    regionLabels,
    highSchoolLabels,
    majorLabels,
    academicPerformanceLabels,
    byKind,
    catalogs,
  } = useMasterData()
  const masterBuckets = useMemo(
    () => ({
      regionLabels,
      highSchoolLabels,
      majorLabels,
      academicPerformanceLabels,
      regionEntries: byKind.regions,
      majorEntries: byKind.majors,
      catalogs,
      entriesByCatalogId: byKind,
    }),
    [regionLabels, highSchoolLabels, majorLabels, academicPerformanceLabels, byKind, catalogs],
  )
  const samplePreview = useMemo(
    () => evaluateLead(PROFILE_SCORING_SAMPLE_LEAD, draft, masterBuckets),
    [draft, masterBuckets],
  )
  const draftHasRules = profileHasActiveRules(draft)

  const saveProfile = useCallback(async () => {
    if (!canEditProfile) return
    if (!canSetDefaultImport && !sessionUid?.trim()) {
      setSaveMsg('Không xác định được tài khoản — không thể lưu profile nhóm.')
      return
    }
    if (!draft.profileName.trim()) {
      setSaveMsg('Vui lòng nhập tên profile.')
      return
    }
    setBusy(true)
    setSaveMsg(null)
    try {
      const t = Timestamp.now()
      const ref = doc(db, FS_COLLECTIONS.scoringProfiles, draft.id)
      const isDefaultForImport = canSetDefaultImport && Boolean(draft.isDefaultForImport)
      const scopePayload = buildScoringProfileScopePayload({
        isAdminLike: canSetDefaultImport,
        sessionUid,
      })
      const payload = {
        profileName: draft.profileName.trim(),
        description: draft.description.trim(),
        rules: [],
        ruleBlocks: (draft.ruleBlocks ?? []).map((b) => ({
          id: b.id,
          category: b.category,
          label: b.label.trim(),
          targetField: b.targetField,
          maxWeight: Math.max(0, Number(b.maxWeight) || 0),
          rows: b.rows.map((r) => ({
            id: r.id,
            condition: r.condition,
            value: r.value,
            allocationKind: r.allocationKind,
            allocationValue: r.allocationValue,
          })),
        })),
        customScoringSignals: (draft.customScoringSignals ?? [])
          .filter((s) => s.label.trim())
          .map((s) => ({
            id: s.id,
            label: s.label.trim(),
            group: s.group,
            points: Number.isFinite(s.points) ? s.points : 0,
          })),
        thresholds: {
          hotMinScore: Math.min(100, Math.max(0, draft.thresholds.hotMinScore)),
          warmMinScore: Math.min(100, Math.max(0, draft.thresholds.warmMinScore)),
        },
        isDefaultForImport,
        scope: scopePayload.scope,
        scopeOwnerUid: scopePayload.scopeOwnerUid ?? null,
        createdBy: scopePayload.createdBy ?? null,
        updatedAt: t,
      }

      const batch = writeBatch(db)
      if (isDefaultForImport) {
        for (const p of allProfiles) {
          if (p.id === draft.id) continue
          batch.update(doc(db, FS_COLLECTIONS.scoringProfiles, p.id), {
            isDefaultForImport: false,
            updatedAt: t,
          })
        }
      }
      batch.set(ref, payload, { merge: true })
      await batch.commit()
      setSaveMsg('Đã lưu profile.')
    } catch (e) {
      console.error(e)
      setSaveMsg('Lưu thất bại — kiểm tra Firestore Rules.')
    } finally {
      setBusy(false)
    }
  }, [db, draft, allProfiles, canEditProfile, canSetDefaultImport, sessionUid, setBusy, setSaveMsg])

  const deleteProfile = useCallback(async () => {
    if (!canEditProfile || isDefaultProfile) return
    if (!window.confirm(`Xóa profile «${draft.profileName}»?`)) return
    setBusy(true)
    try {
      await deleteDoc(doc(db, FS_COLLECTIONS.scoringProfiles, draft.id))
      onDeleted()
    } finally {
      setBusy(false)
    }
  }, [db, draft, canEditProfile, isDefaultProfile, setBusy, onDeleted])

  const defaultProfileTitle =
    'Chỉ một profile mặc định. Khi lưu, hệ thống gỡ cờ ở profile khác — dùng import Excel và khi lead chưa chọn profile.'
  const thresholdExplainTitle =
    'Điểm ≥ HOT → HOT; từ WARM đến dưới HOT → WARM; từ 0 đến dưới WARM → COLD; < 0 → LOSS. Nếu WARM ≥ HOT, hệ thống tự chỉnh WARM = HOT − 1.'

  return (
    <div
      className={[
        'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
        workspaceLayout ? '' : 'space-y-1.5',
      ].join(' ')}
    >
      {canCreateProfile && !canEditProfile ? (
        <p className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1.5 text-xs leading-snug text-sky-950">
          {isGlobalScoringProfile(profile)
            ? 'Profile toàn hệ thống — chỉ xem; chọn profile này trên màn Hồ sơ để chấm điểm. Chỉ quản trị mới chỉnh được.'
            : 'Profile nhóm khác — chỉ xem và chọn khi chấm điểm. Không lưu hay xóa tại đây.'}
        </p>
      ) : null}
      <div className="shrink-0 border-b border-slate-200 bg-slate-50/60 px-3 py-2.5 sm:px-4">
        {metaCollapsed ? (
          <div className="flex w-full min-w-0 items-center gap-1.5 rounded border border-transparent px-0.5 py-0.5">
            <button
              type="button"
              onClick={() => setMetaCollapsed(false)}
              aria-expanded={false}
              className="flex min-w-0 flex-1 items-center gap-2 rounded border border-transparent px-1 py-0.5 text-left transition hover:border-amber-200/80 hover:bg-white/80"
            >
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {draft.profileName.trim() || 'Chưa đặt tên'}
                </p>
                <p className="truncate text-xs text-slate-600">
                  HOT ≥{draft.thresholds.hotMinScore} · WARM ≥{draft.thresholds.warmMinScore}
                  {draft.isDefaultForImport ? ' · Mặc định import' : ''}
                  {draft.description.trim()
                    ? ` · ${draft.description.trim().slice(0, 48)}${draft.description.trim().length > 48 ? '…' : ''}`
                    : ''}
                </p>
              </div>
              <span className="shrink-0 text-xs font-medium text-amber-900">Mở rộng</span>
            </button>
            <div className="flex shrink-0 flex-col gap-0.5 sm:flex-row sm:items-center">
              {workspaceFullscreen ? (
                <button
                  type="button"
                  onClick={() => setWorkspaceFullscreen(false)}
                  className="inline-flex items-center justify-center gap-0.5 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-xs font-semibold leading-none text-slate-800 shadow-sm transition hover:bg-slate-50"
                  title="Thoát toàn màn (Esc)"
                >
                  <X className="h-3 w-3 shrink-0" aria-hidden />
                  <span className="hidden sm:inline">Đóng</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setWorkspaceFullscreen(true)}
                  className="inline-flex items-center justify-center gap-0.5 rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-xs font-semibold leading-none text-amber-950 shadow-sm transition hover:bg-amber-100"
                  title="Toàn màn"
                >
                  <Maximize2 className="h-3 w-3 shrink-0" aria-hidden />
                  <span className="hidden min-[380px]:inline">Toàn màn</span>
                </button>
              )}
              {canCreateProfile ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={onCreateProfile}
                  className="rounded-md border border-emerald-600 bg-emerald-600 px-1.5 py-0.5 text-xs font-semibold leading-none text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
                  title="Tạo profile mới"
                >
                  + Tạo
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            {/* Dòng 1: chọn profile (dropdown) + mặc định + ngưỡng + rút gọn */}
            <div className="flex w-full min-w-0 flex-wrap items-end gap-x-2 gap-y-1">
              <label className="min-w-0 flex-1 basis-[min(100%,14rem)] text-xs font-medium leading-none text-slate-700 sm:min-w-[11rem]">
                Profile
                <div className="relative mt-0.5">
                  <select
                    value={profile.id}
                    disabled={profilesLoading || !profileList.length}
                    onChange={(e) => onSelectProfileId(e.target.value)}
                    title="Chọn profile để chỉnh sửa"
                    className="h-8 w-full appearance-none truncate rounded border border-slate-200 bg-white py-1 pl-2 pr-7 text-sm font-semibold text-slate-900 shadow-inner outline-none ring-amber-400/15 focus:ring-1 disabled:opacity-50"
                  >
                    {!profileList.length && !profilesLoading ? (
                      <option value="" disabled>
                        Chưa có profile
                      </option>
                    ) : null}
                    {profileList.map((p) => (
                      <option key={p.id} value={p.id} className="bg-white text-slate-900">
                        {profileSelectLabel(p, directoryUsers)}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500">
                    ▾
                  </span>
                </div>
              </label>
              <label
                className="flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded border border-slate-200/80 bg-white px-2 text-xs font-medium leading-none text-slate-800"
                title={defaultProfileTitle}
              >
                <input
                  type="checkbox"
                  checked={Boolean(draft.isDefaultForImport)}
                  disabled={!canEditProfile || !canSetDefaultImport}
                  onChange={(e) => setDraft({ ...draft, isDefaultForImport: e.target.checked })}
                  className="h-3.5 w-3.5 shrink-0 rounded border-slate-300 bg-white accent-amber-600"
                />
                <span className="whitespace-nowrap">Mặc định</span>
              </label>
              <label className="w-12 shrink-0 text-xs font-medium leading-none text-slate-700">
                HOT
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={draft.thresholds.hotMinScore}
                  disabled={!canEditProfile}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      thresholds: { ...draft.thresholds, hotMinScore: Number(e.target.value) },
                    })
                  }
                  className="mt-0.5 h-8 w-full rounded border border-amber-200/80 bg-white px-1.5 text-sm tabular-nums text-slate-900 disabled:opacity-50"
                />
              </label>
              <label className="w-12 shrink-0 text-xs font-medium leading-none text-slate-700">
                WARM
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={draft.thresholds.warmMinScore}
                  disabled={!canEditProfile}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      thresholds: { ...draft.thresholds, warmMinScore: Number(e.target.value) },
                    })
                  }
                  className="mt-0.5 h-8 w-full rounded border border-amber-200/80 bg-white px-1.5 text-sm tabular-nums text-slate-900 disabled:opacity-50"
                />
              </label>
              <button
                type="button"
                className="mb-0.5 flex h-8 shrink-0 items-end pb-0.5 text-slate-400 hover:text-slate-600"
                title={thresholdExplainTitle}
                aria-label={thresholdExplainTitle}
              >
                <CircleHelp className="h-4 w-4 shrink-0" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => {
                  setMetaCollapsed(true)
                  setRuleLibraryCollapsed(true)
                }}
                aria-expanded={true}
                title="Thu gọn tên, ngưỡng, mô tả và cột thư viện — canvas rộng hơn"
                className="ml-auto shrink-0 rounded px-2 py-0.5 text-xs font-semibold text-amber-900 underline-offset-2 hover:bg-amber-50 hover:underline"
              >
                Rút gọn
              </button>
            </div>
            {/* Dòng 2: tên + mô tả (gọn) + toàn màn / tạo profile */}
            <div className="flex w-full min-w-0 flex-wrap items-end gap-x-2 gap-y-1">
              <label className="min-w-0 flex-1 text-xs font-medium leading-none text-slate-700 sm:min-w-[8rem] sm:max-w-[14rem]">
                Tên
                <input
                  value={draft.profileName}
                  disabled={!canEditProfile}
                  onChange={(e) => setDraft({ ...draft, profileName: e.target.value })}
                  placeholder="Tên profile"
                  className="mt-0.5 h-8 w-full rounded border border-slate-200 bg-white px-2 text-sm text-slate-900 outline-none ring-amber-400/15 focus:ring-1 disabled:opacity-50"
                />
              </label>
              <div className="flex min-w-0 flex-[1.25] basis-[min(100%,12rem)] items-end gap-1">
                <label className="min-w-0 flex-1 text-xs font-medium leading-none text-slate-700">
                  Mô tả
                  <textarea
                    value={draft.description}
                    disabled={!canEditProfile}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                    rows={1}
                    title={draft.description.trim() || 'Mô tả profile'}
                    className="mt-0.5 h-8 max-h-8 w-full resize-none overflow-y-auto rounded border border-slate-200 bg-white px-2 py-1 text-xs leading-tight text-slate-900 outline-none ring-amber-400/15 focus:ring-1 disabled:opacity-50"
                  />
                </label>
                <div className="flex shrink-0 flex-col gap-0.5 pb-px sm:flex-row sm:items-end">
                  {workspaceFullscreen ? (
                    <button
                      type="button"
                      onClick={() => setWorkspaceFullscreen(false)}
                      className="inline-flex items-center justify-center gap-0.5 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xs font-semibold leading-none text-slate-800 shadow-sm transition hover:bg-slate-50"
                      title="Thoát toàn màn (Esc)"
                    >
                      <X className="h-3 w-3 shrink-0" aria-hidden />
                      <span className="hidden sm:inline">Đóng</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setWorkspaceFullscreen(true)}
                      className="inline-flex items-center justify-center gap-0.5 rounded-md border border-amber-300 bg-amber-50 px-1.5 py-1 text-xs font-semibold leading-none text-amber-950 shadow-sm transition hover:bg-amber-100"
                      title="Toàn màn"
                    >
                      <Maximize2 className="h-3 w-3 shrink-0" aria-hidden />
                      <span className="hidden min-[420px]:inline">Toàn màn</span>
                    </button>
                  )}
                  {canCreateProfile ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={onCreateProfile}
                      className="rounded-md border border-emerald-600 bg-emerald-600 px-1.5 py-1 text-xs font-semibold leading-none text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
                      title="Tạo profile mới"
                    >
                      + Tạo
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <div
        className={[
          'flex min-h-0 min-w-0 flex-1 flex-col',
          workspaceLayout ? 'overflow-hidden' : 'min-h-[min(420px,55vh)]',
        ].join(' ')}
      >
        <div
          className={[
            'grid min-h-0 min-w-0 flex-1 gap-0 overflow-hidden',
            canEditProfile && ruleLibraryCollapsed
              ? 'lg:grid-cols-[2.75rem_1fr]'
              : canEditProfile
                ? 'lg:grid-cols-[minmax(260px,300px)_1fr]'
                : 'grid-cols-1',
            workspaceLayout ? 'lg:min-h-0 lg:items-stretch' : '',
          ].join(' ')}
        >
          {canEditProfile && ruleLibraryCollapsed ? (
            <div className="flex min-h-[10rem] w-full flex-col items-center gap-1.5 self-stretch border-r border-slate-200 bg-slate-50/80 py-2">
              <button
                type="button"
                onClick={() => setRuleLibraryCollapsed(false)}
                title="Mở thư viện quy tắc"
                className="rounded-lg border border-amber-300 bg-white p-2 text-amber-950 transition hover:bg-amber-100"
              >
                <ChevronsRight className="h-4 w-4" aria-hidden />
              </button>
              <span className="select-none text-center text-xs font-bold uppercase leading-tight tracking-widest text-slate-600 [writing-mode:vertical-rl]">
                Mở thư viện
              </span>
            </div>
          ) : null}
          {canEditProfile && !ruleLibraryCollapsed ? (
            <RuleLibrarySidebar
              canEdit={canEditProfile}
              fillHeight={Boolean(workspaceLayout)}
              showCollapseButton
              onCollapseRequest={() => setRuleLibraryCollapsed(true)}
              extraTemplates={ruleTemplateExtras}
            />
          ) : null}
          <ProfileDropCanvas
            blocks={draft.ruleBlocks ?? []}
            onChange={(blocks) => setDraft((d) => ({ ...d, ruleBlocks: blocks }))}
            canEdit={canEditProfile}
            workspaceLayout={Boolean(workspaceLayout)}
            ruleTemplateExtras={ruleTemplateExtras}
          />
        </div>
      </div>

      <div className="shrink-0 border-t border-slate-200 bg-slate-50/40 px-3 py-2 text-xs text-slate-800 sm:px-4">
        {!draftHasRules ? (
          <p className="font-medium text-amber-950">
            Chưa có quy tắc cộng điểm — kéo mẫu từ thư viện vào canvas, nhập điểm ± từng dòng, rồi bấm{' '}
            <strong>Lưu profile</strong>. Trên danh sách hồ sơ, chọn đúng bộ chấm điểm này để xem điểm tích lũy.
          </p>
        ) : (
          <p>
            <span className="font-semibold text-slate-900">Xem trước (hồ sơ mẫu):</span>{' '}
            điểm <strong className="tabular-nums text-emerald-800">{samplePreview.calculatedScore}</strong> · nhãn{' '}
            <strong>{samplePreview.priorityTag}</strong>
            <span className="text-slate-600">
              {' '}
              — áp dụng ngay trên màn Hồ sơ sau khi lưu; điểm cột bảng = quy tắc khớp dữ liệu thật từng lead.
            </span>
          </p>
        )}
      </div>

      {canEditProfile ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-slate-200 px-3 py-2.5 sm:px-4">
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveProfile()}
            className="rounded-md border border-emerald-600 bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
            title={undefined}
          >
            {busy ? 'Đang lưu…' : 'Lưu profile'}
          </button>
          {!isDefaultProfile ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void deleteProfile()}
              className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800 shadow-sm hover:bg-rose-100 disabled:opacity-50"
            >
              Xóa profile
            </button>
          ) : (
            <p className="max-w-md text-xs leading-snug text-slate-500">
              Profile mặc định không xóa được — đặt profile khác làm mặc định rồi xóa nếu cần.
            </p>
          )}
        </div>
      ) : null}
    </div>
  )
}

function profileSelectLabel(
  p: ScoringProfile,
  directory: readonly import('../types').VietMyUserProfile[],
) {
  const scope = scoringProfileScopeLabel(p, directory)
  const base = `${p.profileName.trim() || '—'} · ${scope} · HOT≥${p.thresholds.hotMinScore} · WARM≥${p.thresholds.warmMinScore}${p.isDefaultForImport ? ' · Mặc định' : ''}`
  return base
}

export function ProfileManagerTab({ db }: { db: Firestore }) {
  const { can, profile } = useAuth()
  const { profiles, loading, error } = useScoringProfiles()
  const { ruleLibraryTemplates, error: templatesError } = useScoringRuleTemplates()
  const canManageAll = can('config:scoring_rules')
  const canManageTeam = can('config:scoring_profiles_team')
  const canAccessProfiles = canBuildScoringProfiles(can)
  const { users: directoryUsers } = useCounselorDirectory()
  const sessionUid = profile?.id ?? null
  const isAdminLike = isAdminLikeRole(profile?.role)

  const manageableProfiles = useMemo(
    () => filterManageableScoringProfiles(profiles, profile, directoryUsers, can),
    [profiles, profile, directoryUsers, can],
  )

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [workspaceFullscreen, setWorkspaceFullscreen] = useState(false)

  useEffect(() => {
    if (!workspaceFullscreen) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setWorkspaceFullscreen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [workspaceFullscreen])

  const effectiveSelectedId = useMemo(() => {
    if (!manageableProfiles.length) return null
    if (selectedId && manageableProfiles.some((p) => p.id === selectedId)) return selectedId
    return manageableProfiles[0].id
  }, [manageableProfiles, selectedId])

  const selectedProfile = useMemo(
    () => (effectiveSelectedId ? manageableProfiles.find((p) => p.id === effectiveSelectedId) ?? null : null),
    [manageableProfiles, effectiveSelectedId],
  )

  const canEditSelected = Boolean(
    selectedProfile && profile && canEditScoringProfile(selectedProfile, profile, directoryUsers, can),
  )

  const createProfile = useCallback(async () => {
    if (!canAccessProfiles) return
    if (!canManageAll && !canManageTeam) return
    if (!canManageAll && !sessionUid?.trim()) {
      setSaveMsg('Chưa xác định được tài khoản — không thể tạo profile nhóm.')
      return
    }
    setBusy(true)
    setSaveMsg(null)
    try {
      const id = crypto.randomUUID()
      const t = Timestamp.now()
      const scopePayload = buildScoringProfileScopePayload({
        isAdminLike: Boolean(canManageAll || isAdminLike),
        sessionUid,
      })
      const payload = {
        ...emptyProfileDraft(),
        ...scopePayload,
        scopeOwnerUid: scopePayload.scopeOwnerUid ?? null,
        createdAt: t,
        updatedAt: t,
      }
      await setDoc(doc(db, FS_COLLECTIONS.scoringProfiles, id), payload)
      setSelectedId(id)
    } finally {
      setBusy(false)
    }
  }, [db, canAccessProfiles, canManageAll, canManageTeam, isAdminLike, sessionUid])

  return (
    <section
      aria-label="Quản lý bộ chấm điểm"
      className={[
        workspaceFullscreen
          ? 'fixed inset-0 z-[200] flex flex-col overflow-hidden bg-slate-50 p-3 sm:p-4 md:p-5'
          : 'flex min-h-[min(72vh,760px)] min-w-0 flex-col gap-3',
      ].join(' ')}
    >
      <h2 className="sr-only">Bộ chấm điểm — profiles</h2>

      {templatesError ? (
          <p className="shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
            Không tải được mẫu riêng của trường để hiện trong thư viện kéo: {templatesError}. Hãy thử lại sau, hoặc nhờ
            quản trị kiểm tra quyền đọc dữ liệu; có thể thử lưu một mẫu ở tab «Quy tắc mẫu».
          </p>
        ) : null}
        {!canAccessProfiles ? (
          <p className="shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
            Tư vấn viên không tự xây profile — chọn bộ chấm điểm do quản trị hoặc trưởng nhóm cấp trên màn{' '}
            <strong>Hồ sơ</strong>.
          </p>
        ) : null}
        {canAccessProfiles && canManageTeam && !canManageAll ? (
          <p className="shrink-0 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-snug text-sky-950">
            Profile <strong>toàn hệ thống</strong> (admin): xem và áp dụng cho nhóm bạn. Profile{' '}
            <strong>nhóm</strong> do bạn tạo: TVV trong nhóm được chọn khi chấm điểm hồ sơ.
          </p>
        ) : null}
        {canManageAll ? (
          <p className="shrink-0 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-snug text-emerald-950">
            Profile admin lưu ở phạm vi <strong>toàn hệ thống</strong> — mọi TVV và trưởng nhóm đều xem và áp dụng được.
          </p>
        ) : null}
        {error ? (
          <p className="shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-900">
            {error}
          </p>
        ) : null}
        {saveMsg ? (
          <p
            className={[
              'shrink-0 rounded-lg border px-3 py-2 text-sm',
              saveMsg.startsWith('Đã')
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : saveMsg.startsWith('Lưu thất bại')
                  ? 'border-rose-200 bg-rose-50 text-rose-900'
                  : 'border-amber-200 bg-amber-50 text-amber-950',
            ].join(' ')}
          >
            {saveMsg}
          </p>
        ) : null}

      <div
        className={[
          'flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm',
          workspaceFullscreen ? 'min-h-0' : 'min-h-[min(480px,60vh)]',
        ].join(' ')}
      >
            {!selectedProfile ? (
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-6">
                <p className="min-w-0 flex-1 text-sm text-slate-600">
                  {loading ? 'Đang tải…' : 'Chưa có profile — bấm «+ Tạo» hoặc nhờ quản trị.'}
                </p>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                  {workspaceFullscreen ? (
                    <button
                      type="button"
                      onClick={() => setWorkspaceFullscreen(false)}
                      className="inline-flex items-center gap-0.5 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xs font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
                      title="Thoát toàn màn (Esc)"
                    >
                      <X className="h-3 w-3 shrink-0" aria-hidden />
                      Đóng
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setWorkspaceFullscreen(true)}
                      className="inline-flex items-center gap-0.5 rounded-md border border-amber-300 bg-amber-50 px-1.5 py-1 text-xs font-semibold text-amber-950 shadow-sm transition hover:bg-amber-100"
                      title="Toàn màn"
                    >
                      <Maximize2 className="h-3 w-3 shrink-0" aria-hidden />
                      Toàn màn
                    </button>
                  )}
                  {canAccessProfiles ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void createProfile()}
                      className="rounded-md border border-emerald-600 bg-emerald-600 px-1.5 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
                      title="Tạo profile mới"
                    >
                      + Tạo profile
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              <ProfileEditorPanel
                key={`${selectedProfile.id}-${selectedProfile.updatedAt.toMillis()}`}
                db={db}
                profile={selectedProfile}
                allProfiles={profiles}
                profileList={manageableProfiles}
                profilesLoading={loading}
                onSelectProfileId={(id) => {
                  setSelectedId(id)
                  setSaveMsg(null)
                }}
                canEditProfile={canEditSelected}
                canCreateProfile={canAccessProfiles}
                canSetDefaultImport={canManageAll}
                sessionUid={sessionUid}
                busy={busy}
                setBusy={setBusy}
                setSaveMsg={setSaveMsg}
                onDeleted={() => setSelectedId(null)}
                workspaceLayout={true}
                workspaceFullscreen={workspaceFullscreen}
                setWorkspaceFullscreen={setWorkspaceFullscreen}
                onCreateProfile={() => void createProfile()}
                ruleTemplateExtras={ruleLibraryTemplates}
                directoryUsers={directoryUsers}
              />
            )}
      </div>
    </section>
  )
}
