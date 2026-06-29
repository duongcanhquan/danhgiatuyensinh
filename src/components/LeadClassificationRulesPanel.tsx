import { useCallback, useState } from 'react'
import type { LeadClassificationConfigPersisted } from '../types'
import { useLeadClassificationRules } from '../contexts/LeadClassificationRulesContext'
import {
  classificationThresholdHint,
  getDefaultLeadClassificationConfig,
  mergeLeadClassificationConfig,
} from '../utils/leadClassificationConfig'

function WeightRow({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string
  value: number
  disabled: boolean
  onChange: (n: number) => void
}) {
  return (
    <label className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
      <span className="text-slate-700">{label}</span>
      <span className="inline-flex items-center gap-2">
        <input
          type="range"
          min={0}
          max={100}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-32"
        />
        <input
          type="number"
          min={0}
          max={100}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-14 rounded border border-slate-200 px-1 py-0.5 text-right tabular-nums"
        />
        <span className="text-xs text-slate-500">%</span>
      </span>
    </label>
  )
}

export function LeadClassificationRulesPanel({ canEdit }: { canEdit: boolean }) {
  const { merged, runtime, loading, error, rulesFromRemote, saveRules, resetToBuiltin } = useLeadClassificationRules()
  const [draft, setDraft] = useState<LeadClassificationConfigPersisted | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const working = draft ?? merged

  const patch = useCallback((fn: (d: LeadClassificationConfigPersisted) => LeadClassificationConfigPersisted) => {
    setDraft((prev) => fn(prev ?? merged))
    setMsg(null)
  }, [merged])

  const onSave = async () => {
    setBusy(true)
    setMsg(null)
    try {
      await saveRules(mergeLeadClassificationConfig(working))
      setDraft(null)
      setMsg('Đã lưu — nhãn HOT/WARM/COLD tính theo tỷ trọng mới.')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Không lưu được.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 text-sm">
      <div>
        <h3 className="text-base font-bold text-slate-900">Phân loại HOT / WARM / COLD (tỷ trọng)</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">
          Điểm tổng hợp 0–100 = <strong>Hồ sơ</strong> × tỷ trọng + <strong>Gọi điện &amp; tương tác</strong> × phần
          còn lại. Mỗi trụ chuẩn hóa 0–100 trước khi nhân tỷ trọng — tránh hồ sơ “ăn” hết điểm khi đã gọi nhiều.
        </p>
      </div>

      {loading ? <p className="text-xs text-slate-500">Đang tải…</p> : null}
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
      {msg ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">{msg}</p>
      ) : null}
      {!rulesFromRemote ? (
        <p className="text-xs text-amber-800">Chưa lưu trên server — đang dùng mặc định (40% hồ sơ / 60% gọi).</p>
      ) : null}

      <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
        <input
          type="checkbox"
          checked={working.enabled}
          disabled={!canEdit || busy}
          onChange={(e) => patch((d) => ({ ...d, enabled: e.target.checked }))}
        />
        Bật phân loại theo tỷ trọng (tắt = logic chấm điểm cũ)
      </label>

      <section className="space-y-2 rounded-xl border border-violet-200 bg-violet-50/50 p-4">
        <h4 className="font-semibold text-violet-950">Tỷ trọng hai trụ chính</h4>
        <WeightRow
          label="Hồ sơ (quy tắc + điểm thông tin)"
          value={working.profileWeightPercent}
          disabled={!canEdit || busy}
          onChange={(n) => patch((d) => ({ ...d, profileWeightPercent: n }))}
        />
        <p className="text-xs text-violet-800">
          Gọi điện &amp; tương tác: <strong>{100 - working.profileWeightPercent}%</strong>
        </p>
      </section>

      <section className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
        <h4 className="font-semibold text-slate-900">Trong trụ Hồ sơ</h4>
        <WeightRow
          label="Quy tắc profile chấm điểm"
          value={working.profile.profileRules}
          disabled={!canEdit || busy}
          onChange={(n) => patch((d) => ({ ...d, profile: { ...d.profile, profileRules: n } }))}
        />
        <WeightRow
          label="Điểm thông tin (% đầy hồ sơ)"
          value={working.profile.infoScore}
          disabled={!canEdit || busy}
          onChange={(n) => patch((d) => ({ ...d, profile: { ...d.profile, infoScore: n } }))}
        />
      </section>

      <section className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
        <h4 className="font-semibold text-slate-900">Trong trụ Gọi điện &amp; tương tác</h4>
        {(
          [
            ['callBehavior', 'Điểm hành vi cuộc gọi (checklist TVV)'],
            ['callSignal', 'Tín hiệu / sẵn sàng sau gọi'],
            ['aiSentiment', 'Cảm xúc AI cuộc gọi'],
            ['tvvSignals', 'Tín hiệu TVV trên hồ sơ (Hành vi/Rủi ro)'],
            ['priorityBoost', 'Nhãn boost sau đánh giá gọi'],
          ] as const
        ).map(([key, label]) => (
          <WeightRow
            key={key}
            label={label}
            value={working.engagement.subWeights[key]}
            disabled={!canEdit || busy}
            onChange={(n) =>
              patch((d) => ({
                ...d,
                engagement: {
                  ...d.engagement,
                  subWeights: { ...d.engagement.subWeights, [key]: n },
                },
              }))
            }
          />
        ))}
      </section>

      <section className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
        <h4 className="font-semibold text-amber-950">Ngưỡng nhãn (trên điểm tổng hợp 0–100)</h4>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs text-slate-700">
            HOT từ
            <input
              type="number"
              min={1}
              max={100}
              value={working.thresholds.hotMinScore}
              disabled={!canEdit || busy}
              onChange={(e) =>
                patch((d) => ({
                  ...d,
                  thresholds: { ...d.thresholds, hotMinScore: Number(e.target.value) },
                }))
              }
              className="mt-1 w-full rounded border border-slate-200 px-2 py-1"
            />
          </label>
          <label className="text-xs text-slate-700">
            WARM từ
            <input
              type="number"
              min={0}
              max={99}
              value={working.thresholds.warmMinScore}
              disabled={!canEdit || busy}
              onChange={(e) =>
                patch((d) => ({
                  ...d,
                  thresholds: { ...d.thresholds, warmMinScore: Number(e.target.value) },
                }))
              }
              className="mt-1 w-full rounded border border-slate-200 px-2 py-1"
            />
          </label>
        </div>
        <p className="text-xs text-amber-900">{classificationThresholdHint(runtime)}</p>
      </section>

      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onSave()}
            className="rounded-xl bg-violet-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
          >
            Lưu phân loại
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setDraft(getDefaultLeadClassificationConfig())}
            className="rounded-xl border border-slate-300 px-4 py-2 text-slate-700"
          >
            Nạp mặc định vào form
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void resetToBuiltin()}
            className="rounded-xl border border-slate-300 px-4 py-2 text-slate-700"
          >
            Xóa cấu hình server
          </button>
        </div>
      ) : (
        <p className="text-xs text-slate-500">Chỉ xem — cần quyền cấu hình chấm điểm để chỉnh.</p>
      )}
    </div>
  )
}
