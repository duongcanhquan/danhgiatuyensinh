import { useCallback, useEffect, useMemo, useState } from 'react'
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
  }
}

function ProfileEditorPanel({
  db,
  profile,
  allProfiles,
  profileList,
  onSelectProfileId,
  profilesLoading,
  canEdit,
  busy,
  setBusy,
  setSaveMsg,
  onDeleted,
  workspaceLayout,
  workspaceFullscreen,
  setWorkspaceFullscreen,
  onCreateProfile,
  ruleTemplateExtras,
}: {
  db: Firestore
  profile: ScoringProfile
  /** Toàn bộ profile (để gỡ cờ mặc định khác khi lưu). */
  allProfiles: ScoringProfile[]
  /** Danh sách profile cho dropdown chọn nhanh. */
  profileList: ScoringProfile[]
  onSelectProfileId: (id: string) => void
  profilesLoading: boolean
  canEdit: boolean
  busy: boolean
  setBusy: (v: boolean) => void
  setSaveMsg: (v: string | null) => void
  onDeleted: () => void
  workspaceLayout?: boolean
  workspaceFullscreen: boolean
  setWorkspaceFullscreen: (v: boolean) => void
  onCreateProfile: () => void
  /** Mẫu quy tắc từ Firestore — hiện trên cùng mỗi nhóm trong thư viện kéo-thả. */
  ruleTemplateExtras?: readonly RuleLibraryTemplate[]
}) {
  const [draft, setDraft] = useState(() => cloneProfile(profile))
  /** Thu gọn cột thư viện — canvas rộng hơn; mặc định mở để dễ kéo mẫu. */
  const [ruleLibraryCollapsed, setRuleLibraryCollapsed] = useState(false)
  /** Thu gọn khối tên / mặc định / HOT·WARM / mô tả — dễ tập trung vào canvas (đặc biệt toàn màn). */
  const [metaCollapsed, setMetaCollapsed] = useState(false)
  const isDefaultProfile = Boolean(profile.isDefaultForImport)

  const saveProfile = useCallback(async () => {
    if (!canEdit) return
    if (!draft.profileName.trim()) {
      setSaveMsg('Vui lòng nhập tên profile.')
      return
    }
    setBusy(true)
    setSaveMsg(null)
    try {
      const t = Timestamp.now()
      const ref = doc(db, FS_COLLECTIONS.scoringProfiles, draft.id)
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
        isDefaultForImport: Boolean(draft.isDefaultForImport),
        updatedAt: t,
      }

      const batch = writeBatch(db)
      if (draft.isDefaultForImport) {
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
  }, [db, draft, allProfiles, canEdit, setBusy, setSaveMsg])

  const deleteProfile = useCallback(async () => {
    if (!canEdit || isDefaultProfile) return
    if (!window.confirm(`Xóa profile «${draft.profileName}»?`)) return
    setBusy(true)
    try {
      await deleteDoc(doc(db, FS_COLLECTIONS.scoringProfiles, draft.id))
      onDeleted()
    } finally {
      setBusy(false)
    }
  }, [db, draft, canEdit, isDefaultProfile, setBusy, onDeleted])

  const defaultProfileTitle =
    'Chỉ một profile mặc định. Khi lưu, hệ thống gỡ cờ ở profile khác — dùng import Excel và khi lead chưa chọn profile.'
  const thresholdExplainTitle =
    'Điểm ≥ HOT → HOT; từ WARM đến dưới HOT → WARM; từ 0 đến dưới WARM → COLD; < 0 → LOSS. Nếu WARM ≥ HOT, hệ thống tự chỉnh WARM = HOT − 1.'

  return (
    <div
      className={[
        'space-y-1.5',
        workspaceLayout ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="rounded-md border border-slate-200/90 bg-gradient-to-br from-slate-50/90 to-white p-1.5 shadow-sm">
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
              {canEdit ? (
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
                        {p.profileName.trim() || '—'} · HOT≥{p.thresholds.hotMinScore} · WARM≥{p.thresholds.warmMinScore}
                        {p.isDefaultForImport ? ' · Mặc định' : ''}
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
                  disabled={!canEdit}
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
                  disabled={!canEdit}
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
                  disabled={!canEdit}
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
                  disabled={!canEdit}
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
                    disabled={!canEdit}
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
                  {canEdit ? (
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

      <div className="mt-1.5 rounded-md border border-emerald-200/80 bg-gradient-to-r from-emerald-50/80 to-white p-2 shadow-sm">
        <p className="text-xs font-semibold text-emerald-950">Tín hiệu TVV — Hành vi &amp; Rủi ro (chi tiết hồ sơ)</p>
        <p className="mt-0.5 text-xs leading-snug text-slate-600">
          TVV tick trên hồ sơ; điểm cộng/trừ theo bảng dưới (không cần kéo khối canvas). Lưu profile để áp dụng.
        </p>
        <div className="mt-2 space-y-1.5">
          {(draft.customScoringSignals ?? []).map((s, idx) => (
            <div
              key={s.id}
              className="flex flex-wrap items-end gap-1.5 rounded-lg border border-emerald-100/90 bg-white/95 px-2 py-1.5"
            >
              <label className="min-w-[9rem] flex-[2] text-xs font-medium text-slate-700">
                Nhãn hiển thị
                <input
                  value={s.label}
                  disabled={!canEdit}
                  onChange={(e) => {
                    const v = e.target.value
                    setDraft((d) => {
                      const list = [...(d.customScoringSignals ?? [])]
                      list[idx] = { ...list[idx]!, label: v }
                      return { ...d, customScoringSignals: list }
                    })
                  }}
                  placeholder="VD: Đã đặt lịch campus tour"
                  className="mt-0.5 h-7 w-full rounded border border-slate-200 bg-white px-1.5 text-xs text-slate-900 outline-none focus:ring-1 focus:ring-emerald-400/40 disabled:opacity-50"
                />
              </label>
              <label className="w-[6.5rem] shrink-0 text-xs font-medium text-slate-700">
                Nhóm
                <select
                  value={s.group}
                  disabled={!canEdit}
                  onChange={(e) => {
                    const g = e.target.value === 'risk' ? 'risk' : 'behavior'
                    setDraft((d) => {
                      const list = [...(d.customScoringSignals ?? [])]
                      list[idx] = { ...list[idx]!, group: g }
                      return { ...d, customScoringSignals: list }
                    })
                  }}
                  className="mt-0.5 h-7 w-full rounded border border-slate-200 bg-white px-1 text-xs text-slate-900 disabled:opacity-50"
                >
                  <option value="behavior">Hành vi (+)</option>
                  <option value="risk">Rủi ro (−)</option>
                </select>
              </label>
              <label className="w-16 shrink-0 text-xs font-medium text-slate-700">
                Điểm
                <input
                  type="number"
                  value={s.points}
                  disabled={!canEdit}
                  onChange={(e) => {
                    const n = Number(e.target.value)
                    setDraft((d) => {
                      const list = [...(d.customScoringSignals ?? [])]
                      list[idx] = { ...list[idx]!, points: Number.isFinite(n) ? n : 0 }
                      return { ...d, customScoringSignals: list }
                    })
                  }}
                  className="mt-0.5 h-7 w-full rounded border border-slate-200 bg-white px-1 text-xs tabular-nums text-slate-900 disabled:opacity-50"
                />
              </label>
              {canEdit ? (
                <button
                  type="button"
                  title="Xóa dòng"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      customScoringSignals: (d.customScoringSignals ?? []).filter((_, i) => i !== idx),
                    }))
                  }
                  className="mb-0.5 h-7 shrink-0 rounded border border-rose-200 bg-rose-50 px-2 text-xs font-semibold text-rose-800 hover:bg-rose-100"
                >
                  Xóa
                </button>
              ) : null}
            </div>
          ))}
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={() =>
              setDraft((d) => ({
                ...d,
                customScoringSignals: [
                  ...(d.customScoringSignals ?? []),
                  { id: crypto.randomUUID(), label: '', group: 'behavior', points: 15 },
                ],
              }))
            }
            className="mt-2 w-full rounded-lg border border-dashed border-emerald-400/70 bg-white/70 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-50/90"
          >
            + Thêm tín hiệu
          </button>
        ) : null}
      </div>

      <div
        className={[
          'border-t border-slate-200 pt-1.5',
          workspaceLayout ? 'flex min-h-0 flex-1 flex-col' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div
          className={[
            'grid min-h-0 flex-1 gap-2',
            canEdit && ruleLibraryCollapsed ? 'lg:grid-cols-[2.875rem_1fr]' : canEdit ? 'lg:grid-cols-[minmax(288px,340px)_1fr]' : 'grid-cols-1',
            workspaceLayout ? 'lg:min-h-0 lg:items-stretch' : 'min-h-[220px]',
          ].join(' ')}
        >
          {canEdit && ruleLibraryCollapsed ? (
            <div className="flex min-h-[10rem] w-full flex-col items-center gap-1.5 self-stretch rounded-lg border border-amber-200/90 bg-gradient-to-b from-amber-50 via-white to-slate-50 py-2 shadow-sm">
              <button
                type="button"
                onClick={() => setRuleLibraryCollapsed(false)}
                title="Mở thư viện quy tắc"
                className="rounded-lg border border-amber-400 bg-white p-2 text-amber-950 shadow-sm transition hover:bg-amber-100"
              >
                <ChevronsRight className="h-4 w-4" aria-hidden />
              </button>
              <span className="select-none text-center text-xs font-bold uppercase leading-tight tracking-widest text-slate-600 [writing-mode:vertical-rl]">
                Mở thư viện
              </span>
            </div>
          ) : null}
          {canEdit && !ruleLibraryCollapsed ? (
            <RuleLibrarySidebar
              canEdit={canEdit}
              fillHeight={Boolean(workspaceLayout)}
              showCollapseButton
              onCollapseRequest={() => setRuleLibraryCollapsed(true)}
              extraTemplates={ruleTemplateExtras}
            />
          ) : null}
          <ProfileDropCanvas
            blocks={draft.ruleBlocks ?? []}
            onChange={(blocks) => setDraft((d) => ({ ...d, ruleBlocks: blocks }))}
            canEdit={canEdit}
            workspaceLayout={Boolean(workspaceLayout)}
            ruleTemplateExtras={ruleTemplateExtras}
          />
        </div>
      </div>

      {canEdit ? (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-t border-slate-200 pt-1.5">
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

export function ProfileManagerTab({ db }: { db: Firestore }) {
  const { can } = useAuth()
  const { profiles, loading, error } = useScoringProfiles()
  const { ruleLibraryTemplates, loading: templatesLoading, error: templatesError } = useScoringRuleTemplates()
  const canEdit = can('config:scoring_rules')

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
    if (!profiles.length) return null
    if (selectedId && profiles.some((p) => p.id === selectedId)) return selectedId
    return profiles[0].id
  }, [profiles, selectedId])

  const selectedProfile = useMemo(
    () => (effectiveSelectedId ? profiles.find((p) => p.id === effectiveSelectedId) ?? null : null),
    [profiles, effectiveSelectedId],
  )

  const createProfile = useCallback(async () => {
    if (!canEdit) return
    setBusy(true)
    setSaveMsg(null)
    try {
      const id = crypto.randomUUID()
      const t = Timestamp.now()
      const payload = {
        ...emptyProfileDraft(),
        createdAt: t,
        updatedAt: t,
      }
      await setDoc(doc(db, FS_COLLECTIONS.scoringProfiles, id), payload)
      setSelectedId(id)
    } finally {
      setBusy(false)
    }
  }, [db, canEdit])

  return (
    <section
      aria-label="Quản lý bộ chấm điểm"
      className={[
        workspaceFullscreen
          ? 'fixed inset-0 z-[200] flex flex-col overflow-hidden bg-slate-100 p-3 shadow-[0_0_0_1px_rgba(15,23,42,0.08)] sm:p-4 md:p-5'
          : 'overflow-hidden rounded-3xl border border-slate-200/90 bg-gradient-to-br from-white via-amber-50/40 to-sky-50/50 p-1 shadow-[0_20px_60px_rgba(15,23,42,0.08)]',
      ].join(' ')}
    >
      <div
        className={[
          'flex min-h-0 flex-col border-slate-200/80',
          workspaceFullscreen
            ? 'h-full min-h-0 flex-1 overflow-hidden rounded-2xl border bg-white p-4 shadow-sm md:p-5'
            : 'rounded-[22px] border bg-white/95 p-3 shadow-sm md:p-4',
        ].join(' ')}
      >
        <h2 className="sr-only">Bộ chấm điểm — profiles</h2>

        {templatesError ? (
          <p className="mt-2 shrink-0 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-900">
            <strong>Mẫu Firestore (thư viện kéo):</strong> {templatesError} — kiểm tra Rules collection{' '}
            <code className="rounded bg-rose-100 px-1">scoringRuleTemplates</code> và tab «Quy tắc mẫu».
          </p>
        ) : null}
        {!templatesLoading && !templatesError && ruleLibraryTemplates.length === 0 ? (
          <p className="mt-2 shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-700">
            Chưa có mẫu tùy chỉnh trong Firestore. Thêm mẫu tại Cài đặt → tab <strong>Quy tắc mẫu</strong> — sau khi lưu, mẫu
            sẽ xuất hiện <em>đầu</em> mỗi nhóm trong cột «Thư viện quy tắc» bên trái.
          </p>
        ) : null}
        {!canEdit ? (
          <p className="mt-4 shrink-0 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            Bạn không có quyền <code className="rounded bg-amber-100 px-1 text-amber-900">config:scoring_rules</code> — chỉ xem được danh sách.
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 shrink-0 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            {error}
          </p>
        ) : null}
        {saveMsg ? (
          <p
            className={[
              'mt-4 shrink-0 rounded-xl border px-4 py-3 text-sm',
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
            'mt-2 flex min-h-0 flex-1 flex-col gap-1.5',
            workspaceFullscreen ? 'min-h-0 overflow-hidden' : 'min-h-[240px]',
          ].join(' ')}
        >
          <div
            className={[
              'flex min-h-0 w-full min-w-0 flex-1 flex-col rounded-lg border border-slate-200 bg-gradient-to-br from-sky-50/40 via-white to-amber-50/30 p-2 shadow-inner md:p-2',
              workspaceFullscreen ? 'min-h-0 overflow-hidden' : '',
            ].join(' ')}
          >
            {!selectedProfile ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 flex-1 text-sm text-slate-600">
                  {loading ? 'Đang tải…' : 'Chưa có profile — bấm «+ Tạo» hoặc tạo từ Cài đặt.'}
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
                  {canEdit ? (
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
                profileList={profiles}
                profilesLoading={loading}
                onSelectProfileId={(id) => {
                  setSelectedId(id)
                  setSaveMsg(null)
                }}
                canEdit={canEdit}
                busy={busy}
                setBusy={setBusy}
                setSaveMsg={setSaveMsg}
                onDeleted={() => setSelectedId(null)}
                workspaceLayout={workspaceFullscreen}
                workspaceFullscreen={workspaceFullscreen}
                setWorkspaceFullscreen={setWorkspaceFullscreen}
                onCreateProfile={() => void createProfile()}
                ruleTemplateExtras={ruleLibraryTemplates}
              />
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
