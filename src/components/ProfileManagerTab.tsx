import { useCallback, useEffect, useMemo, useState } from 'react'
import { deleteDoc, doc, setDoc, Timestamp } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import { motion, AnimatePresence } from 'motion/react'
import { Maximize2, X } from 'lucide-react'
import type { ScoringProfile } from '../types'
import { FS_COLLECTIONS } from '../types'
import { useScoringProfiles } from '../hooks/useScoringProfiles'
import { useAuth } from '../hooks/useAuth'
import { isProfileOverBudget } from '../utils/scoring'
import { ProfileDropCanvas } from './ProfileDropCanvas'
import { RuleLibrarySidebar } from './RuleLibrarySidebar'
import { VietMyAccentHeading } from './VietMyAccentHeading'

function emptyProfileDraft(): Omit<ScoringProfile, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    profileName: 'Profile mới',
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
  canEdit,
  busy,
  setBusy,
  setSaveMsg,
  onDeleted,
  workspaceLayout,
}: {
  db: Firestore
  profile: ScoringProfile
  canEdit: boolean
  busy: boolean
  setBusy: (v: boolean) => void
  setSaveMsg: (v: string | null) => void
  onDeleted: () => void
  workspaceLayout?: boolean
}) {
  const [draft, setDraft] = useState(() => cloneProfile(profile))
  const overBudget = isProfileOverBudget(draft.ruleBlocks)

  const saveProfile = useCallback(async () => {
    if (!canEdit || isProfileOverBudget(draft.ruleBlocks)) return
    setBusy(true)
    setSaveMsg(null)
    try {
      const t = Timestamp.now()
      const ref = doc(db, FS_COLLECTIONS.scoringProfiles, draft.id)
      await setDoc(
        ref,
        {
          profileName: draft.profileName.trim(),
          description: draft.description.trim(),
          rules: [],
          ruleBlocks: (draft.ruleBlocks ?? []).map((b) => ({
            id: b.id,
            category: b.category,
            label: b.label.trim(),
            targetField: b.targetField,
            maxWeight: Math.min(100, Math.max(0, Number(b.maxWeight) || 0)),
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
        },
        { merge: true },
      )
      setSaveMsg('Đã lưu profile.')
    } catch (e) {
      console.error(e)
      setSaveMsg('Lưu thất bại — kiểm tra Firestore Rules.')
    } finally {
      setBusy(false)
    }
  }, [db, draft, canEdit, setBusy, setSaveMsg])

  const deleteProfile = useCallback(async () => {
    if (!canEdit) return
    if (!window.confirm(`Xóa profile «${draft.profileName}»?`)) return
    setBusy(true)
    try {
      await deleteDoc(doc(db, FS_COLLECTIONS.scoringProfiles, draft.id))
      onDeleted()
    } finally {
      setBusy(false)
    }
  }, [db, draft, canEdit, setBusy, onDeleted])

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
        <label className="block text-sm font-medium text-slate-200">
          Tên profile
          <input
            value={draft.profileName}
            disabled={!canEdit}
            onChange={(e) => setDraft({ ...draft, profileName: e.target.value })}
            className="mt-1.5 w-full rounded-xl border border-white/15 bg-slate-950/60 px-3 py-2.5 text-base text-white outline-none ring-amber-400/30 focus:ring-2 disabled:opacity-50"
          />
        </label>
        <label className="flex items-center gap-2 pt-7 text-sm text-slate-300 md:pt-8">
          <input
            type="checkbox"
            checked={Boolean(draft.isDefaultForImport)}
            disabled={!canEdit}
            onChange={(e) => setDraft({ ...draft, isDefaultForImport: e.target.checked })}
            className="h-4 w-4 rounded border-white/30 bg-slate-900"
          />
          Dùng làm mặc định khi nhập Excel
        </label>
      </div>
      <label className="block text-sm font-medium text-slate-200">
        Mô tả
        <textarea
          value={draft.description}
          disabled={!canEdit}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          rows={2}
          className="mt-1.5 w-full rounded-xl border border-white/15 bg-slate-950/60 px-3 py-2.5 text-base text-white outline-none ring-amber-400/30 focus:ring-2 disabled:opacity-50"
        />
      </label>

      <div className="grid gap-4 rounded-xl border border-white/10 bg-slate-950/30 p-4 md:grid-cols-2">
        <label className="text-sm font-medium text-slate-200">
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
            className="mt-1.5 w-full rounded-xl border border-white/15 bg-slate-950/60 px-3 py-2.5 text-base text-white disabled:opacity-50"
          />
        </label>
        <label className="text-sm font-medium text-slate-200">
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
            className="mt-1.5 w-full rounded-xl border border-white/15 bg-slate-950/60 px-3 py-2.5 text-base text-white disabled:opacity-50"
          />
        </label>
        <p className="md:col-span-2 text-xs text-slate-500">
          Dưới ngưỡng WARM là COLD. Nên đặt HOT &gt; WARM (vd. HOT 80, WARM 50).
        </p>
      </div>

      <div
        className={[
          'border-t border-white/10 pt-5',
          workspaceLayout ? 'flex min-h-0 flex-1 flex-col' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <p className="text-sm font-semibold text-slate-200">Scoring Profile Builder</p>
        <p className="mt-1 text-xs text-slate-500">
          Kéo mẫu từ thư viện, chỉnh Max weight và nhiều điều kiện trong từng khối. Tổng Max weight = 100 để lưu.
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
        <div className="flex shrink-0 flex-wrap gap-3 border-t border-white/10 pt-4">
          <button
            type="button"
            disabled={busy || overBudget}
            onClick={() => void saveProfile()}
            className="rounded-xl border border-amber-400/50 bg-gradient-to-r from-amber-500/30 to-emerald-500/25 px-6 py-3 text-sm font-bold text-white shadow-lg transition hover:from-amber-500/45 hover:to-emerald-500/35 disabled:opacity-50"
            title={overBudget ? 'Tổng Max weight vượt 100 — điều chỉnh trước khi lưu' : undefined}
          >
            {busy ? 'Đang lưu…' : 'Lưu profile'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void deleteProfile()}
            className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-100 hover:bg-rose-500/20 disabled:opacity-50"
          >
            Xóa profile
          </button>
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
          ? 'fixed inset-0 z-[200] flex flex-col overflow-hidden bg-slate-950 p-3 shadow-[0_0_0_1px_rgba(255,255,255,0.08)] sm:p-4 md:p-5'
          : 'overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-1 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl',
      ].join(' ')}
    >
      <div
        className={[
          'flex min-h-0 flex-col border-white/10',
          workspaceFullscreen
            ? 'h-full min-h-0 flex-1 overflow-hidden rounded-2xl border bg-slate-950/70 p-4 md:p-5'
            : 'rounded-[22px] border bg-slate-950/40 p-5 md:p-7',
        ].join(' ')}
      >
        <div className="flex shrink-0 flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-4 md:pb-5">
          <div className="min-w-0">
            <VietMyAccentHeading as="h2" tone="onDark" size="lg">
              Bộ chấm điểm (Profiles)
            </VietMyAccentHeading>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-300 md:text-base">
              Mỗi profile là một “thấu kính” đánh giá cùng danh sách lead — điểm tối đa 100, ngưỡng HOT/WARM tùy chỉnh.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {workspaceFullscreen ? (
              <button
                type="button"
                onClick={() => setWorkspaceFullscreen(false)}
                className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-white/15"
              >
                <X className="h-4 w-4 shrink-0" aria-hidden />
                Đóng (Esc)
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setWorkspaceFullscreen(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-amber-400/35 bg-amber-500/15 px-4 py-2.5 text-sm font-semibold text-amber-50 shadow-lg transition hover:bg-amber-500/25"
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
                className="rounded-xl border border-emerald-400/40 bg-emerald-500/20 px-4 py-2.5 text-sm font-semibold text-emerald-100 shadow-lg transition hover:bg-emerald-500/35 disabled:opacity-50"
              >
                + Tạo profile mới
              </button>
            ) : null}
          </div>
        </div>

        {!canEdit ? (
          <p className="mt-4 shrink-0 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            Bạn không có quyền <code className="text-amber-50">config:scoring_rules</code> — chỉ xem được danh sách.
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 shrink-0 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </p>
        ) : null}
        {saveMsg ? (
          <p className="mt-4 shrink-0 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {saveMsg}
          </p>
        ) : null}

        <div
          className={[
            'mt-6 flex min-h-0 flex-1 flex-col gap-6',
            workspaceFullscreen ? 'min-h-0' : 'min-h-[480px]',
          ].join(' ')}
        >
          <div
            className={[
              'flex min-h-0 w-full flex-1 flex-col rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.02] p-5 shadow-inner backdrop-blur-md md:p-6',
              workspaceFullscreen ? 'min-h-0 overflow-hidden' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {!selectedProfile ? (
              <p className="text-slate-400">Chưa có profile hoặc đang tải.</p>
            ) : (
              <ProfileEditorPanel
                key={`${selectedProfile.id}-${selectedProfile.updatedAt.toMillis()}`}
                db={db}
                profile={selectedProfile}
                canEdit={canEdit}
                busy={busy}
                setBusy={setBusy}
                setSaveMsg={setSaveMsg}
                onDeleted={() => setSelectedId(null)}
                workspaceLayout={workspaceFullscreen}
              />
            )}
          </div>

          <aside className="shrink-0 border-t border-white/10 pt-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Danh sách profile</p>
            <div className="flex max-h-[min(40vh,280px)] flex-wrap gap-2 overflow-y-auto pr-1 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5">
              {loading ? (
                <p className="w-full text-sm text-slate-400">Đang tải…</p>
              ) : !profiles.length ? (
                <p className="w-full rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
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
                        'min-w-[min(100%,220px)] max-w-[min(100%,280px)] flex-1 rounded-2xl border px-4 py-3 text-left transition-all duration-300 sm:min-w-[200px] sm:flex-none',
                        p.id === effectiveSelectedId
                          ? 'border-white/25 bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]'
                          : 'border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.07]',
                      ].join(' ')}
                    >
                      <p className="font-semibold text-white">{p.profileName}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-slate-400">{p.description || '—'}</p>
                      <p className="mt-2 text-[11px] text-slate-500">
                        {(p.ruleBlocks?.length ?? 0) || p.rules.length} khối · HOT ≥ {p.thresholds.hotMinScore} · WARM ≥{' '}
                        {p.thresholds.warmMinScore}
                        {p.isDefaultForImport ? ' · Mặc định import' : ''}
                      </p>
                    </motion.button>
                  ))}
                </AnimatePresence>
              )}
            </div>
          </aside>
        </div>
      </div>
    </section>
  )
}
