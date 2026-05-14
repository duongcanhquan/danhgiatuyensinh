import { useCallback, useEffect, useMemo, useState } from 'react'
import { deleteDoc, doc, setDoc, Timestamp, writeBatch } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import { motion, AnimatePresence } from 'motion/react'
import { ChevronRight, CircleHelp, Maximize2, X, ChevronsRight } from 'lucide-react'
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
          <button
            type="button"
            onClick={() => setMetaCollapsed(false)}
            aria-expanded={false}
            className="flex w-full items-center gap-2 rounded border border-transparent px-1 py-1 text-left transition hover:border-amber-200/80 hover:bg-white/80"
          >
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">
                {draft.profileName.trim() || 'Chưa đặt tên'}
              </p>
              <p className="truncate text-xs text-slate-600">
                HOT ≥{draft.thresholds.hotMinScore} · WARM ≥{draft.thresholds.warmMinScore}
                {draft.isDefaultForImport ? ' · Mặc định import' : ''}
                {draft.description.trim() ? ` · ${draft.description.trim().slice(0, 48)}${draft.description.trim().length > 48 ? '…' : ''}` : ''}
              </p>
            </div>
            <span className="shrink-0 text-xs font-medium text-amber-900">Mở rộng</span>
          </button>
        ) : (
          <>
            <div className="mb-1 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setMetaCollapsed(true)
                  setRuleLibraryCollapsed(true)
                }}
                aria-expanded={true}
                title="Thu gọn tên, ngưỡng, mô tả và cột thư viện — canvas rộng hơn"
                className="rounded px-2 py-0.5 text-xs font-semibold text-amber-900 underline-offset-2 hover:bg-amber-50 hover:underline"
              >
                Rút gọn
              </button>
            </div>
            <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-end sm:gap-x-2 sm:gap-y-1">
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
              <label
                className="flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded border border-slate-200/80 bg-white px-2 text-xs font-medium leading-none text-slate-800 sm:mb-0"
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
              <div className="flex flex-wrap items-end gap-1.5">
                <label className="w-12 text-xs font-medium leading-none text-slate-700">
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
                <label className="w-12 text-xs font-medium leading-none text-slate-700">
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
                  className="mb-0.5 flex h-8 items-end pb-0.5 text-slate-400 hover:text-slate-600"
                  title={thresholdExplainTitle}
                  aria-label={thresholdExplainTitle}
                >
                  <CircleHelp className="h-4 w-4 shrink-0" aria-hidden />
                </button>
              </div>
            </div>
            <label className="mt-1 block text-xs font-medium leading-none text-slate-700">
              Mô tả
              <textarea
                value={draft.description}
                disabled={!canEdit}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                rows={1}
                className="mt-0.5 max-h-14 min-h-[2rem] w-full resize-y rounded border border-slate-200 bg-white px-2 py-1 text-sm leading-snug text-slate-900 outline-none ring-amber-400/15 focus:ring-1 disabled:opacity-50"
              />
            </label>
          </>
        )}
      </div>

      <div
        className={[
          'border-t border-slate-200 pt-1.5',
          workspaceLayout ? 'flex min-h-0 flex-1 flex-col' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <p className="text-xs font-semibold leading-tight text-slate-800">
          Builder —{' '}
          <span className="font-normal text-slate-600">
            {metaCollapsed
              ? 'kéo mẫu vào canvas. Bấm «Mở rộng» phía trên để sửa tên, ngưỡng và mô tả.'
              : 'kéo mẫu trái → canvas; cộng dồn dòng; thu gọn thư viện khi cần.'}
          </span>
        </p>
        <div
          className={[
            'mt-1.5 grid min-h-0 flex-1 gap-2',
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
            />
          ) : null}
          <ProfileDropCanvas
            blocks={draft.ruleBlocks ?? []}
            onChange={(blocks) => setDraft((d) => ({ ...d, ruleBlocks: blocks }))}
            canEdit={canEdit}
            workspaceLayout={Boolean(workspaceLayout)}
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
            : 'rounded-[22px] border bg-white/95 p-3 shadow-sm md:p-4',
        ].join(' ')}
      >
        <div className="flex shrink-0 flex-wrap items-start justify-between gap-2 border-b border-slate-200 pb-2 md:pb-3">
          <div className="min-w-0">
            <VietMyAccentHeading as="h2" tone="onLight" size="lg">
              Bộ chấm điểm (Profiles)
            </VietMyAccentHeading>
            <p className="mt-0.5 max-w-2xl text-sm leading-snug text-slate-600">
              Chọn profile dưới đây; «Toàn màn» để kéo giãn builder.
            </p>
            <p className="mt-2 max-w-3xl rounded-lg border border-sky-200/80 bg-sky-50/70 px-3 py-2 text-xs leading-relaxed text-sky-950">
              <strong>Dữ liệu &amp; chấm điểm:</strong> engine so khớp <strong>bỏ dấu</strong>, gom khoảng trắng (vd. «Hà Nội» ≡ «ha
              noi»). Với <strong>IN_LIST</strong> tỉnh/ngành, nếu master có <code className="rounded bg-white/80 px-1">synonyms</code> trên
              từng mục thì từ đồng nghĩa cũng được tính. Nên tách cột Excel / Firestore: <strong>Ngành quan tâm</strong>,{' '}
              <strong>Học lực</strong>, <strong>Loại trường</strong> — trường <code className="rounded bg-white/80 px-1">schoolTypeKey</code>{' '}
              (PUBLIC / LIEN_KET / …) và <code className="rounded bg-white/80 px-1">majorTrainingAlignment</code> được bổ sung khi chấm
              nếu app truyền master buckets (mặc định đã bật trên bảng hồ sơ).
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {workspaceFullscreen ? (
              <button
                type="button"
                onClick={() => setWorkspaceFullscreen(false)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
              >
                <X className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Đóng (Esc)
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setWorkspaceFullscreen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 shadow-sm transition hover:bg-amber-100"
              >
                <Maximize2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Toàn màn
              </button>
            )}
            {canEdit ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void createProfile()}
                className="rounded-lg border border-emerald-500 bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
              >
                + Tạo profile
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
            'mt-2 flex min-h-0 flex-1 flex-col gap-1.5',
            workspaceFullscreen ? 'min-h-0 overflow-hidden' : 'min-h-[240px]',
          ].join(' ')}
        >
          <div className="flex shrink-0 items-stretch gap-1.5 rounded-lg border border-slate-200 bg-white/90 p-1 shadow-inner">
            <p className="flex w-[5.5rem] shrink-0 items-center justify-center rounded border border-slate-100 bg-slate-50 px-0.5 py-0.5 text-center text-xs font-bold uppercase leading-tight tracking-tight text-slate-600">
              Chọn profile
            </p>
            <div className="scroll-touch flex min-w-0 flex-1 gap-1 overflow-x-auto overflow-y-hidden py-0.5 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1">
              {loading ? (
                <p className="shrink-0 self-center text-xs text-slate-600">Đang tải…</p>
              ) : !profiles.length ? (
                <p className="min-w-0 shrink-0 self-center rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700">
                  Chưa có profile — bấm «Tạo profile».
                </p>
              ) : (
                <AnimatePresence initial={false} mode="popLayout">
                  {profiles.map((p) => {
                    const meta = `${(p.ruleBlocks?.length ?? 0) || p.rules.length} · ${p.thresholds.hotMinScore}/${p.thresholds.warmMinScore}`
                    const title = [p.profileName.trim() || '—', p.description?.trim() || '—', meta].join(' · ')
                    return (
                    <motion.button
                      key={p.id}
                      type="button"
                      layout
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                      title={title}
                      onClick={() => selectProfile(p)}
                      className={[
                        'flex h-9 max-w-[12.5rem] shrink-0 items-center gap-2 rounded border px-2 text-left transition-all duration-200',
                        p.id === effectiveSelectedId
                          ? 'border-amber-400 bg-amber-50 shadow-sm ring-1 ring-amber-200/80'
                          : 'border-slate-200 bg-white hover:border-amber-200 hover:bg-amber-50/40',
                      ].join(' ')}
                    >
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-none text-slate-900">
                        {p.profileName.trim() || '—'}
                      </span>
                      {p.isDefaultForImport ? (
                        <span
                          className="shrink-0 rounded bg-amber-500 px-1 py-0.5 text-[10px] font-extrabold uppercase text-white"
                          title="Mặc định"
                        >
                          D
                        </span>
                      ) : null}
                      <span className="shrink-0 font-mono text-xs tabular-nums leading-none text-slate-500">
                        {meta}
                      </span>
                    </motion.button>
                    )
                  })}
                </AnimatePresence>
              )}
            </div>
          </div>

          <div
            className={[
              'flex min-h-0 w-full min-w-0 flex-1 flex-col rounded-lg border border-slate-200 bg-gradient-to-br from-sky-50/40 via-white to-amber-50/30 p-2 shadow-inner md:p-2',
              workspaceFullscreen ? 'min-h-0 overflow-hidden' : '',
            ].join(' ')}
          >
            {!selectedProfile ? (
              <p className="text-sm text-slate-600">Chưa có profile hoặc đang tải.</p>
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
