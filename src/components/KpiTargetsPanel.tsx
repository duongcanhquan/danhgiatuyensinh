import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Save, Target, Trash2, UserCog } from 'lucide-react'
import type { KpiMetricTargets } from '../types'
import { useKpiEvaluationRules } from '../contexts/KpiEvaluationRulesContext'
import { useCounselorDirectory } from '../hooks/useCounselorDirectory'
import { currentMonthKey } from '../hooks/useCounselorMonthlyKpi'
import { useKpiTargets } from '../hooks/useKpiTargets'
import { mergeKpiMetricTargets } from '../utils/kpiTargets'
import { fmtKpiNum, fmtKpiVnd } from '../utils/kpiDisplay'
import { VietMyAccentHeading } from './VietMyAccentHeading'

const TARGET_FIELDS: { key: keyof KpiMetricTargets; label: string; revenue?: boolean }[] = [
  { key: 'validCalls', label: 'Gọi hợp lệ / tháng' },
  { key: 'uniqueLeadsCalled', label: 'Lead chạm / tháng' },
  { key: 'warmHot', label: 'WARM + HOT mcode mới' },
  { key: 'newToInterested', label: 'NEW → Quan tâm' },
  { key: 'crmActions', label: 'Thao tác CRM' },
  { key: 'depositPaidCount', label: 'Cọc đã thu' },
  { key: 'enrolled', label: 'NB / NE (nhập học)' },
  { key: 'approvedRevenueVnd', label: 'Doanh thu duyệt (VNĐ)', revenue: true },
]

function TargetGrid({
  values,
  onChange,
  disabled,
  placeholders,
}: {
  values: Partial<KpiMetricTargets>
  onChange: (key: keyof KpiMetricTargets, n: number) => void
  disabled?: boolean
  placeholders?: KpiMetricTargets
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {TARGET_FIELDS.map(({ key, label, revenue }) => (
        <label key={key} className="block text-sm font-medium text-slate-700">
          {label}
          <input
            type="number"
            min={
              revenue
                ? 0
                : key === 'warmHot' ||
                    key === 'newToInterested' ||
                    key === 'crmActions' ||
                    key === 'depositPaidCount' ||
                    key === 'enrolled'
                  ? 0
                  : 1
            }
            step={revenue ? 1_000_000 : 1}
            disabled={disabled}
            value={values[key] ?? ''}
            placeholder={placeholders ? String(placeholders[key]) : undefined}
            onChange={(e) => onChange(key, Number(e.target.value))}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm tabular-nums text-slate-900 disabled:opacity-60"
          />
        </label>
      ))}
    </div>
  )
}

function fmtTargetValue(key: keyof KpiMetricTargets, v: number): string {
  return key === 'approvedRevenueVnd' ? fmtKpiVnd(v) : fmtKpiNum(v)
}

export function KpiTargetsPanel({ canEdit }: { canEdit: boolean }) {
  const { runtime } = useKpiEvaluationRules()
  const globalBaseline = runtime.composite.globalTargets
  const [month, setMonth] = useState(currentMonthKey())
  const { counselors } = useCounselorDirectory()
  const {
    monthDefaults,
    counselorOverrides,
    loading,
    error,
    resolveFor,
    saveMonthDefaults,
    saveCounselorOverride,
    clearCounselorOverride,
  } = useKpiTargets(month, globalBaseline)

  const [monthDraft, setMonthDraft] = useState<Partial<KpiMetricTargets>>({})
  const [selectedUid, setSelectedUid] = useState('')
  const [counselorDraft, setCounselorDraft] = useState<Partial<KpiMetricTargets>>({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const effectiveMonthBase = useMemo(
    () => mergeKpiMetricTargets(globalBaseline, monthDefaults ?? monthDraft),
    [globalBaseline, monthDefaults, monthDraft],
  )

  useEffect(() => {
    setMonthDraft(monthDefaults ? { ...monthDefaults } : {})
  }, [monthDefaults, month])

  useEffect(() => {
    if (!selectedUid) {
      setCounselorDraft({})
      return
    }
    setCounselorDraft({ ...(counselorOverrides.get(selectedUid) ?? {}) })
  }, [selectedUid, counselorOverrides])

  const counselorOptions = useMemo(
    () =>
      [...counselors].sort((a, b) =>
        (a.displayName || a.email || '').localeCompare(b.displayName || b.email || ''),
      ),
    [counselors],
  )

  const patchMonth = useCallback((key: keyof KpiMetricTargets, n: number) => {
    setMonthDraft((d) => ({ ...d, [key]: n }))
  }, [])

  const patchCounselor = useCallback((key: keyof KpiMetricTargets, n: number) => {
    setCounselorDraft((d) => ({ ...d, [key]: n }))
  }, [])

  const saveMonth = async () => {
    if (!canEdit) return
    setBusy(true)
    setMsg(null)
    try {
      await saveMonthDefaults(monthDraft)
      setMsg(`Đã lưu mục tiêu tháng ${month}.`)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Không lưu được mục tiêu tháng.')
    } finally {
      setBusy(false)
    }
  }

  const saveCounselor = async () => {
    if (!canEdit || !selectedUid) return
    setBusy(true)
    setMsg(null)
    try {
      await saveCounselorOverride(selectedUid, counselorDraft)
      setMsg('Đã lưu ghi đè mục tiêu cho TVV.')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Không lưu được ghi đè TVV.')
    } finally {
      setBusy(false)
    }
  }

  const clearCounselor = async () => {
    if (!canEdit || !selectedUid) return
    if (!window.confirm('Xóa ghi đè — TVV dùng mục tiêu chung tháng?')) return
    setBusy(true)
    setMsg(null)
    try {
      await clearCounselorOverride(selectedUid)
      setCounselorDraft({})
      setMsg('Đã xóa ghi đè TVV.')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Không xóa được.')
    } finally {
      setBusy(false)
    }
  }

  const selectedResolved = selectedUid ? resolveFor(selectedUid) : null
  const hasCounselorOverride = selectedUid ? counselorOverrides.has(selectedUid) : false

  return (
    <div className="space-y-5 border-t border-slate-200 pt-6">
      <div>
        <VietMyAccentHeading as="h2" tone="onLight" size="lg" className="block">
          Mục tiêu KPI theo tháng &amp; từng TVV
        </VietMyAccentHeading>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600">
          Ba tầng: <strong>mặc định cấu hình</strong> (tab trên) → <strong>ghi đè tháng</strong>{' '}
          <code className="rounded bg-slate-100 px-1 text-xs">kpiTargets/&#123;YYYY-MM&#125;</code> →{' '}
          <strong>ghi đè từng TVV</strong>{' '}
          <code className="rounded bg-slate-100 px-1 text-xs">…/counselors/&#123;uid&#125;</code>. Dùng cho điểm KPI
          tổng hợp 40/30/10/20.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm font-medium text-slate-700">
          Tháng áp dụng
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="mt-1 block rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          />
        </label>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Đang tải mục tiêu…
        </p>
      ) : (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
            <div className="flex items-center gap-2 font-semibold text-slate-900">
              <Target className="h-4 w-4 text-emerald-700" aria-hidden />
              Mặc định từ cấu hình KPI (chỉ xem)
            </div>
            <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {TARGET_FIELDS.map(({ key, label }) => (
                <div key={key} className="rounded-lg bg-slate-50 px-3 py-2">
                  <dt className="text-xs text-slate-500">{label}</dt>
                  <dd className="text-sm font-semibold tabular-nums text-slate-900">
                    {fmtTargetValue(key, globalBaseline[key])}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-2xl border border-emerald-200 bg-emerald-50/30 p-4 shadow-sm">
            <p className="font-semibold text-slate-900">Ghi đè mục tiêu cả tháng {month}</p>
            <p className="mt-1 text-xs text-slate-600">
              Để trống ô nào thì dùng mặc định cấu hình. Sau khi lưu, giá trị hiệu lực = merge cấu hình + tháng.
            </p>
            <div className="mt-3">
              <TargetGrid
                values={monthDraft}
                onChange={patchMonth}
                disabled={!canEdit || busy}
                placeholders={globalBaseline}
              />
            </div>
            <dl className="mt-4 grid gap-2 border-t border-emerald-200/80 pt-3 sm:grid-cols-2 lg:grid-cols-4">
              {TARGET_FIELDS.map(({ key, label }) => (
                <div key={key} className="text-xs">
                  <span className="text-slate-500">{label} (hiệu lực): </span>
                  <span className="font-semibold tabular-nums text-emerald-900">
                    {fmtTargetValue(key, effectiveMonthBase[key])}
                  </span>
                </div>
              ))}
            </dl>
            {canEdit ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveMonth()}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Lưu mục tiêu tháng
              </button>
            ) : null}
          </section>

          <section className="rounded-2xl border border-violet-200 bg-violet-50/30 p-4 shadow-sm">
            <div className="flex items-center gap-2 font-semibold text-slate-900">
              <UserCog className="h-4 w-4 text-violet-700" aria-hidden />
              Ghi đè riêng từng TVV
            </div>
            <label className="mt-3 block max-w-md text-sm font-medium text-slate-700">
              Chọn TVV
              <select
                value={selectedUid}
                onChange={(e) => setSelectedUid(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">— Chọn —</option>
                {counselorOptions.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName || u.email || u.id}
                    {counselorOverrides.has(u.id) ? ' ★' : ''}
                  </option>
                ))}
              </select>
            </label>

            {selectedUid && selectedResolved ? (
              <>
                <p className="mt-2 text-xs text-slate-600">
                  {hasCounselorOverride
                    ? 'TVV này có ghi đè riêng (★). Chỉnh các ô bên dưới.'
                    : 'Chưa có ghi đè — nhập giá trị khác mục tiêu tháng để tạo ghi đè.'}
                </p>
                <div className="mt-3">
                  <TargetGrid
                    values={counselorDraft}
                    onChange={patchCounselor}
                    disabled={!canEdit || busy}
                    placeholders={effectiveMonthBase}
                  />
                </div>
                <dl className="mt-4 grid gap-2 border-t border-violet-200/80 pt-3 sm:grid-cols-2 lg:grid-cols-4">
                  {TARGET_FIELDS.map(({ key, label }) => (
                    <div key={key} className="text-xs">
                      <span className="text-slate-500">{label} (TVV): </span>
                      <span className="font-semibold tabular-nums text-violet-900">
                        {fmtTargetValue(key, selectedResolved[key])}
                      </span>
                    </div>
                  ))}
                </dl>
                {canEdit ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void saveCounselor()}
                      className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-60"
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Lưu ghi đè TVV
                    </button>
                    {hasCounselorOverride ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void clearCounselor()}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                      >
                        <Trash2 className="h-4 w-4" />
                        Xóa ghi đè
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : null}
          </section>
        </>
      )}

      {msg ? <p className="text-sm text-slate-700">{msg}</p> : null}
    </div>
  )
}
