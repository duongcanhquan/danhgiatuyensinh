import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  Loader2,
  MapPin,
  PhoneCall,
  RotateCcw,
  Save,
  Settings2,
  Target,
  Trash2,
  Trophy,
} from 'lucide-react'
import type {
  KpiDailyMetricKey,
  KpiEvaluationConfigPersisted,
  KpiSourceBucket,
  KpiStaffRole,
  KpiV2ConfigPersisted,
} from '../types'
import { useKpiEvaluationRules } from '../contexts/KpiEvaluationRulesContext'
import { useKpiV2Config } from '../contexts/KpiV2ConfigContext'
import { countBusinessDaysInMonth, todayDayKeyVn } from '../utils/businessDays'
import {
  getDefaultKpiEvaluationRules,
  mergeKpiEvaluationRules,
} from '../utils/kpiEvaluationRules'
import { getDefaultKpiV2Config, mergeDailyTargets, mergeKpiV2Config } from '../utils/kpiV2Config'
import { HelpHintPopover } from './HelpHintPopover'
import { KPI_GUIDE_HINTS } from './kpiGuideHints'
import { KpiSourceMapEditor } from './KpiSourceMapEditor'

type TabId = 'targets' | 'catalog' | 'ops'

const ROLE_LABELS: Record<KpiStaffRole, string> = {
  ctv: 'CTV',
  counselor: 'Nhân viên TVV',
  team_lead: 'Trưởng nhóm',
}

const KPI_STAFF_ROLES: KpiStaffRole[] = ['ctv', 'counselor', 'team_lead']

const DAILY_TARGET_FIELDS: { key: KpiDailyMetricKey; label: string }[] = [
  { key: 'validCalls', label: 'Gọi HL' },
  { key: 'leadCham', label: 'Lead chạm' },
  { key: 'connectedCalls', label: 'Bắt máy' },
  { key: 'outboundCalls', label: 'Gọi đi' },
  { key: 'warmHot', label: 'Warm/Hot' },
  { key: 'newToInterested', label: 'NEW → Quan tâm' },
  { key: 'lpxtCount', label: 'LPXT' },
  { key: 'depositPaidCount', label: 'Cọc' },
  { key: 'toEnrolled', label: 'Nhập học' },
]

function patchRoleDailyTarget(
  draft: KpiV2ConfigPersisted,
  role: KpiStaffRole,
  bucket: Exclude<KpiSourceBucket, 'all'>,
  key: KpiDailyMetricKey,
  value: number,
): KpiV2ConfigPersisted {
  const roleTargets = { ...draft.dailyTargets[role] }
  const bucketTargets = { ...roleTargets[bucket], [key]: Math.max(0, value) }
  roleTargets[bucket] = bucketTargets
  roleTargets.all = mergeDailyTargets(roleTargets.off, roleTargets.mkt)
  return {
    ...draft,
    dailyTargets: { ...draft.dailyTargets, [role]: roleTargets },
  }
}

function NumField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  hint,
  disabled,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
  step?: number
  hint?: string
  disabled?: boolean
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step ?? 1}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-500/25 disabled:opacity-60"
      />
      {hint ? <span className="mt-0.5 block text-xs font-normal text-slate-500">{hint}</span> : null}
    </label>
  )
}

function TextField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string
  value: string
  onChange: (s: string) => void
  disabled?: boolean
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <input
        type="text"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-500/25 disabled:opacity-60"
      />
    </label>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={[
        'min-h-10 rounded-xl px-4 py-2 text-sm font-semibold transition duration-200',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]',
        active ? 'bg-[var(--color-primary)] text-white shadow-sm' : 'text-slate-700 hover:bg-white',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

export function KpiSettingsPanel({ canEdit }: { canEdit: boolean }) {
  const v2Ctx = useKpiV2Config()
  const rulesCtx = useKpiEvaluationRules()
  const [tab, setTab] = useState<TabId>('targets')
  const [roleTab, setRoleTab] = useState<KpiStaffRole>('counselor')
  const [v2Draft, setV2Draft] = useState<KpiV2ConfigPersisted | null>(null)
  const [rulesDraft, setRulesDraft] = useState<KpiEvaluationConfigPersisted>(() => rulesCtx.merged)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const v2Working = v2Draft ?? v2Ctx.config
  const monthKey = useMemo(() => todayDayKeyVn().slice(0, 7), [])
  const bizDays = useMemo(
    () => countBusinessDaysInMonth(monthKey, v2Working.businessHolidays),
    [monthKey, v2Working.businessHolidays],
  )

  useEffect(() => {
    setRulesDraft(rulesCtx.merged)
  }, [rulesCtx.merged])

  const patchV2 = useCallback(
    (fn: (d: KpiV2ConfigPersisted) => KpiV2ConfigPersisted) => {
      setV2Draft((prev) => fn(mergeKpiV2Config(prev ?? v2Ctx.config)))
    },
    [v2Ctx.config],
  )

  const patchRules = useCallback((fn: (d: KpiEvaluationConfigPersisted) => KpiEvaluationConfigPersisted) => {
    setRulesDraft((d) => fn(d))
  }, [])

  const savePolicy = async () => {
    if (!canEdit) return
    setBusy(true)
    setMsg(null)
    try {
      const payload = mergeKpiV2Config({ ...v2Working, enabled: true })
      await v2Ctx.saveConfig(payload)
      setV2Draft(null)
      setMsg('Đã lưu — điểm tháng và chỉ tiêu áp dụng ngay.')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Không lưu được chính sách KPI.')
    } finally {
      setBusy(false)
    }
  }

  const saveOps = async () => {
    if (!canEdit) return
    setBusy(true)
    setMsg(null)
    try {
      const clean = mergeKpiEvaluationRules(rulesDraft)
      const { goldMaxPercentile, silverMaxPercentile, bronzeMaxPercentile } = clean.bonusTiers
      if (silverMaxPercentile <= goldMaxPercentile || bronzeMaxPercentile <= silverMaxPercentile) {
        setMsg('Hạng thưởng: Vàng < Bạc < Đồng (phần trăm xếp hạng).')
        return
      }
      await rulesCtx.saveRules(clean)
      setMsg('Đã lưu cấu hình vận hành.')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Không lưu được — kiểm tra quyền Firestore.')
    } finally {
      setBusy(false)
    }
  }

  const resetV2 = async () => {
    if (!canEdit || !window.confirm('Xóa cấu hình KPI v2 trên server và dùng mặc định app?')) return
    setBusy(true)
    setMsg(null)
    try {
      await v2Ctx.resetToBuiltin()
      setV2Draft(getDefaultKpiV2Config())
      setMsg('Đã reset chính sách KPI v2.')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Không reset được.')
    } finally {
      setBusy(false)
    }
  }

  const resetOps = async () => {
    if (!canEdit || !window.confirm('Xóa cấu hình vận hành trên server và dùng mặc định app?')) return
    setBusy(true)
    setMsg(null)
    try {
      await rulesCtx.resetToBuiltin()
      setRulesDraft(getDefaultKpiEvaluationRules())
      setMsg('Đã reset cấu hình vận hành.')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Không reset được.')
    } finally {
      setBusy(false)
    }
  }

  const loading = v2Ctx.loading || rulesCtx.loading

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Đang tải cấu hình KPI…
      </p>
    )
  }

  return (
    <div className="space-y-5">
      {(v2Ctx.error || rulesCtx.error) && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {v2Ctx.error ?? rulesCtx.error}
        </div>
      )}

      <div
        className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1"
        role="tablist"
        aria-label="Cấu hình KPI"
      >
        <TabButton active={tab === 'targets'} onClick={() => setTab('targets')}>
          <span className="inline-flex items-center gap-1.5">
            <Target className="h-4 w-4" aria-hidden />
            Chỉ tiêu
          </span>
        </TabButton>
        <TabButton active={tab === 'catalog'} onClick={() => setTab('catalog')}>
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4" aria-hidden />
            Lịch &amp; nguồn
          </span>
        </TabButton>
        <TabButton active={tab === 'ops'} onClick={() => setTab('ops')}>
          <span className="inline-flex items-center gap-1.5">
            <Settings2 className="h-4 w-4" aria-hidden />
            Vận hành
          </span>
        </TabButton>
      </div>

      {msg ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">{msg}</p>
      ) : null}

      {tab === 'targets' ? (
        <section role="tabpanel" className="space-y-4 rounded-2xl border border-[var(--color-primary)]/35 bg-white p-4 shadow-sm">
          {!v2Ctx.docExists ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Chưa lưu trên Firestore — đang xem mặc định PDF.
            </p>
          ) : null}

          <p className="text-xs text-slate-500" title="Ngày hành chính trong tháng">
            {monthKey} · {bizDays} ngày làm việc
          </p>

          <div>
            <p className="text-sm font-semibold text-slate-900">Chỉ tiêu ngày &amp; điểm tháng theo vai trò</p>
            <div
              className="mt-2 flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1"
              role="tablist"
              aria-label="Vai trò KPI"
            >
              {KPI_STAFF_ROLES.map((role) => (
                <button
                  key={role}
                  type="button"
                  role="tab"
                  aria-selected={roleTab === role}
                  onClick={() => setRoleTab(role)}
                  className={[
                    'min-h-9 cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold transition duration-150',
                    roleTab === role ? 'bg-white text-[var(--color-primary)] shadow-sm' : 'text-slate-600 hover:bg-white/70',
                  ].join(' ')}
                >
                  {ROLE_LABELS[role]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-emerald-200/80 bg-emerald-50/30 p-3">
              <p className="text-xs font-bold uppercase text-emerald-900">Nguồn OFF — {ROLE_LABELS[roleTab]}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {DAILY_TARGET_FIELDS.map(({ key, label }) => (
                  <NumField
                    key={`off-${key}`}
                    label={`${label} / ngày`}
                    value={v2Working.dailyTargets[roleTab].off[key] ?? 0}
                    min={0}
                    disabled={!canEdit || busy}
                    onChange={(n) => patchV2((d) => patchRoleDailyTarget(d, roleTab, 'off', key, n))}
                  />
                ))}
              </div>
            </section>
            <section className="rounded-xl border border-sky-200/80 bg-sky-50/30 p-3">
              <p className="text-xs font-bold uppercase text-sky-900">Nguồn MKT — {ROLE_LABELS[roleTab]}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {DAILY_TARGET_FIELDS.map(({ key, label }) => (
                  <NumField
                    key={`mkt-${key}`}
                    label={`${label} / ngày`}
                    value={v2Working.dailyTargets[roleTab].mkt[key] ?? 0}
                    min={0}
                    disabled={!canEdit || busy}
                    onChange={(n) => patchV2((d) => patchRoleDailyTarget(d, roleTab, 'mkt', key, n))}
                  />
                ))}
              </div>
            </section>
          </div>

          <p className="text-xs text-slate-500">
            Tổng ngày (OFF+MKT) dùng chấm điểm tháng — ví dụ HL:{' '}
            <strong>{v2Working.dailyTargets[roleTab].all.validCalls ?? 0}</strong>/ngày × {bizDays} ngày HC.
          </p>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="px-3 py-2">Vai trò</th>
                  <th className="px-3 py-2">HL / ngày</th>
                  <th className="px-3 py-2">HL / tháng</th>
                  <th className="px-3 py-2">Trọng số HL</th>
                  <th className="px-3 py-2">Lead chạm</th>
                  <th className="px-3 py-2">Warm</th>
                  <th className="px-3 py-2">Cọc</th>
                  <th className="px-3 py-2">NH</th>
                </tr>
              </thead>
              <tbody>
                {KPI_STAFF_ROLES.map((role) => (
                  <tr key={role} className="border-b border-slate-100">
                    <td className="px-3 py-2 font-medium">{ROLE_LABELS[role]}</td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        disabled={!canEdit || busy}
                        value={v2Working.monthlyCallTargets[role].perDay}
                        onChange={(e) => {
                          const perDay = Number(e.target.value)
                          patchV2((d) => ({
                            ...d,
                            monthlyCallTargets: {
                              ...d.monthlyCallTargets,
                              [role]: {
                                perDay,
                                perMonth: Math.round(perDay * bizDays),
                              },
                            },
                          }))
                        }}
                        className="w-16 rounded border border-slate-200 px-1 py-0.5 tabular-nums"
                      />
                    </td>
                    <td className="px-3 py-2 tabular-nums text-slate-600">
                      {v2Working.monthlyCallTargets[role].perMonth}
                      <span className="ml-1 text-[10px] text-slate-400">({bizDays}d)</span>
                    </td>
                    {(['validCalls', 'leadCham', 'warm', 'deposit'] as const).map((key) => (
                      <td key={key} className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          disabled={!canEdit || busy}
                          value={v2Working.monthlyScoreWeights[role][key]}
                          onChange={(e) =>
                            patchV2((d) => ({
                              ...d,
                              monthlyScoreWeights: {
                                ...d.monthlyScoreWeights,
                                [role]: { ...d.monthlyScoreWeights[role], [key]: Number(e.target.value) },
                              },
                            }))
                          }
                          className="w-12 rounded border border-slate-200 px-1 py-0.5"
                        />
                      </td>
                    ))}
                    <td className="px-3 py-2">
                      {role === 'ctv' ? (
                        <span className="tabular-nums text-slate-400">—</span>
                      ) : (
                        <input
                          type="number"
                          min={0}
                          max={100}
                          disabled={!canEdit || busy}
                          value={v2Working.monthlyScoreWeights[role].enrolled ?? 0}
                          onChange={(e) =>
                            patchV2((d) => ({
                              ...d,
                              monthlyScoreWeights: {
                                ...d.monthlyScoreWeights,
                                [role]: {
                                  ...d.monthlyScoreWeights[role],
                                  enrolled: Number(e.target.value),
                                },
                              },
                            }))
                          }
                          className="w-12 rounded border border-slate-200 px-1 py-0.5"
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={v2Working.rankByKpiScoreOnly}
              disabled={!canEdit || busy}
              onChange={(e) => patchV2((d) => ({ ...d, rankByKpiScoreOnly: e.target.checked }))}
            />
            Hạng thưởng chỉ theo điểm KPI (không xếp doanh thu)
          </label>

          {canEdit ? (
            <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                disabled={busy}
                onClick={() => void savePolicy()}
                className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Lưu chỉ tiêu
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void resetV2()}
                className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                Reset v2
              </button>
            </div>
          ) : (
            <p className="text-sm text-amber-900">Chỉ xem — cần quyền cấu hình quy tắc chấm điểm.</p>
          )}
        </section>
      ) : null}

      {tab === 'catalog' ? (
        <section role="tabpanel" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <CalendarDays className="h-4 w-4 text-[var(--color-primary)]" aria-hidden />
                Ngày hành chính &amp; lễ
              </p>
              <p className="mt-1 text-xs text-slate-600">
                Tháng hiện tại: <strong>{bizDays}</strong> ngày làm việc (trừ T7/CN + lễ).
              </p>
              <label className="mt-3 block text-sm">
                Ngày lễ (YYYY-MM-DD, mỗi dòng)
                <textarea
                  rows={5}
                  disabled={!canEdit || busy}
                  value={v2Working.businessHolidays.join('\n')}
                  onChange={(e) =>
                    patchV2((d) => ({
                      ...d,
                      businessHolidays: e.target.value
                        .split(/\r?\n/)
                        .map((x) => x.trim())
                        .filter(Boolean),
                    }))
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs"
                  placeholder="2026-04-30"
                />
              </label>
            </section>

            <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <p className="text-sm font-semibold text-slate-900">Ngày bắt đầu đếm metric mới</p>
              <p className="mt-1 text-xs text-slate-600">
                Lead chạm / LPXT trên server chỉ cộng từ ngày này (không backfill). Điểm tháng trên app dùng config
                ngay khi bạn Lưu.
              </p>
              <label className="mt-3 block text-sm">
                Ngày áp dụng
                <input
                  type="date"
                  disabled={!canEdit || busy}
                  value={v2Working.goLiveDate}
                  onChange={(e) => patchV2((d) => ({ ...d, goLiveDate: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
                />
              </label>
            </section>
          </div>

          <section className="rounded-xl border border-slate-200 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <MapPin className="h-4 w-4 text-emerald-700" aria-hidden />
              Phân loại nguồn lead (OFF / MKT)
            </p>
            <p className="mt-1 text-xs text-slate-600">Khớp nhãn trường nguồn trên hồ sơ — dùng cho chỉ tiêu ngày OFF/MKT.</p>
            <div className="mt-3">
              <KpiSourceMapEditor
                value={v2Working.sourceBucketByLabel}
                disabled={!canEdit || busy}
                onChange={(sourceBucketByLabel) => patchV2((d) => ({ ...d, sourceBucketByLabel }))}
              />
            </div>
          </section>

          {canEdit ? (
            <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                disabled={busy}
                onClick={() => void savePolicy()}
                className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Lưu lịch &amp; nguồn
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === 'ops' ? (
        <section role="tabpanel" className="space-y-4">
          <section className="rounded-2xl border border-[var(--color-primary)]/35 bg-[var(--color-primary-soft)]/40 p-4 shadow-sm">
            <p className="text-sm font-semibold text-slate-900">Ngưỡng đếm KPI (cuộc gọi &amp; tài chính)</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <NumField
                label="LPXT tối thiểu (VNĐ)"
                value={v2Working.lpxtMinVnd}
                min={1}
                step={1000}
                disabled={!canEdit || busy}
                onChange={(n) => patchV2((d) => ({ ...d, lpxtMinVnd: n }))}
              />
              <NumField
                label="Lead chạm từ (giây)"
                value={v2Working.leadChamMinSeconds}
                min={1}
                disabled={!canEdit || busy}
                onChange={(n) => patchV2((d) => ({ ...d, leadChamMinSeconds: n }))}
              />
              <NumField
                label="Nghe máy từ (giây)"
                value={v2Working.leadChamMaxSecondsExclusive}
                min={2}
                disabled={!canEdit || busy}
                hint="≥ giá trị này = gọi HL"
                onChange={(n) => patchV2((d) => ({ ...d, leadChamMaxSecondsExclusive: n }))}
              />
            </div>
            {canEdit ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void savePolicy()}
                className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[var(--color-primary)]/35 bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-primary)] transition hover:bg-[var(--color-primary-soft)] disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Lưu ngưỡng
              </button>
            ) : null}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 font-semibold text-slate-900">
              <PhoneCall className="h-4 w-4 text-sky-700" aria-hidden />
              Cuộc gọi hợp lệ (HL)
              <HelpHintPopover title="Gọi hợp lệ" hint={KPI_GUIDE_HINTS.validCall} align="left" />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <NumField
                label="Thời lượng tối thiểu (giây)"
                value={rulesDraft.validCall.minBillSeconds}
                min={10}
                max={600}
                disabled={!canEdit || busy}
                onChange={(n) => patchRules((d) => ({ ...d, validCall: { ...d.validCall, minBillSeconds: n } }))}
              />
              <NumField
                label="Không trùng lead (giờ)"
                value={rulesDraft.validCall.dedupWindowHours}
                min={1}
                max={24}
                disabled={!canEdit || busy}
                onChange={(n) =>
                  patchRules((d) => ({ ...d, validCall: { ...d.validCall, dedupWindowHours: n } }))
                }
              />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="flex items-center gap-2 font-semibold text-slate-900">
              <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />
              Cảnh báo Điều hành
              <HelpHintPopover title="Cảnh báo" hint={KPI_GUIDE_HINTS.warnings} align="left" />
            </p>
            <div className="mt-3 grid gap-4 lg:grid-cols-3">
              {(
                [
                  ['spam', 'amber'],
                  ['noDeposit', 'orange'],
                  ['lowConnect', 'sky'],
                ] as const
              ).map(([key, tone]) => {
                const w = rulesDraft.warnings[key]
                const border =
                  tone === 'amber'
                    ? 'border-amber-100 bg-amber-50/50'
                    : tone === 'orange'
                      ? 'border-orange-100 bg-orange-50/50'
                      : 'border-sky-100 bg-sky-50/50'
                return (
                  <div key={key} className={`space-y-2 rounded-xl border p-3 ${border}`}>
                    <TextField
                      label="Nhãn"
                      value={w.label}
                      disabled={!canEdit || busy}
                      onChange={(label) =>
                        patchRules((d) => ({
                          ...d,
                          warnings: { ...d.warnings, [key]: { ...d.warnings[key], label } },
                        }))
                      }
                    />
                    {'minTotalCalls' in w ? (
                      <NumField
                        label="Tối thiểu tổng gọi"
                        value={w.minTotalCalls}
                        min={1}
                        disabled={!canEdit || busy}
                        onChange={(n) =>
                          patchRules((d) => ({
                            ...d,
                            warnings: { ...d.warnings, [key]: { ...d.warnings[key], minTotalCalls: n } },
                          }))
                        }
                      />
                    ) : null}
                    {'minValidRatio' in w ? (
                      <NumField
                        label="Tỷ lệ HL tối thiểu (0–1)"
                        value={w.minValidRatio}
                        min={0.05}
                        max={1}
                        step={0.05}
                        disabled={!canEdit || busy}
                        onChange={(n) =>
                          patchRules((d) => ({
                            ...d,
                            warnings: { ...d.warnings, [key]: { ...d.warnings[key], minValidRatio: n } },
                          }))
                        }
                      />
                    ) : null}
                    {'maxConnectRatio' in w ? (
                      <NumField
                        label="Tỷ lệ bắt máy tối thiểu (0–1)"
                        value={w.maxConnectRatio}
                        min={0.05}
                        max={1}
                        step={0.05}
                        disabled={!canEdit || busy}
                        onChange={(n) =>
                          patchRules((d) => ({
                            ...d,
                            warnings: { ...d.warnings, [key]: { ...d.warnings[key], maxConnectRatio: n } },
                          }))
                        }
                      />
                    ) : null}
                  </div>
                )
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 font-semibold text-slate-900">
              <Trophy className="h-4 w-4 text-[var(--color-primary)]" aria-hidden />
              Hạng thưởng (percentile điểm KPI)
              <HelpHintPopover title="Hạng thưởng" hint={KPI_GUIDE_HINTS.bonusTiers} align="left" />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <NumField
                label="Vàng — top % (0–1)"
                value={rulesDraft.bonusTiers.goldMaxPercentile}
                min={0.01}
                max={0.5}
                step={0.01}
                disabled={!canEdit || busy}
                onChange={(n) =>
                  patchRules((d) => ({ ...d, bonusTiers: { ...d.bonusTiers, goldMaxPercentile: n } }))
                }
              />
              <NumField
                label="Bạc — top %"
                value={rulesDraft.bonusTiers.silverMaxPercentile}
                min={0.05}
                max={0.9}
                step={0.01}
                disabled={!canEdit || busy}
                onChange={(n) =>
                  patchRules((d) => ({ ...d, bonusTiers: { ...d.bonusTiers, silverMaxPercentile: n } }))
                }
              />
              <NumField
                label="Đồng — top %"
                value={rulesDraft.bonusTiers.bronzeMaxPercentile}
                min={0.1}
                max={1}
                step={0.01}
                disabled={!canEdit || busy}
                onChange={(n) =>
                  patchRules((d) => ({ ...d, bonusTiers: { ...d.bonusTiers, bronzeMaxPercentile: n } }))
                }
              />
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <TextField
                label="Nhãn Vàng"
                value={rulesDraft.bonusTiers.labelGold}
                disabled={!canEdit || busy}
                onChange={(labelGold) =>
                  patchRules((d) => ({ ...d, bonusTiers: { ...d.bonusTiers, labelGold } }))
                }
              />
              <TextField
                label="Nhãn Bạc"
                value={rulesDraft.bonusTiers.labelSilver}
                disabled={!canEdit || busy}
                onChange={(labelSilver) =>
                  patchRules((d) => ({ ...d, bonusTiers: { ...d.bonusTiers, labelSilver } }))
                }
              />
              <TextField
                label="Nhãn Đồng"
                value={rulesDraft.bonusTiers.labelBronze}
                disabled={!canEdit || busy}
                onChange={(labelBronze) =>
                  patchRules((d) => ({ ...d, bonusTiers: { ...d.bonusTiers, labelBronze } }))
                }
              />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="font-semibold text-slate-900">Kế toán duyệt</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <TextField
                label="Trạng thái duyệt cọc/HP"
                value={rulesDraft.finance.approvalStatus}
                disabled={!canEdit || busy}
                onChange={(approvalStatus) =>
                  patchRules((d) => ({ ...d, finance: { ...d.finance, approvalStatus } }))
                }
              />
              <TextField
                label="Trạng thái Full NE"
                value={rulesDraft.finance.fullNeStatus}
                disabled={!canEdit || busy}
                onChange={(fullNeStatus) =>
                  patchRules((d) => ({ ...d, finance: { ...d.finance, fullNeStatus } }))
                }
              />
            </div>
          </section>

          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveOps()}
                className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-900 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Lưu vận hành
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void resetOps()}
                className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                Reset vận hành
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setRulesDraft(getDefaultKpiEvaluationRules())}
                className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
              >
                <RotateCcw className="h-4 w-4" />
                Mặc định app (chưa lưu)
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
