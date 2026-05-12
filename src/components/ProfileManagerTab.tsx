import { useCallback, useEffect, useMemo, useState } from 'react'
import { deleteDoc, doc, setDoc, Timestamp, writeBatch } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import { motion, AnimatePresence } from 'motion/react'
import { Maximize2, X } from 'lucide-react'
import type { ScoringProfile } from '../types'
import { FS_COLLECTIONS } from '../types'
import { useScoringProfiles } from '../hooks/useScoringProfiles'
import { useAuth } from '../hooks/useAuth'
import { ProfileDropCanvas } from './ProfileDropCanvas'
import { RuleLibrarySidebar } from './RuleLibrarySidebar'
import { VietMyAccentHeading } from './VietMyAccentHeading'

function emptyProfileDraft(): Omit<ScoringProfile, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    profileName: '',
    description: '',
    rules: [],
    ruleBlocks: [],
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
    thresholds: { ...p.thresholds },
    isDefaultForImport: p.isDefaultForImport,
    createdBy: p.createdBy,
  }
}

function ProfileEditorPanel({
  db,
  profile,
  allProfiles,
  canEdit,
  busy,
  setBusy,
  setSaveMsg,
  onDeleted,
  workspaceLayout,
}: {
  db: Firestore
  profile: ScoringProfile
  /** Toàn bộ profile (để gỡ cờ mặc định khác khi lưu). */
  allProfiles: ScoringProfile[]
  canEdit: boolean
  busy: boolean
  setBusy: (v: boolean) => void
  setSaveMsg: (v: string | null) => void
  onDeleted: () => void
  workspaceLayout?: boolean
}) {
  const [draft, setDraft] = useState(() => cloneProfile(profile))
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

  return (
    <div
      className={[
        'space-y-5',
        workspaceLayout ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">
          Tên profile
          <input
            value={draft.profileName}
            disabled={!canEdit}
            onChange={(e) => setDraft({ ...draft, profileName: e.target.value })}
            placeholder="Nhập tên profile"
            className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base text-slate-900 outline-none ring-amber-400/25 focus:ring-2 disabled:opacity-50"
          />
        </label>
        <label className="flex flex-col gap-1.5 rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-3 text-sm text-slate-800 md:pt-3">
          <span className="flex items-center gap-2 font-medium">
            <input
              type="checkbox"
              checked={Boolean(draft.isDefaultForImport)}
              disabled={!canEdit}
              onChange={(e) => setDraft({ ...draft, isDefaultForImport: e.target.checked })}
              className="h-4 w-4 shrink-0 rounded border-slate-300 bg-white accent-amber-600"
            />
            <span>Set as Default Profile</span>
          </span>
          <span className="pl-6 text-xs leading-snug text-slate-600">
            Chỉ một profile được đánh dấu mặc định. Khi lưu, hệ thống gỡ cờ mặc định ở các profile khác — dùng cho
            import Excel và dropdown lead khi chưa chọn profile.
          </span>
        </label>
      </div>
      <label className="block text-sm font-medium text-slate-700">
        Mô tả
        <textarea
          value={draft.description}
          disabled={!canEdit}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          rows={2}
          className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base text-slate-900 outline-none ring-amber-400/25 focus:ring-2 disabled:opacity-50"
        />
      </label>

      <div className="grid gap-4 rounded-xl border border-slate-200 bg-gradient-to-br from-amber-50/50 to-white p-4 md:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          Ngưỡng HOT (điểm ≥)
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
            className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base text-slate-900 disabled:opacity-50"
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Ngưỡng WARM (điểm ≥)
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
            className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base text-slate-900 disabled:opacity-50"
          />
        </label>
        <p className="md:col-span-2 text-xs text-slate-600">
          Áp dụng cho <strong>mọi profile</strong> (kể cả mặc định): điểm ≥ ngưỡng HOT → HOT; từ ngưỡng WARM đến dưới HOT →
          WARM; từ 0 đến dưới WARM → COLD; &lt; 0 → LOSS. Nếu WARM ≥ HOT, hệ thống tự chỉnh WARM = HOT − 1.
        </p>
      </div>

      <div
        className={[
          'border-t border-slate-200 pt-5',
          workspaceLayout ? 'flex min-h-0 flex-1 flex-col' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <p className="text-sm font-semibold text-slate-800">Scoring Profile Builder</p>
        <p className="mt-1 text-xs text-slate-600">
          Kéo mẫu từ thư viện, gán điểm ±, lưu — profile xuất hiện trong dropdown trên Bảng lead / Dashboard. Engine{' '}
          <strong>cộng dồn</strong> mọi dòng khớp (có thể âm). Nhãn HOT/WARM/COLD/LOSS theo <strong>ngưỡng HOT/WARM</strong> bạn
          nhập ở trên (mỗi profile riêng, kể cả mặc định).
        </p>
        <div
          className={[
            'mt-4 grid gap-4 xl:grid-cols-[minmax(240px,280px)_1fr] xl:items-stretch',
            workspaceLayout ? 'min-h-0 flex-1 xl:min-h-0' : 'min-h-[460px]',
          ].join(' ')}
        >
          {canEdit ? <RuleLibrarySidebar canEdit={canEdit} fillHeight={Boolean(workspaceLayout)} /> : null}
          <ProfileDropCanvas
            blocks={draft.ruleBlocks ?? []}
            onChange={(blocks) => setDraft((d) => ({ ...d, ruleBlocks: blocks }))}
            canEdit={canEdit}
            workspaceLayout={Boolean(workspaceLayout)}
          />
        </div>
      </div>

      {canEdit ? (
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-slate-200 pt-4">
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveProfile()}
            className="rounded-xl border border-emerald-600 bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-md transition hover:bg-emerald-700 disabled:opacity-50"
            title={undefined}
          >
            {busy ? 'Đang lưu…' : 'Lưu profile'}
          </button>
          {!isDefaultProfile ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void deleteProfile()}
              className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800 shadow-sm hover:bg-rose-100 disabled:opacity-50"
            >
              Xóa profile
            </button>
          ) : (
            <p className="text-xs text-slate-500">
              Profile mặc định không thể xóa — có thể chỉnh sửa và chọn profile khác làm mặc định rồi xóa nếu cần.
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

  const selectProfile = useCallback((p: ScoringProfile) => {
    setSelectedId(p.id)
    setSaveMsg(null)
  }, [])

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
            : 'rounded-[22px] border bg-white/95 p-5 shadow-sm md:p-7',
        ].join(' ')}
      >
        <div className="flex shrink-0 flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4 md:pb-5">
          <div className="min-w-0">
            <VietMyAccentHeading as="h2" tone="onLight" size="lg">
              Bộ chấm điểm (Profiles)
            </VietMyAccentHeading>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-700 md:text-base">
              Mỗi profile là một “thấu kính” đánh giá cùng danh sách lead — điểm **tích lũy không trần 100**; nhãn HOT/WARM/COLD/LOSS theo **ngưỡng từng profile** (chỉnh trong form), mặc định 80/50.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {workspaceFullscreen ? (
              <button
                type="button"
                onClick={() => setWorkspaceFullscreen(false)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
              >
                <X className="h-4 w-4 shrink-0" aria-hidden />
                Đóng (Esc)
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setWorkspaceFullscreen(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-950 shadow-sm transition hover:bg-amber-100"
              >
                <Maximize2 className="h-4 w-4 shrink-0" aria-hidden />
                Toàn màn
              </button>
            )}
            {canEdit ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void createProfile()}
                className="rounded-xl border border-emerald-500 bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
              >
                + Tạo profile mới
              </button>
            ) : null}
          </div>
        </div>

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
            'mt-6 grid min-h-0 flex-1 gap-6 lg:grid-cols-[minmax(232px,280px)_1fr] lg:items-stretch',
            workspaceFullscreen ? 'min-h-0' : 'min-h-[480px]',
          ].join(' ')}
        >
          <aside className="order-2 flex min-h-0 max-h-[min(52vh,420px)] flex-col rounded-2xl border border-slate-200 bg-white/85 p-4 shadow-inner lg:order-1 lg:max-h-none">
            <p className="mb-3 shrink-0 text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
              Danh sách profile
            </p>
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5">
              {loading ? (
                <p className="w-full text-sm text-slate-600">Đang tải…</p>
              ) : !profiles.length ? (
                <p className="w-full rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  Chưa có profile. Bấm «Tạo profile mới» để bắt đầu.
                </p>
              ) : (
                <AnimatePresence initial={false} mode="popLayout">
                  {profiles.map((p) => (
                    <motion.button
                      key={p.id}
                      type="button"
                      layout
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                      onClick={() => selectProfile(p)}
                      className={[
                        'w-full rounded-2xl border px-4 py-3 text-left transition-all duration-300',
                        p.id === effectiveSelectedId
                          ? 'border-amber-400 bg-amber-50 shadow-md ring-2 ring-amber-200/80'
                          : 'border-slate-200 bg-white hover:border-amber-200 hover:bg-amber-50/40',
                      ].join(' ')}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 flex-1 font-semibold leading-snug text-slate-900">
                          {p.profileName.trim() || '—'}
                        </p>
                        {p.isDefaultForImport ? (
                          <span
                            className="shrink-0 rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white shadow-[0_0_14px_rgba(251,146,60,0.85),0_0_28px_rgba(249,115,22,0.35)] ring-2 ring-amber-200/70"
                            title="Profile mặc định toàn hệ thống"
                          >
                            DEFAULT
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{p.description || '—'}</p>
                      <p className="mt-2 text-xs text-slate-500">
                        {(p.ruleBlocks?.length ?? 0) || p.rules.length} khối · HOT ≥ {p.thresholds.hotMinScore} · WARM ≥{' '}
                        {p.thresholds.warmMinScore}
                      </p>
                    </motion.button>
                  ))}
                </AnimatePresence>
              )}
            </div>
          </aside>

          <div
            className={[
              'order-1 flex min-h-0 w-full min-w-0 flex-1 flex-col rounded-2xl border border-slate-200 bg-gradient-to-br from-sky-50/40 via-white to-amber-50/30 p-5 shadow-inner md:p-6 lg:order-2',
              workspaceFullscreen ? 'min-h-0 overflow-hidden' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {!selectedProfile ? (
              <p className="text-slate-600">Chưa có profile hoặc đang tải.</p>
            ) : (
              <ProfileEditorPanel
                key={`${selectedProfile.id}-${selectedProfile.updatedAt.toMillis()}`}
                db={db}
                profile={selectedProfile}
                allProfiles={profiles}
                canEdit={canEdit}
                busy={busy}
                setBusy={setBusy}
                setSaveMsg={setSaveMsg}
                onDeleted={() => setSelectedId(null)}
                workspaceLayout={workspaceFullscreen}
              />
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
