import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BookOpen, ChevronRight, Home } from 'lucide-react'

type SectionId =
  | 'gioi-thieu'
  | 'dang-nhap-menu'
  | 'vai-tro'
  | 'tong-ket'
  | 'ho-so-danh-sach'
  | 'ho-so-chi-tiet'
  | 'ho-so-hang-loat-ai'
  | 'nhap-excel'
  | 'phan-tich-nang-cao'
  | 'cai-dat-tong-quan'
  | 'danh-muc-cham-diem'
  | 'tu-van-kich-ban'
  | 'kho-tri-thuc'
  | 'khoa-ai-tac-vu'
  | 'quan-ly-nhan-su'
  | 'phan-quyen'
  | 'ho-tro'

type Section = {
  id: SectionId
  title: string
  /** Một dòng mô tả nhanh trong mục lục */
  blurb: string
  body: ReactNode
}

const SECTION_ORDER: SectionId[] = [
  'gioi-thieu',
  'dang-nhap-menu',
  'vai-tro',
  'tong-ket',
  'ho-so-danh-sach',
  'ho-so-chi-tiet',
  'ho-so-hang-loat-ai',
  'nhap-excel',
  'phan-tich-nang-cao',
  'cai-dat-tong-quan',
  'danh-muc-cham-diem',
  'tu-van-kich-ban',
  'kho-tri-thuc',
  'khoa-ai-tac-vu',
  'quan-ly-nhan-su',
  'phan-quyen',
  'ho-tro',
]

const LEGACY_SECTION_ALIASES: Record<string, SectionId> = {
  'phong-thu-ai': 'khoa-ai-tac-vu',
}

function parseSection(raw: string | null, validIds: readonly SectionId[]): SectionId | null {
  if (!raw) return null
  const mapped = LEGACY_SECTION_ALIASES[raw] ?? raw
  return validIds.includes(mapped as SectionId) ? (mapped as SectionId) : null
}

function sectionsData(): Section[] {
  const p = 'mb-3 text-base leading-relaxed text-slate-700 last:mb-0'
  const ul = 'mb-3 ml-5 list-disc space-y-1.5 text-base leading-relaxed text-slate-700'
  const note =
    'mt-4 rounded-xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm leading-relaxed text-slate-800'

  return [
    {
      id: 'gioi-thieu',
      title: 'Giới thiệu',
      blurb: 'Hệ thống dùng để làm gì',
      body: (
        <div className="space-y-1">
          <p className={p}>
            Đây là hệ thống quản lý tuyển sinh và hồ sơ thí sinh (CRM) của nhà trường. Bạn có thể xem tổng kết, lọc
            danh sách, mở chi tiết từng người, ghi chú, phân công và — khi được cấp quyền — cấu hình danh mục, chấm
            điểm ưu tiên, hoặc dùng công cụ AI hỗ trợ đọc hồ sơ.
          </p>
          <p className={p}>
            Tài liệu này nằm ngay trong phần mềm: bạn chọn mục bên trái (hoặc ô chọn trên điện thoại) để đọc từng
            phần. Không cần nhớ đường dẫn kỹ thuật; mọi thứ gắn với tên trên menu sau khi đăng nhập.
          </p>
        </div>
      ),
    },
    {
      id: 'dang-nhap-menu',
      title: 'Đăng nhập và menu',
      blurb: 'Vào hệ thống, đăng xuất, tìm chức năng',
      body: (
        <div className="space-y-1">
          <p className={p}>
            <strong>Đăng nhập:</strong> mở địa chỉ web do nhà trường cấp, nhập email và mật khẩu. Sau khi vào được, menu
            chính nằm trên cùng (máy tính) hoặc trong biểu tượng menu (điện thoại).
          </p>
          <p className={p}>
            <strong>Đăng xuất:</strong> dùng nút ở góc trên khi dùng máy chung hoặc xong việc, để người khác không vào
            nhầm tài khoản của bạn.
          </p>
          <ul className={ul}>
            <li>Không đăng nhập được: kiểm tra mạng, đúng email/mật khẩu; nếu vẫn lỗi, liên hệ quản trị.</li>
            <li>Thiếu mục trên menu: do quyền tài khoản — báo quản trị để được mở đúng vai trò.</li>
          </ul>
        </div>
      ),
    },
    {
      id: 'vai-tro',
      title: 'Vai trò và quyền',
      blurb: 'Ai thường làm việc gì',
      body: (
        <div className="space-y-1">
          <p className={p}>
            Hệ thống phân quyền theo vai trò. Dưới đây là hình ảnh thông thường; tên gọi có thể tùy chỉnh theo trường
            bạn.
          </p>
          <ul className={ul}>
            <li>
              <strong>Tư vấn viên (TVV):</strong> quản lý và cập nhật hồ sơ được giao; tự tạo profile chấm điểm cho nhóm
              mình; không vào cấu hình toàn trường.
            </li>
            <li>
              <strong>Trưởng nhóm:</strong> xem và chỉnh hồ sơ trong nhóm; đổi TVV phụ trách; soạn playbook (Thông tin TV);
              xem báo cáo nhóm nếu được mở — không chỉnh Tri thức / khóa LLM.
            </li>
            <li>
              <strong>Quản trị / Siêu quản trị:</strong> toàn bộ Cài đặt, nhập liệu, nhân sự, ma trận phân quyền; Siêu quản
              trị thêm cấu hình nhạy cảm (khóa API AI).
            </li>
          </ul>
          <p className={note}>
            Bạn chỉ thấy đúng những gì được phép. Nếu thiếu chức năng cho công việc, không tự “sửa được” — cần quản
            trị điều chỉnh trên hệ thống.
          </p>
        </div>
      ),
    },
    {
      id: 'tong-ket',
      title: 'Tổng kết (Bảng điều khiển)',
      blurb: 'Số liệu nhanh sau đăng nhập',
      body: (
        <div className="space-y-1">
          <p className={p}>
            Màn <strong>Tổng kết</strong> là trang đầu sau khi đăng nhập: biểu đồ và con số tóm tắt hồ sơ đã tải trên
            trình duyệt của bạn (có thể có nút <strong>Tải thêm</strong> nếu danh sách rất lớn).
          </p>
          <ul className={ul}>
            <li>Dùng để họp nhanh hoặc nắm xu hướng pipeline, mức ưu tiên (HOT / WARM / COLD).</li>
            <li>Muốn xem hoặc sửa chi tiết từng người: chuyển sang menu <strong>Hồ sơ</strong>.</li>
          </ul>
        </div>
      ),
    },
    {
      id: 'ho-so-danh-sach',
      title: 'Hồ sơ — danh sách và lọc',
      blurb: 'Tìm kiếm, bộ lọc, chia sẻ link',
      body: (
        <div className="space-y-1">
          <p className={p}>
            Menu <strong>Hồ sơ</strong> là nơi làm việc chính với danh sách thí sinh. Thứ tự trên màn hình thường là:
          </p>
          <ol className="mb-3 ml-5 list-decimal space-y-1.5 text-base leading-relaxed text-slate-700">
            <li>
              <strong>Ô tìm kiếm</strong> — gõ tên, số điện thoại, mã khách hàng, tỉnh…
            </li>
            <li>
              <strong>Hàng lọc</strong> — ưu tiên, vùng, hệ đào tạo, tình trạng tư vấn, nguồn, trường, tư vấn viên…
              (tùy quyền, có thể không hiện hết).
            </li>
            <li>
              <strong>Bảng</strong> — mỗi dòng là một hồ sơ; bấm vào dòng để mở chi tiết.
            </li>
            <li>
              Khi tick chọn một hoặc nhiều dòng, thường có <strong>thanh thao tác phía dưới</strong> để đổi trạng thái,
              phân công, v.v.
            </li>
          </ol>
          <p className={p}>
            Cột <strong>% (điểm thông tin)</strong> trên bảng phản ánh <strong>độ đầy dữ liệu tĩnh</strong> (điểm nền + các
            tiêu chí bật và khớp, rồi kẹp min–max %) — không phải HOT/WARM. Đặt chuột lên vòng % để xem chi tiết. Cách tính
            và chỉnh: <strong>Cài đặt → Chấm điểm → tab Điểm thông tin</strong> (bảng có cột «Cách đánh giá» cho từng{' '}
            <code className="rounded bg-slate-100 px-1 font-mono text-xs">id</code>); nhãn HOT/WARM ở tab{' '}
            <strong>Profile chấm điểm</strong>.
          </p>
          <p className={p}>
            <strong>Chia sẻ đúng bộ lọc:</strong> sau khi chỉnh lọc, copy địa chỉ trên thanh trình duyệt và gửi cho đồng
            nghiệp có quyền xem — họ mở link sẽ thấy cùng trạng thái lọc (nếu được phép xem dữ liệu đó).
          </p>
          <p className={note}>
            Đường dẫn cũ “tư vấn viên” nếu có bookmark vẫn chuyển về màn Hồ sơ; không cần làm gì thêm.
          </p>
        </div>
      ),
    },
    {
      id: 'ho-so-chi-tiet',
      title: 'Hồ sơ — chi tiết một thí sinh',
      blurb: 'Ghi chú, lịch sử, chấm điểm',
      body: (
        <div className="space-y-1">
          <p className={p}>
            Khi bấm một dòng trong bảng, cửa sổ hoặc trang chi tiết mở ra. Tại đây bạn thường làm việc với thông tin
            liên hệ, trạng thái tuyển sinh, ghi chú, lịch sử tương tác, và điểm ưu tiên do hệ thống chấm theo cấu hình
            của trường.
          </p>
          <ul className={ul}>
            <li>Mọi thay đổi quan trọng: đợi thông báo thành công (toast) rồi hãy đóng trang nếu vừa lưu xong.</li>
            <li>Panel tư vấn (nếu có): hiển thị gợi ý kịch bản do nhà trường soạn — khác với nút phân tích AI.</li>
          </ul>
        </div>
      ),
    },
    {
      id: 'ho-so-hang-loat-ai',
      title: 'Hồ sơ — hàng loạt và AI',
      blurb: 'Chọn nhiều dòng, AI Shortlist, phân tích AI',
      body: (
        <div className="space-y-1">
          <p className={p}>
            Tick nhiều hồ sơ để thực hiện thao tác chung (theo nút hiện trên thanh). Một số thao tác giới hạn số lượng
            mỗi lần để tránh quá tải — đọc thông báo trên màn hình.
          </p>
          <p className={p}>
            <strong>Nút tia sét (AI Shortlist):</strong> chỉ <em>thu hẹp danh sách</em> xuống những hồ sơ đã có dấu hiệu
            “đã chạy phân tích AI” (thường là biểu tượng tia sét vàng). Nút này <strong>không</strong> tự gọi AI. Để có
            kết quả AI: chọn nhóm ưu tiên phù hợp (ví dụ WARM), chọn hồ sơ, dùng chức năng chạy phân tích trên thanh,
            làm theo bước kiểm tra rồi xác nhận chạy.
          </p>
          <ul className={ul}>
            <li>
              Cần <strong>khóa ChatGPT / Gemini</strong> đã lưu trong <strong>Cài đặt → LLM → API</strong> trên chính
              trình duyệt bạn đang dùng (thường do Siêu quản trị thực hiện).
            </li>
            <li>
              Tài khoản phải được quản lý bật <strong>«Cho phép dùng AI trên hồ sơ»</strong> trong Quản lý nhân sự (Siêu
              quản trị thường không cần bật dòng này).
            </li>
          </ul>
          <p className={note}>
            Nếu bật Shortlist mà bảng trống: thường là chưa ai chạy bước phân tích cho các hồ sơ đó — không phải lỗi giao
            diện.
          </p>
        </div>
      ),
    },
    {
      id: 'nhap-excel',
      title: 'Nhập liệu từ Excel',
      blurb: 'Tải mẫu, tải lên, xác nhận',
      body: (
        <div className="space-y-1">
          <p className={p}>
            Màn <strong>Nhập liệu</strong> dành cho người có quyền nạp dữ liệu hàng loạt (thường là phòng tuyển sinh /
            quản trị).
          </p>
          <ol className="mb-3 ml-5 list-decimal space-y-1.5 text-base leading-relaxed text-slate-700">
            <li>Tải <strong>file mẫu</strong> nếu có nút hướng dẫn.</li>
            <li>Điền đúng cột theo mẫu, lưu file.</li>
            <li>
              <strong>Tải file lên</strong>, xem bản xem trước (trùng lặp, cập nhật hay bỏ qua tùy chọn trên màn hình).
            </li>
            <li>Xác nhận <strong>nhập vào hệ thống</strong>.</li>
          </ol>
          <p className={p}>
            Hệ thống có thể tự phân công tư vấn viên theo tải công việc — tùy cấu hình trường. Lỗi quyền hoặc định dạng:
            liên hệ quản trị kèm file mẫu đang dùng.
          </p>
        </div>
      ),
    },
    {
      id: 'phan-tich-nang-cao',
      title: 'Phân tích nâng cao',
      blurb: 'Báo cáo sâu hơn Tổng kết',
      body: (
        <div className="space-y-1">
          <p className={p}>
            Menu <strong>Phân tích nâng cao</strong> chỉ hiện khi tài khoản có quyền tương ứng. Ở đây là báo cáo và biểu
            đồ chi tiết hơn so với trang Tổng kết — phục vụ theo dõi chiến dịch, phễu, hoặc chỉ số do nhà trường cấu
            hình.
          </p>
        </div>
      ),
    },
    {
      id: 'cai-dat-tong-quan',
      title: 'Cài đặt — tổng quan',
      blurb: 'Ai vào, các tab là gì',
      body: (
        <div className="space-y-1">
          <p className={p}>
            <strong>Cài đặt</strong> tập trung cấu hình nền: danh mục, chấm điểm, <strong>Thông tin TV</strong> (playbook),
            <strong>Tri thức</strong> (tài liệu cho AI), <strong>LLM &amp; Tư vấn AI</strong>, quản lý nhân sự và ma trận phân
            quyền (Admin).
          </p>
          <p className={p}>
            Người dùng chỉ xem / sửa hồ sơ thường <strong>không cần</strong> vào đây trừ khi được giao nhiệm vụ cấu hình.
            Nếu bạn là quản trị: đọc nốt các mục dưới đây theo đúng tab trên màn hình.
          </p>
        </div>
      ),
    },
    {
      id: 'danh-muc-cham-diem',
      title: 'Danh mục & Chấm điểm hồ sơ',
      blurb: 'Giá trị chung và quy tắc HOT / WARM / COLD',
      body: (
        <div className="space-y-1">
          <p className={p}>
            <strong>Danh mục dữ liệu:</strong> thư viện giá trị dùng chung (vùng, ngành, nguồn, …). Các mục này xuất
            hiện trong form hồ sơ và trong điều kiện chấm điểm khi cần so khớp “thuộc danh sách”.
          </p>
          <p className={p}>
            <strong>Chấm điểm (profile):</strong> bộ quy tắc và ngưỡng điểm để hệ thống tự gán nhãn ưu tiên (ví dụ HOT /
            WARM / COLD) dựa trên <em>dữ liệu đã có trên hồ sơ</em> — không phải đoạn chat AI và không đọc kho tài liệu
            như khi phân tích AI.
          </p>
          <ul className={ul}>
            <li>Tab quy tắc mẫu: giúp thêm nhanh khối điều kiện khi soạn profile.</li>
            <li>Nên chuẩn hóa cột dữ liệu (ngành quan tâm, học lực, loại trường…) để chấm điểm ổn định.</li>
          </ul>
          <p className={p}>
            <strong>Điểm thông tin (% trên bảng hồ sơ):</strong> <strong>Cài đặt → Chấm điểm → Điểm thông tin</strong> — chỉnh
            điểm nền, kẹp %, bật/tắt từng dòng tiêu chí và điểm khi khớp (mặc định bật bộ «lõi»; một số tiêu chí bổ sung như
            nguồn, ngành quan tâm, học lực, mô tả dài… mặc định tắt — bật nếu trường muốn đưa vào %). Lưu toàn trường.{' '}
            <strong>Profile chấm điểm (HOT/WARM)</strong> nằm tab kế bên trong cùng màn Chấm điểm. Từng hồ sơ vẫn có thể ghi
            đè % khi đã lưu sẵn trên lead (mlWinProbability + mlExplanation).
          </p>
        </div>
      ),
    },
    {
      id: 'tu-van-kich-ban',
      title: 'Tư vấn & kịch bản',
      blurb: 'Gợi ý cho TVV khi gọi điện',
      body: (
        <div className="space-y-1">
          <p className={p}>
            Phần <strong>Tư vấn</strong> gồm playbook (kịch bản theo tình huống: vùng, ngành, nhãn…) và các đoạn thoại
            mẫu (Script Hub) hiển thị trong panel trợ lý khi mở hồ sơ. Toàn bộ là <strong>nội dung soạn sẵn</strong> trong
            hệ thống — không tính phí gọi AI từng câu như phân tích hồ sơ.
          </p>
          <p className={p}>Khác với Kho tri thức (tài liệu cho AI đọc khi phân tích) và khác nút Tư vấn AI trên hồ sơ.</p>
        </div>
      ),
    },
    {
      id: 'kho-tri-thuc',
      title: 'Kho tri thức',
      blurb: 'Tài liệu chuẩn cho phân tích AI trên hồ sơ',
      body: (
        <div className="space-y-1">
          <p className={p}>
            <strong>Kho tri thức</strong> lưu văn bản đã duyệt (học phí, quy chế, thông tin ngành…). Khi chạy{' '}
            <strong>Phân tích AI</strong> trong chi tiết hồ sơ, hệ thống có thể trích đoạn từ kho này để câu trả lời bám
            quy định, giảm “bịa” thông tin.
          </p>
          <ul className={ul}>
            <li>Không tự hiện trong playbook hay Script Hub.</li>
            <li>Chỉ đi kèm luồng Tư vấn AI trên chi tiết hồ sơ.</li>
          </ul>
        </div>
      ),
    },
    {
      id: 'khoa-ai-tac-vu',
      title: 'LLM & Tư vấn AI',
      blurb: 'Cấu hình và tác vụ phân tích hồ sơ',
      body: (
        <div className="space-y-1">
          <p className={p}>
            Trong <strong>Cài đặt → LLM &amp; Tư vấn AI</strong>: lưu khóa ChatGPT / Gemini, cấu hình lọc trước khi gọi AI
            hàng loạt, và quản lý <strong>tác vụ phân tích</strong> (có sẵn mẫu «Tư vấn tuyển sinh»). TVV mở hồ sơ →{' '}
            <strong>Tư vấn AI</strong> để chạy — kết quả lưu trên hồ sơ, kèm Kho tri thức và playbook khớp.
          </p>
          <p className={p}>
            Khóa API thường chỉ <strong>Siêu quản trị</strong> lưu được; nhân viên khác chỉ <em>dùng</em> sau khi được bật
            quyền «Cho phép dùng AI trên hồ sơ».
          </p>
          <p className={note}>
            Trong tab LLM có sẵn phần hướng dẫn ngắn theo từng bước cài đặt — nên đọc lần đầu trước khi bấm Lưu.
          </p>
        </div>
      ),
    },
    {
      id: 'quan-ly-nhan-su',
      title: 'Quản lý nhân sự',
      blurb: 'Tài khoản, vai trò, quyền AI',
      body: (
        <div className="space-y-1">
          <p className={p}>
            Tab <strong>Quản lý nhân sự</strong> (Admin): tạo / sửa tài khoản với vai trò <strong>TVV</strong>,{' '}
            <strong>Trưởng nhóm</strong> hoặc <strong>Quản trị</strong>. Khi tạo Trưởng nhóm, chọn danh sách TVV thuộc
            nhóm.
          </p>
          <ul className={ul}>
            <li>Bật <strong>Cho phép dùng AI trên hồ sơ</strong> cho TVV / Trưởng nhóm cần chạy phân tích AI.</li>
            <li>Đổi mật khẩu: email đặt lại do Firebase (nút trên form sửa).</li>
          </ul>
        </div>
      ),
    },
    {
      id: 'phan-quyen',
      title: 'Ma trận phân quyền',
      blurb: 'Ba tầng: TVV / Trưởng nhóm / Quản trị',
      body: (
        <div className="space-y-1">
          <p className={p}>
            Tab <strong>Phân quyền</strong> (chỉ Admin): xem ma trận quyền theo vai trò. TVV — hồ sơ và tương tác của mình;
            Trưởng nhóm — phạm vi nhóm + playbook; Quản trị — toàn hệ thống.
          </p>
          <p className={note}>
            Nút <strong>Hướng dẫn</strong> trên từng tab Cài đặt giải thích tab đang mở — khác với trang Hướng dẫn trên menu
            chính.
          </p>
        </div>
      ),
    },
    {
      id: 'ho-tro',
      title: 'Thói quen hay gặp & hỗ trợ',
      blurb: 'Tải thêm dữ liệu, sự cố',
      body: (
        <div className="space-y-1">
          <ul className={ul}>
            <li>
              <strong>Danh sách lớn:</strong> nếu có nút Tải thêm, hãy bấm trước khi kết luận tổng số hồ sơ trên máy bạn.
            </li>
            <li>
              <strong>Sau khi lưu:</strong> đợi thông báo thành công rồi mới đóng tab nếu vừa thao tác quan trọng.
            </li>
            <li>
              <strong>Quên mật khẩu / không đăng nhập:</strong> quản trị hoặc phòng CNTT.
            </li>
            <li>
              <strong>Thiếu menu hoặc báo không có quyền:</strong> quản trị điều chỉnh vai trò và quyền tài khoản.
            </li>
            <li>
              <strong>Sai dữ liệu sau nhập Excel:</strong> phòng tuyển sinh + quản trị, kiểm tra file và quy tắc trùng.
            </li>
          </ul>
        </div>
      ),
    },
  ]
}

export function UserManualView() {
  const [searchParams, setSearchParams] = useSearchParams()
  const sections = useMemo(() => sectionsData(), [])
  const byId = useMemo(() => Object.fromEntries(sections.map((s) => [s.id, s])) as Record<SectionId, Section>, [sections])
  const navOrder = useMemo(
    () => SECTION_ORDER.filter((id) => byId[id] != null),
    [byId],
  )

  const urlSection = parseSection(searchParams.get('section'), navOrder)
  const activeId: SectionId = urlSection ?? 'gioi-thieu'

  const setSection = useCallback(
    (id: SectionId) => {
      setSearchParams(id === 'gioi-thieu' ? {} : { section: id }, { replace: true })
    },
    [setSearchParams],
  )

  const active = byId[activeId] ?? byId['gioi-thieu']!
  const articleRef = useRef<HTMLElement>(null)

  useEffect(() => {
    articleRef.current?.scrollTo(0, 0)
  }, [activeId])

  return (
    <div className="-mx-2 -mt-2 flex min-h-[calc(100dvh-4.5rem)] flex-col overflow-hidden rounded-none border-y border-slate-200/90 bg-white shadow-none sm:-mx-3 sm:min-h-[calc(100dvh-5rem)] md:-mx-4 md:rounded-2xl md:border md:shadow-[0_8px_40px_rgba(15,23,42,0.08)]">
      <header className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-slate-200/90 bg-gradient-to-r from-slate-50 via-white to-amber-50/50 px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-200/80 bg-white shadow-sm">
            <BookOpen className="h-6 w-6 text-amber-700" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Hướng dẫn sử dụng</h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
              Tài liệu dành cho người dùng cuối: chọn mục bên dưới hoặc trong cột mục lục để đọc từng phần. Chữ cỡ lớn,
              dễ theo dõi trên máy tính và điện thoại.
            </p>
          </div>
        </div>
        <Link
          to="/"
          className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-amber-300 hover:bg-amber-50/80"
        >
          <Home className="h-4 w-4 text-amber-700" strokeWidth={1.75} aria-hidden />
          Về Tổng kết
        </Link>
      </header>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row">
        <aside
          className="shrink-0 border-b border-slate-200/90 bg-slate-50/80 px-4 py-3 md:w-[min(100%,20rem)] md:border-b-0 md:border-r md:py-4"
          aria-label="Mục lục hướng dẫn"
        >
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500 md:hidden">
            Chọn phần cần đọc
          </label>
          <select
            className="mb-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-base font-medium text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-amber-200 md:hidden"
            value={activeId}
            onChange={(e) => setSection(e.target.value as SectionId)}
          >
            {navOrder.map((id) => (
              <option key={id} value={id}>
                {byId[id]!.title}
              </option>
            ))}
          </select>

          <nav className="hidden max-h-[calc(100dvh-14rem)] space-y-0.5 overflow-y-auto overscroll-contain pr-1 md:block">
            {navOrder.map((id) => {
              const s = byId[id]!
              const sel = id === activeId
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSection(id)}
                  className={[
                    'flex w-full flex-col items-start gap-0.5 rounded-xl px-3 py-2.5 text-left transition',
                    sel
                      ? 'bg-amber-100/90 text-slate-900 ring-1 ring-amber-300/60'
                      : 'text-slate-700 hover:bg-white hover:ring-1 hover:ring-slate-200/80',
                  ].join(' ')}
                >
                  <span className="flex w-full items-center gap-1 text-sm font-semibold leading-snug">
                    {sel ? <ChevronRight className="h-4 w-4 shrink-0 text-amber-700" aria-hidden /> : null}
                    <span className="min-w-0 flex-1">{s.title}</span>
                  </span>
                  <span className="pl-0.5 text-xs leading-snug text-slate-500">{s.blurb}</span>
                </button>
              )
            })}
          </nav>
        </aside>

        <article
          ref={articleRef}
          className="scroll-touch min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain bg-white px-4 py-5 sm:px-8 sm:py-8"
          aria-labelledby="manual-section-title"
        >
          <div className="mx-auto max-w-3xl">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-800/90">Phần đang xem</p>
            <h2 id="manual-section-title" className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {active.title}
            </h2>
            <div className="mt-6 text-lg leading-[1.75] sm:text-xl sm:leading-[1.8]">{active.body}</div>
          </div>
        </article>
      </div>
    </div>
  )
}
