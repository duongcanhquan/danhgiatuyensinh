import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, PieChart, RotateCcw, Save, Trash2 } from 'lucide-react'
import type { InfoScoreFieldRowPersisted, InfoScoreRulesPersisted } from '../types'
import { useInfoScoreRules } from '../contexts/InfoScoreRulesContext'
import { getDefaultInfoScoreRules, INFO_SCORE_CRITERION_HELP, infoScoreMaxRaw, mergeInfoScoreRules } from '../utils/infoScoreRules'
import { VietMyAccentHeading } from './VietMyAccentHeading'

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, Math.round(n)))
}

function criterionRuleText(id: string): string {
  return INFO_SCORE_CRITERION_HELP.find((h) => h.id === id)?.rule ?? '—'
}

/** Nút ? — toàn bộ nội dung trong `title` (hover) / `aria-label` cho trình đọc màn hình. */
function HelpDot({ text, ariaLabel }: { text: string; ariaLabel: string }) {
  return (
    <button
      type="button"
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-400/70 bg-white text-[11px] font-bold leading-none text-slate-700 shadow-sm hover:bg-slate-50"
      title={text}
      aria-label={ariaLabel}
    >
      ?
    </button>
  )
}

export function InfoCompletenessRulesPanel({ canEdit }: { canEdit: boolean }) {
  const { merged, docExists, rulesFromRemote, loading, error, saveRules, resetToBuiltin } = useInfoScoreRules()
  const [draft, setDraft] = useState<InfoScoreRulesPersisted>(() => merged)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    setDraft(merged)
  }, [merged])

  const maxRaw = useMemo(() => infoScoreMaxRaw(draft), [draft])

  const updateField = useCallback((id: string, patch: Partial<InfoScoreFieldRowPersisted>) => {
    setDraft((d) => ({
      ...d,
      fields: d.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    }))
  }, [])

  const save = async () => {
    if (!canEdit) return
    setBusy(true)
    setMsg(null)
    try {
      const clean = mergeInfoScoreRules(draft)
      if (clean.capMin >= clean.capMax) {
        setMsg('Kẹp %: giá trị min phải nhỏ hơn max.')
        return
      }
      await saveRules(clean)
      setMsg('Đã lưu cấu hình điểm thông tin.')
    } catch (e) {
      console.error(e)
      setMsg(e instanceof Error ? e.message : 'Không lưu được — kiểm tra quyền Firestore (scoringAux).')
    } finally {
      setBusy(false)
    }
  }

  const resetServer = async () => {
    if (!canEdit) return
    if (!window.confirm('Xóa cấu hình trên server và quay về mặc định app cho mọi người?')) return
    setBusy(true)
    setMsg(null)
    try {
      await resetToBuiltin()
      setDraft(getDefaultInfoScoreRules())
      setMsg('Đã xóa cấu hình trên server — dùng mặc định app.')
    } catch (e) {
      console.error(e)
      setMsg(e instanceof Error ? e.message : 'Không xóa được doc cấu hình.')
    } finally {
      setBusy(false)
    }
  }

  const restoreDraftDefault = () => {
    setDraft(getDefaultInfoScoreRules())
    setMsg('Đã khôi phục bản nháp về mặc định — bấm Lưu để ghi lên server (hoặc Xóa cấu hình nếu đang có doc).')
  }

  return (
    <section className="rounded-2xl border border-violet-200/80 bg-gradient-to-br from-white via-violet-50/40 to-white p-5 shadow-xl backdrop-blur-xl md:p-8">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-violet-200 bg-white shadow-sm">
          <PieChart className="h-5 w-5 text-violet-700" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <VietMyAccentHeading as="h3" tone="onLight" size="md" className="text-slate-900">
            Điểm thông tin (độ đầy hồ sơ)
          </VietMyAccentHeading>
          <div className="mt-2 flex flex-wrap items-start gap-2 text-sm leading-relaxed text-slate-700 md:text-base">
            <p className="min-w-0 flex-1">
              % đo mức <strong>đã điền</strong> theo <strong>20 cột quy chuẩn</strong> + tiêu chí mở rộng bạn bật bên dưới
              (điểm nền + dòng khớp, rồi kẹp min–max). Khác nhãn HOT/WARM của profile chấm điểm.
            </p>
            <HelpDot
              ariaLabel="Giải thích chi tiết điểm thông tin"
              text="Điểm thông tin = độ đầy dữ liệu tĩnh trên hồ sơ (điểm nền + các tiêu chí bật và khớp điều kiện; kẹp trong khoảng min–max %). Không đo chất lượng tư vấn, không thay cho nhãn HOT/WARM. Trên từng lead, nếu đã lưu cặp mlWinProbability + mlExplanation trên Firestore thì UI ưu tiên hiển thị theo dữ liệu đó (ghi đè công thức). Cột id gắn logic cố định trong app — chỉ bật/tắt, đổi điểm và nhãn hiển thị trong phạm vi bảng."
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-600">
            {loading ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Đang tải cấu hình…
              </span>
            ) : docExists && !rulesFromRemote ? (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-amber-950 ring-1 ring-amber-300/80">
                Có doc trên server nhưng không đọc được — đang dùng mặc định app; hãy Lưu để ghi đè hoặc Xóa doc.
              </span>
            ) : rulesFromRemote ? (
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-emerald-900 ring-1 ring-emerald-200/80">
                Đang áp dụng: cấu hình trên server (scoringAux/infoScoreConfig)
              </span>
            ) : (
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-slate-800 ring-1 ring-slate-200/90">
                Đang áp dụng: mặc định app — lưu lần đầu để ghi lên server
              </span>
            )}
          </div>
          {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
          {msg ? <p className="mt-2 text-sm text-emerald-800">{msg}</p> : null}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/90 bg-slate-50/80 px-3 py-2 text-sm text-slate-800">
        <span className="font-semibold text-slate-900">Nguyên tắc &amp; hiển thị</span>
        <HelpDot
          ariaLabel="Nguyên tắc điểm thông tin và cách hiển thị trên hệ thống"
          text="Bộ mặc định bật 20 tiêu chí trùng cột Excel quy chuẩn (có thể tắt hoặc giảm điểm). Hai dòng educationLevel và description là mở rộng / legacy — mặc định tắt. Cộng điểm nền + các dòng đang bật mà hồ sơ khớp điều kiện, rồi kẹp % giữa min và max. Nếu lead có mlWinProbability + mlExplanation đã lưu, giao diện ưu tiên hiển thị cặp đó."
        />
      </div>

      <div className="mt-3 rounded-xl border border-amber-200/80 bg-amber-50/60 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2 text-sm text-amber-950">
          <span className="font-semibold">Quyền chỉnh cấu hình</span>
          <HelpDot
            ariaLabel="Quyền chỉnh điểm thông tin"
            text={
              canEdit
                ? 'Bạn có quyền cấu hình chấm điểm — có thể lưu hoặc xóa doc scoringAux/infoScoreConfig.'
                : 'Chỉ xem — cần quyền chỉnh quy tắc chấm điểm (config:scoring_rules) để lưu thay đổi.'
            }
          />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3 border-t border-violet-200/50 pt-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-xs font-semibold uppercase tracking-wide text-slate-500">
            Điểm nền
            <input
              type="number"
              min={0}
              max={100}
              disabled={!canEdit || busy}
              value={draft.basePoints}
              onChange={(e) => setDraft((d) => ({ ...d, basePoints: clampPct(Number(e.target.value)) }))}
              className="mt-1 w-24 rounded-lg border border-slate-200 px-2 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50"
            />
          </label>
          <label className="flex flex-col text-xs font-semibold uppercase tracking-wide text-slate-500">
            Kẹp min %
            <input
              type="number"
              min={0}
              max={99}
              disabled={!canEdit || busy}
              value={draft.capMin}
              onChange={(e) => setDraft((d) => ({ ...d, capMin: clampPct(Number(e.target.value)) }))}
              className="mt-1 w-24 rounded-lg border border-slate-200 px-2 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50"
            />
          </label>
          <label className="flex flex-col text-xs font-semibold uppercase tracking-wide text-slate-500">
            Kẹp max %
            <input
              type="number"
              min={1}
              max={100}
              disabled={!canEdit || busy}
              value={draft.capMax}
              onChange={(e) => setDraft((d) => ({ ...d, capMax: clampPct(Number(e.target.value)) }))}
              className="mt-1 w-24 rounded-lg border border-slate-200 px-2 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50"
            />
          </label>
        </div>
        <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            disabled={!canEdit || busy}
            onClick={restoreDraftDefault}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-45"
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            Bản nháp = mặc định
          </button>
          <button
            type="button"
            disabled={!canEdit || busy}
            onClick={() => void save()}
            className="inline-flex items-center gap-2 rounded-xl border border-violet-400/50 bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-violet-700 disabled:opacity-45"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
            Lưu lên server
          </button>
          <button
            type="button"
            disabled={!canEdit || busy || !docExists}
            onClick={() => void resetServer()}
            className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-900 shadow-sm transition hover:bg-rose-100 disabled:opacity-45"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            Xóa cấu hình server
          </button>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200/90 bg-white/95 shadow-sm">
        <table className="w-full min-w-[900px] border-collapse text-left text-sm">
          <caption className="border-b border-slate-200 bg-slate-50/95 px-4 py-3 text-left text-sm font-semibold text-slate-900">
            Bảng quy tắc — tổng điểm thô tối đa ≈ {maxRaw} (trước kẹp {draft.capMin}–{draft.capMax}%)
          </caption>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-600">
              <th className="px-3 py-2.5">Bật</th>
              <th className="px-3 py-2.5">id</th>
              <th className="px-3 py-2.5">Nhãn hiển thị</th>
              <th className="px-3 py-2.5 text-right">Điểm</th>
              <th className="min-w-[3rem] px-3 py-2.5 text-center">
                <span className="inline-flex items-center justify-center gap-1">
                  Điều kiện
                  <HelpDot
                    ariaLabel="Giải thích cột điều kiện"
                    text="Mỗi dòng: điều kiện khớp cố định trong mã (xem chi tiết qua nút ? trong ô). Đổi điểm hoặc nhãn hiển thị không làm thay đổi điều kiện."
                  />
                </span>
              </th>
              <th className="min-w-[10rem] px-3 py-2.5">Ghi chú (tooltip)</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-100 bg-violet-50/40">
              <td className="px-3 py-3 text-slate-400">—</td>
              <td className="px-3 py-3 font-mono text-xs text-slate-500">base</td>
              <td className="px-3 py-3 font-medium text-slate-900">Điểm nền (luôn tính)</td>
              <td className="px-3 py-3 text-right font-semibold tabular-nums">+{draft.basePoints}</td>
              <td className="px-3 py-3 text-center">
                <HelpDot
                  text="Luôn cộng — mức khởi điểm trước các tiêu chí dòng (không có điều kiện khớp)."
                  ariaLabel="Điều kiện điểm nền"
                />
              </td>
              <td className="px-3 py-3 text-center">
                <HelpDot
                  text="Không tắt được — chỉnh giá trị ở ô «Điểm nền» phía trên."
                  ariaLabel="Ghi chú điểm nền"
                />
              </td>
            </tr>
            {draft.fields.map((f) => (
              <tr key={f.id} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={f.enabled}
                    disabled={!canEdit || busy}
                    onChange={(e) => updateField(f.id, { enabled: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                </td>
                <td className="px-3 py-3 font-mono text-xs text-slate-600">{f.id}</td>
                <td className="px-3 py-3">
                  <input
                    type="text"
                    value={f.label}
                    disabled={!canEdit || busy}
                    onChange={(e) => updateField(f.id, { label: e.target.value })}
                    className="w-full min-w-[8rem] rounded-lg border border-slate-200 px-2 py-1.5 text-sm disabled:opacity-50"
                  />
                </td>
                <td className="px-3 py-3 text-right">
                  <input
                    type="number"
                    min={0}
                    max={50}
                    value={f.pointsIfMatch}
                    disabled={!canEdit || busy}
                    onChange={(e) =>
                      updateField(f.id, { pointsIfMatch: Math.max(0, Math.min(50, Math.round(Number(e.target.value) || 0))) })
                    }
                    className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-right text-sm font-semibold tabular-nums disabled:opacity-50"
                  />
                </td>
                <td className="px-3 py-3 text-center">
                <HelpDot text={criterionRuleText(f.id)} ariaLabel={`Điều kiện khớp cho ${f.id}`} />
              </td>
                <td className="px-3 py-3">
                  <input
                    type="text"
                    value={f.hint ?? ''}
                    disabled={!canEdit || busy}
                    onChange={(e) => updateField(f.id, { hint: e.target.value.trim() ? e.target.value : undefined })}
                    className="w-full min-w-[10rem] rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-700 disabled:opacity-50"
                    placeholder="—"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-slate-500 md:text-sm">
        Gợi ý: dùng % để ưu tiên bổ sung hồ sơ; dùng HOT/WARM từ bộ chấm điểm cho ưu tiên tuyển sinh. Hai thước đo độc lập.
      </p>
    </section>
  )
}
