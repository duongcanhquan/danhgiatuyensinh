import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

const body = 'text-sm leading-relaxed text-slate-700'
const sub = 'text-xs leading-relaxed text-slate-600'
const h3 = 'text-sm font-bold text-slate-900'
const list = 'list-inside list-disc space-y-1.5 text-sm text-slate-700'

export function KpiPersonnelGuideBody({ focus }: { focus?: 'period' | 'monthly' }) {
  return (
    <div className="space-y-4">
      <p className={body}>
        Màn này giúp quản lý xem hiệu suất tư vấn viên (TVV): cuộc gọi, chuyển đổi hồ sơ, cọc và doanh thu đã duyệt.
        Chọn <strong>Báo cáo kỳ</strong> khi cần số theo ngày; chọn <strong>Đánh giá tháng</strong> khi chốt điểm và hạng
        thưởng.
      </p>

      {focus !== 'monthly' ? (
        <section>
          <h3 className={h3}>Báo cáo kỳ — xem vài ngày gần đây</h3>
          <ul className={`mt-2 ${list}`}>
            <li>Chọn <strong>Từ ngày</strong> và <strong>Đến ngày</strong> (mặc định 7 ngày).</li>
            <li>Có thể lọc một TVV để xem chi tiết.</li>
            <li>Bảng theo nhóm và theo TVV: tổng gọi, <strong>gọi HL</strong>, cọc duyệt, doanh thu duyệt.</li>
            <li>Dùng khi họp tuần, so sánh kỳ ngắn — không thay cho chốt tháng.</li>
          </ul>
        </section>
      ) : null}

      {focus !== 'period' ? (
        <section>
          <h3 className={h3}>Đánh giá tháng — chốt điểm &amp; hạng</h3>
          <ul className={`mt-2 ${list}`}>
            <li>Chọn <strong>Tháng KPI</strong> cần xem.</li>
            <li>Ô trên cùng: tổng gọi HL, cọc, doanh thu toàn phạm vi bạn được xem.</li>
            <li>Bảng TVV: <strong>Điểm</strong> (0–100) và hạng Vàng / Bạc / Đồng.</li>
            <li>Bấm một hàng TVV để mở 4 trụ: Gọi, Chuyển đổi, Tuân thủ, Nhập học.</li>
            <li>Trưởng nhóm có thể nhập <strong>điểm tuân thủ</strong> (0–100) rồi bấm Lưu.</li>
          </ul>
        </section>
      ) : null}

      <section className="rounded-xl border border-sky-100 bg-sky-50/60 p-3">
        <h3 className={h3}>Đọc số nhanh — TVV cần biết</h3>
        <ul className={`mt-2 ${list}`}>
          <li>
            <strong>Gọi HL (hợp lệ):</strong> gọi bằng nút OMICall trên hồ sơ, đủ thời lượng (thường ≥ 45 giây), không
            gọi trùng cùng hồ sơ trong vài giờ.
          </li>
          <li>
            <strong>Cọc &amp; doanh thu:</strong> chỉ tính sau khi kế toán <strong>duyệt</strong> — cập nhật hồ sơ chưa đủ.
          </li>
          <li>
            <strong>WARM+ / HOT+:</strong> lần đầu trong ngày chuyển nhãn hồ sơ sang ấm / nóng (không cộng trùng khi bật
            tắt nhiều lần).
          </li>
          <li>Số có thể cập nhật chậm ~15 phút sau cuộc gọi (đồng bộ tổng đài).</li>
        </ul>
      </section>

      <section>
        <h3 className={h3}>Liên kết nhanh bên dưới</h3>
        <ul className={`mt-2 ${list}`}>
          <li>
            <strong>Điều hành (ngày):</strong> bảng TVV theo từng ngày + cảnh báo ⚠.
          </li>
          <li>
            <strong>KPI kỳ:</strong> màn chi tiết cho TVV xem 7/30 ngày.
          </li>
          <li>
            <strong>Bảng điểm tháng:</strong> xếp hạng đầy đủ theo tháng.
          </li>
        </ul>
      </section>

      <p className={sub}>
        Quản trị chỉnh ngưỡng HL, cảnh báo, điểm tháng tại{' '}
        <Link to="/settings?tab=kpi" className="font-semibold text-sky-800 underline">
          Cài đặt → KPI Sale
        </Link>
        .
      </p>
    </div>
  )
}

export function KpiSettingsGuideBody(): ReactNode {
  return (
    <div className="space-y-4">
      <p className={body}>
        Tab này quyết định cách hệ thống <strong>tính gọi hợp lệ</strong>, <strong>cảnh báo trên Điều hành</strong>,{' '}
        <strong>điểm tháng</strong> và <strong>hạng thưởng</strong>. Sau khi Lưu, server áp dụng dần (~15 phút) — số ngày
        cũ không tự sửa ngược.
      </p>

      <section className="rounded-xl border border-violet-100 bg-violet-50/50 p-3">
        <h3 className={h3}>Ba bước cài đặt đúng</h3>
        <ol className="mt-2 list-inside list-decimal space-y-2 text-sm text-slate-700">
          <li>
            <strong>Cuộc gọi HL</strong> — đặt giây tối thiểu (vd. 45) và cửa sổ không trùng lead (vd. 4 giờ). TVV phải gọi
            từ hồ sơ thì mới được tính.
          </li>
          <li>
            <strong>Cảnh báo</strong> — chỉnh ngưỡng spam / chưa cọc / bắt máy thấp và nhãn hiển thị trên màn Điều hành.
            Mỗi TVV mỗi ngày chỉ hiện một cảnh báo (ưu tiên spam → chưa cọc → bắt máy).
          </li>
          <li>
            <strong>Điểm tháng + hạng + kế toán</strong> — mục tiêu từng chỉ số, hạng Vàng/Bạc/Đồng, chuỗi trạng thái kế
            toán khớp đúng chữ trên hồ sơ → bấm <strong>Lưu cấu hình KPI</strong>.
          </li>
        </ol>
      </section>

      <section>
        <h3 className={h3}>Cuộc gọi hợp lệ (HL)</h3>
        <ul className={`mt-2 ${list}`}>
          <li>
            <strong>Thời lượng tối thiểu:</strong> cuộc ngắn hơn không tính HL (dù vẫn có trong tổng gọi).
          </li>
          <li>
            <strong>Không trùng lead:</strong> cùng TVV + cùng hồ sơ trong X giờ chỉ tính 1 HL.
          </li>
        </ul>
      </section>

      <section>
        <h3 className={h3}>Cảnh báo — Điều hành</h3>
        <ul className={`mt-2 ${list}`}>
          <li>
            <strong>Spam:</strong> nhiều gọi nhưng tỷ lệ HL thấp — hạ ngưỡng HL hoặc tăng tổng gọi tối thiểu nếu báo quá
            nhiều.
          </li>
          <li>
            <strong>Chưa cọc:</strong> gọi nhiều nhưng chưa có cọc duyệt trong kỳ.
          </li>
          <li>
            <strong>Bắt máy thấp:</strong> tỷ lệ bắt máy dưới ngưỡng — nhắc TVV kiểm tra giờ gọi / số điện thoại.
          </li>
        </ul>
      </section>

      <section>
        <h3 className={h3}>Điểm tháng (4 trụ)</h3>
        <ul className={`mt-2 ${list}`}>
          <li>
            <strong>Gọi</strong> (~40%): HL, lead chạm, chất lượng gọi.
          </li>
          <li>
            <strong>Chuyển đổi</strong> (~30%): WARM+/HOT+, NEW→Quan tâm, thao tác CRM.
          </li>
          <li>
            <strong>Tuân thủ</strong> (~10%): cảnh báo + điểm trưởng nhóm nhập tay.
          </li>
          <li>
            <strong>Nhập học</strong> (~20%): cọc duyệt, ghi danh, doanh thu.
          </li>
          <li>
            <strong>Mục tiêu mặc định:</strong> TVV đạt bao nhiêu thì được điểm tối đa từng chỉ số — chỉnh theo kỳ tuyển
            sinh.
          </li>
          <li>Xem <strong>điểm xem trước</strong> trước khi Lưu để thử công thức.</li>
        </ul>
      </section>

      <section>
        <h3 className={h3}>Hạng thưởng Vàng / Bạc / Đồng</h3>
        <ul className={`mt-2 ${list}`}>
          <li>Phần trăm xếp hạng phải tăng dần: Vàng &lt; Bạc &lt; Đồng (vd. top 10% / 30% / 60%).</li>
          <li>Nhãn hiển thị có thể đổi cho phù hợp chính sách thưởng nội bộ.</li>
        </ul>
      </section>

      <section>
        <h3 className={h3}>Kế toán duyệt</h3>
        <ul className={`mt-2 ${list}`}>
          <li>
            Hai ô trạng thái phải <strong>khớp chính xác</strong> chữ trên hồ sơ (vd. «ĐỒNG Ý», «ĐÃ FULL NE»).
          </li>
          <li>Sai một dấu → cọc / NE không vào KPI dù hồ sơ đã duyệt trên thực tế.</li>
        </ul>
      </section>

      <section className="rounded-xl border border-amber-100 bg-amber-50/60 p-3">
        <h3 className={h3}>Lưu ý khi bấm Lưu</h3>
        <ul className={`mt-2 ${list}`}>
          <li>
            <strong>Lưu cấu hình KPI:</strong> ghi lên server — mọi TVV dùng công thức mới từ lúc đó.
          </li>
          <li>
            <strong>Mặc định app (chưa lưu):</strong> chỉ xem trên màn này, chưa áp dụng.
          </li>
          <li>
            <strong>Xóa trên server:</strong> quay về mặc định app — cần xác nhận.
          </li>
        </ul>
      </section>
    </div>
  )
}
