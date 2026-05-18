import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, PhoneCall, RotateCcw, Save, Trash2, Trophy } from 'lucide-react'
import type { KpiEvaluationConfigPersisted } from '../types'
import { useKpiEvaluationRules } from '../contexts/KpiEvaluationRulesContext'
import {
  getDefaultKpiEvaluationRules,
  KPI_SCORE_BREAKDOWN_LABELS,
  mergeKpiEvaluationRules,
  monthlyPerformanceScore,
  validCallRuleHint,
} from '../utils/kpiEvaluationRules'
import { VietMyAccentHeading } from './VietMyAccentHeading'

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
        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 disabled:opacity-60"
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
        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 disabled:opacity-60"
      />
    </label>
  )
}

export function KpiEvaluationRulesPanel({ canEdit }: { canEdit: boolean }) {
  const { merged, runtime, docExists, rulesFromRemote, loading, error, saveRules, resetToBuiltin } =
    useKpiEvaluationRules()
  const [draft, setDraft] = useState<KpiEvaluationConfigPersisted>(() => merged)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    setDraft(merged)
  }, [merged])

  const previewScore = useMemo(
    () =>
      monthlyPerformanceScore(
        {
          validCalls: 90,
          warmNew: 4,
          hotNew: 2,
          depositPaidCount: 3,
          approvedRevenueVnd: 25_000_000,
          newToInterested: 6,
        },
        runtime,
      ),
    [runtime],
  )

  const patch = useCallback((fn: (d: KpiEvaluationConfigPersisted) => KpiEvaluationConfigPersisted) => {
    setDraft((d) => fn(d))
  }, [])

  const save = async () => {
    if (!canEdit) return
    setBusy(true)
    setMsg(null)
    try {
      const clean = mergeKpiEvaluationRules(draft)
      const { goldMaxPercentile, silverMaxPercentile, bronzeMaxPercentile } = clean.bonusTiers
      if (silverMaxPercentile <= goldMaxPercentile || bronzeMaxPercentile <= silverMaxPercentile) {
        setMsg('Hạng thưởng: Vàng < Bạc < Đồng (phần trăm xếp hạng).')
        return
      }
      const capSum =
        clean.monthlyScore.capCalls +
        clean.monthlyScore.capConversion +
        clean.monthlyScore.capDeposit +
        clean.monthlyScore.capRevenue +
        clean.monthlyScore.capInterested
      if (capSum <= 0) {
        setMsg('Tổng trần điểm tháng phải > 0.')
        return
      }
      await saveRules(clean)
      setMsg('Đã lưu cấu hình KPI Sale.')
    } catch (e) {
      console.error(e)
      setMsg(e instanceof Error ? e.message : 'Không lưu được — kiểm tra quyền Firestore (scoringAux).')
    } finally {
      setBusy(false)
    }
  }

  const resetServer = async () => {
    if (!canEdit) return
    if (!window.confirm('Xóa cấu hình KPI trên server và dùng mặc định app?')) return
    setBusy(true)
    setMsg(null)
    try {
      await resetToBuiltin()
      setDraft(getDefaultKpiEvaluationRules())
      setMsg('Đã xóa — dùng mặc định app.')
    } catch (e) {
      console.error(e)
      setMsg(e instanceof Error ? e.message : 'Không xóa được.')
    } finally {
      setBusy(false)
    }
  }

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
      <div>
        <VietMyAccentHeading as="h2" tone="onLight" size="lg" className="block">
          KPI Sale &amp; đánh giá TVV
        </VietMyAccentHeading>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600">
          Quy tắc gọi hợp lệ, cảnh báo điều hành, điểm tháng và hạng thưởng. Lưu tại{' '}
          <code className="rounded bg-slate-100 px-1 text-xs">scoringAux/kpiEvaluationConfig</code> — Cloud Functions
          đọc mỗi ~15 phút (cache 1 phút).
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {rulesFromRemote ? 'Đang dùng cấu hình server.' : docExists ? 'Doc có nhưng schema lỗi — đang merge mặc định.' : 'Chưa có trên server — mặc định app.'}
          {' · '}
          {validCallRuleHint(runtime)}
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
        <div className="flex items-center gap-2 font-semibold text-slate-900">
          <PhoneCall className="h-4 w-4 text-sky-700" aria-hidden />
          Cuộc gọi hợp lệ (HL)
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <NumField
            label="Thời lượng tối thiểu (giây)"
            value={draft.validCall.minBillSeconds}
            min={10}
            max={600}
            disabled={!canEdit}
            onChange={(n) => patch((d) => ({ ...d, validCall: { ...d.validCall, minBillSeconds: n } }))}
          />
          <NumField
            label="Không trùng lead (giờ)"
            value={draft.validCall.dedupWindowHours}
            min={1}
            max={24}
            disabled={!canEdit}
            onChange={(n) => patch((d) => ({ ...d, validCall: { ...d.validCall, dedupWindowHours: n } }))}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
        <p className="font-semibold text-slate-900">Cảnh báo — Điều hành (ưu tiên: spam → chưa cọc → bắt máy)</p>
        <div className="mt-3 grid gap-4 lg:grid-cols-3">
          <div className="space-y-2 rounded-xl border border-amber-100 bg-amber-50/50 p-3">
            <TextField
              label="Nhãn spam"
              value={draft.warnings.spam.label}
              disabled={!canEdit}
              onChange={(label) =>
                patch((d) => ({ ...d, warnings: { ...d.warnings, spam: { ...d.warnings.spam, label } } }))
              }
            />
            <NumField
              label="Tối thiểu tổng gọi"
              value={draft.warnings.spam.minTotalCalls}
              min={1}
              disabled={!canEdit}
              onChange={(n) =>
                patch((d) => ({ ...d, warnings: { ...d.warnings, spam: { ...d.warnings.spam, minTotalCalls: n } } }))
              }
            />
            <NumField
              label="Tỷ lệ HL tối thiểu (0–1)"
              value={draft.warnings.spam.minValidRatio}
              min={0.05}
              max={1}
              step={0.05}
              hint="Cảnh báo khi HL/tổng gọi < ngưỡng này"
              disabled={!canEdit}
              onChange={(n) =>
                patch((d) => ({ ...d, warnings: { ...d.warnings, spam: { ...d.warnings.spam, minValidRatio: n } } }))
              }
            />
          </div>
          <div className="space-y-2 rounded-xl border border-orange-100 bg-orange-50/50 p-3">
            <TextField
              label="Nhãn chưa cọc"
              value={draft.warnings.noDeposit.label}
              disabled={!canEdit}
              onChange={(label) =>
                patch((d) => ({
                  ...d,
                  warnings: { ...d.warnings, noDeposit: { ...d.warnings.noDeposit, label } },
                }))
              }
            />
            <NumField
              label="Tối thiểu tổng gọi"
              value={draft.warnings.noDeposit.minTotalCalls}
              min={1}
              disabled={!canEdit}
              onChange={(n) =>
                patch((d) => ({
                  ...d,
                  warnings: { ...d.warnings, noDeposit: { ...d.warnings.noDeposit, minTotalCalls: n } },
                }))
              }
            />
          </div>
          <div className="space-y-2 rounded-xl border border-sky-100 bg-sky-50/50 p-3">
            <TextField
              label="Nhãn bắt máy thấp"
              value={draft.warnings.lowConnect.label}
              disabled={!canEdit}
              onChange={(label) =>
                patch((d) => ({
                  ...d,
                  warnings: { ...d.warnings, lowConnect: { ...d.warnings.lowConnect, label } },
                }))
              }
            />
            <NumField
              label="Tỷ lệ bắt máy tối thiểu (0–1)"
              value={draft.warnings.lowConnect.maxConnectRatio}
              min={0.05}
              max={1}
              step={0.05}
              hint="Cảnh báo khi bắt máy/tổng < ngưỡng"
              disabled={!canEdit}
              onChange={(n) =>
                patch((d) => ({
                  ...d,
                  warnings: { ...d.warnings, lowConnect: { ...d.warnings.lowConnect, maxConnectRatio: n } },
                }))
              }
            />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
        <div className="flex items-center gap-2 font-semibold text-slate-900">
          <Trophy className="h-4 w-4 text-violet-700" aria-hidden />
          Điểm tháng (0–{runtime.monthlyScore.capCalls + runtime.monthlyScore.capConversion + runtime.monthlyScore.capDeposit + runtime.monthlyScore.capRevenue + runtime.monthlyScore.capInterested})
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Ví dụ TVV: 90 HL, 4 WARM+2 HOT, 3 cọc, 25tr doanh thu, 6 NEW→QT → điểm xem trước:{' '}
          <strong>{previewScore}</strong>
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {KPI_SCORE_BREAKDOWN_LABELS.map(({ key, label, capKey }) => (
            <div key={key} className="rounded-lg border border-slate-100 bg-slate-50/80 p-2">
              <p className="text-xs font-semibold text-slate-700">{label}</p>
              <NumField
                label="Trần điểm"
                value={draft.monthlyScore[capKey]}
                min={0}
                max={100}
                disabled={!canEdit}
                onChange={(n) =>
                  patch((d) => ({ ...d, monthlyScore: { ...d.monthlyScore, [capKey]: n } }))
                }
              />
            </div>
          ))}
          <NumField
            label="Mục tiêu HL (đạt trần gọi)"
            value={draft.monthlyScore.targetValidCalls}
            min={1}
            disabled={!canEdit}
            onChange={(n) =>
              patch((d) => ({ ...d, monthlyScore: { ...d.monthlyScore, targetValidCalls: n } }))
            }
          />
          <NumField
            label="Điểm / (WARM+HOT)"
            value={draft.monthlyScore.pointsPerWarmHot}
            min={0}
            step={0.5}
            disabled={!canEdit}
            onChange={(n) =>
              patch((d) => ({ ...d, monthlyScore: { ...d.monthlyScore, pointsPerWarmHot: n } }))
            }
          />
          <NumField
            label="Điểm / cọc"
            value={draft.monthlyScore.pointsPerDeposit}
            min={0}
            disabled={!canEdit}
            onChange={(n) =>
              patch((d) => ({ ...d, monthlyScore: { ...d.monthlyScore, pointsPerDeposit: n } }))
            }
          />
          <NumField
            label="Mẫu doanh thu (VNĐ → trần)"
            value={draft.monthlyScore.revenueDenominatorVnd}
            min={1_000_000}
            step={1_000_000}
            disabled={!canEdit}
            onChange={(n) =>
              patch((d) => ({ ...d, monthlyScore: { ...d.monthlyScore, revenueDenominatorVnd: n } }))
            }
          />
          <NumField
            label="Điểm / NEW→Quan tâm"
            value={draft.monthlyScore.pointsPerInterested}
            min={0}
            step={0.5}
            disabled={!canEdit}
            onChange={(n) =>
              patch((d) => ({ ...d, monthlyScore: { ...d.monthlyScore, pointsPerInterested: n } }))
            }
          />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
        <p className="font-semibold text-slate-900">Hạng thưởng tháng (xếp theo doanh thu duyệt)</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <NumField
            label="Vàng — top % (0–1)"
            value={draft.bonusTiers.goldMaxPercentile}
            min={0.01}
            max={0.5}
            step={0.01}
            disabled={!canEdit}
            onChange={(n) =>
              patch((d) => ({ ...d, bonusTiers: { ...d.bonusTiers, goldMaxPercentile: n } }))
            }
          />
          <NumField
            label="Bạc — top %"
            value={draft.bonusTiers.silverMaxPercentile}
            min={0.05}
            max={0.9}
            step={0.01}
            disabled={!canEdit}
            onChange={(n) =>
              patch((d) => ({ ...d, bonusTiers: { ...d.bonusTiers, silverMaxPercentile: n } }))
            }
          />
          <NumField
            label="Đồng — top %"
            value={draft.bonusTiers.bronzeMaxPercentile}
            min={0.1}
            max={1}
            step={0.01}
            disabled={!canEdit}
            onChange={(n) =>
              patch((d) => ({ ...d, bonusTiers: { ...d.bonusTiers, bronzeMaxPercentile: n } }))
            }
          />
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <TextField
            label="Nhãn Vàng"
            value={draft.bonusTiers.labelGold}
            disabled={!canEdit}
            onChange={(labelGold) => patch((d) => ({ ...d, bonusTiers: { ...d.bonusTiers, labelGold } }))}
          />
          <TextField
            label="Nhãn Bạc"
            value={draft.bonusTiers.labelSilver}
            disabled={!canEdit}
            onChange={(labelSilver) => patch((d) => ({ ...d, bonusTiers: { ...d.bonusTiers, labelSilver } }))}
          />
          <TextField
            label="Nhãn Đồng"
            value={draft.bonusTiers.labelBronze}
            disabled={!canEdit}
            onChange={(labelBronze) => patch((d) => ({ ...d, bonusTiers: { ...d.bonusTiers, labelBronze } }))}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
        <p className="font-semibold text-slate-900">Kế toán duyệt (chuỗi khớp chính xác)</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <TextField
            label="Trạng thái duyệt cọc/HP"
            value={draft.finance.approvalStatus}
            disabled={!canEdit}
            onChange={(approvalStatus) =>
              patch((d) => ({ ...d, finance: { ...d.finance, approvalStatus } }))
            }
          />
          <TextField
            label="Trạng thái Full NE"
            value={draft.finance.fullNeStatus}
            disabled={!canEdit}
            onChange={(fullNeStatus) => patch((d) => ({ ...d, finance: { ...d.finance, fullNeStatus } }))}
          />
        </div>
      </section>

      {msg ? <p className="text-sm text-slate-700">{msg}</p> : null}

      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Lưu cấu hình KPI
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void resetServer()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" />
            Xóa trên server
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setDraft(getDefaultKpiEvaluationRules())}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            <RotateCcw className="h-4 w-4" />
            Mặc định app (chưa lưu)
          </button>
        </div>
      ) : (
        <p className="text-sm text-amber-900">Bạn chỉ xem — cần quyền cấu hình quy tắc chấm điểm để chỉnh.</p>
      )}
    </div>
  )
}
