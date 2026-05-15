import { PieChart } from 'lucide-react'
import { getMvpInfoScoreFieldRulesPublic, getMvpInfoScoreMaxRaw, MVP_INFO_SCORE_GLOBAL } from '../utils/mlWinMock'
import { VietMyAccentHeading } from './VietMyAccentHeading'

/**
 * Mô tả nguyên tắc **điểm thông tin** (% trên bảng hồ sơ) — khác bộ chấm điểm HOT/WARM/COLD.
 * Trọng số MVP lấy từ `mlWinMock` (một nguồn với logic tính).
 */
export function InfoCompletenessRulesPanel() {
  const fields = getMvpInfoScoreFieldRulesPublic()
  const maxRaw = getMvpInfoScoreMaxRaw()
  const { basePoints, capMin, capMax } = MVP_INFO_SCORE_GLOBAL
  const maxFieldsPts = fields.reduce((s, f) => s + f.pointsIfMatch, 0)

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
          <p className="mt-2 text-sm leading-relaxed text-slate-700 md:text-base">
            Con số <strong>%</strong> trên cột hồ sơ phản ánh <strong>mức đã có bao nhiêu thông tin cơ bản</strong> trên một
            người — <strong>không phải</strong> điểm tích lũy HOT/WARM/COLD của tab Chấm điểm bên dưới, và{' '}
            <strong>không phải</strong> kết quả mô hình dự đoán từ AI.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200/90 bg-white/90 p-4 shadow-inner">
          <h4 className="text-sm font-semibold text-slate-900">Cách hiển thị trên hệ thống</h4>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-700">
            <li>
              <strong>Mặc định (MVP):</strong> app cộng điểm nền + từng trường đã điền theo bảng quy tắc, rồi{' '}
              <strong>kẹp</strong> giữa <strong>{capMin}%</strong> và <strong>{capMax}%</strong> để luôn có vòng % dễ
              đọc (tránh 0% hoặc 100% cứng khi thiếu/thừa dữ liệu nhẹ).
            </li>
            <li>
              <strong>Đã lưu trên hồ sơ:</strong> nếu trên Firestore có đủ cặp{' '}
              <code className="rounded bg-slate-100 px-1 font-mono text-[0.85em]">mlWinProbability</code> +{' '}
              <code className="rounded bg-slate-100 px-1 font-mono text-[0.85em]">mlExplanation</code>, giao diện{' '}
              <strong>ưu tiên hiển thị giá trị đã lưu</strong> (0–100) và không dùng lại công thức MVP cho người đó.
            </li>
            <li>
              Đặt chuột lên vòng % trên bảng hồ sơ để xem <strong>bảng chi tiết</strong> (đúng theo logic MVP khi nguồn là
              app tính).
            </li>
          </ul>
        </div>

        <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 p-4 shadow-inner">
          <h4 className="text-sm font-semibold text-amber-950">Phần nào chỉnh được trong Cài đặt?</h4>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-amber-950/95">
            <li>
              <strong>Bộ chấm điểm (HOT / WARM / COLD)</strong> — chỉnh được trong khối <em>Chấm điểm</em> phía dưới
              (quy tắc + ngưỡng).
            </li>
            <li>
              <strong>Trọng số điểm thông tin MVP</strong> (điểm nền, điểm từng trường, kẹp %){' '}
              <strong>hiện cố định trong mã nguồn</strong> — bảng bên dưới là bản sao đúng với phiên bản app; muốn đổi
              quy tắc cần cập nhật phần mềm (hoặc ghi đè bằng dữ liệu đã lưu trên từng hồ sơ như trên).
            </li>
          </ul>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200/90 bg-white/95 shadow-sm">
        <table className="w-full min-w-[520px] border-collapse text-left text-sm">
          <caption className="border-b border-slate-200 bg-slate-50/95 px-4 py-3 text-left text-sm font-semibold text-slate-900">
            Bảng quy tắc MVP — điểm nền + các trường (tổng điểm thô tối đa ≈ {maxRaw}, trước kẹp {capMin}–{capMax}%)
          </caption>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-600">
              <th className="px-4 py-2.5">Thành phần</th>
              <th className="px-4 py-2.5 text-right tabular-nums">Điểm cộng khi đạt</th>
              <th className="px-4 py-2.5">Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-100 bg-violet-50/40">
              <td className="px-4 py-3 font-medium text-slate-900">Điểm nền (luôn tính)</td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">+{basePoints}</td>
              <td className="px-4 py-3 text-slate-600">Khởi điểm trước khi cộng các trường bên dưới.</td>
            </tr>
            {fields.map((f) => (
              <tr key={f.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium text-slate-900">{f.label}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">+{f.pointsIfMatch}</td>
                <td className="px-4 py-3 text-slate-600">{f.hint ?? '—'}</td>
              </tr>
            ))}
            <tr className="bg-slate-50/90 font-medium text-slate-800">
              <td className="px-4 py-3">Cộng tối đa các trường (không gồm nền)</td>
              <td className="px-4 py-3 text-right tabular-nums">+{maxFieldsPts}</td>
              <td className="px-4 py-3 text-slate-600">Khi mọi điều kiện dòng trên đều đạt.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-slate-500 md:text-sm">
        Gợi ý vận hành: dùng % để xếp hàng “ưu tiên bổ sung hồ sơ”; dùng nhãn HOT/WARM từ bộ chấm điểm để xếp hàng “ưu
        tiên tuyển sinh”. Hai thước đo độc lập — đừng trộn khi đọc báo cáo.
      </p>
    </section>
  )
}
