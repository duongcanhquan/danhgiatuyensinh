/**
 * Sinh `scripts/data/playbook-fragments/01.json` … `05.json` (50 playbook).
 * Chạy: node scripts/generate-vietmy-playbook-fragments.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, 'data', 'playbook-fragments')

/** @typedef {{ title: string, priority: number, triggerConditions: object[], strategy: string, keySellingPoints: string[], objectionHandling: string[] }} PB */

/** @param {PB[]} arr */
function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

const IT = 'Công nghệ thông tin'
const TKDH = 'Thiết kế đồ họa'
const DD = 'Điều dưỡng'
const TD = 'Tiếng Đức'
const DM = 'Digital Marketing'
const OTO = 'Công nghệ Ô tô'
const KS = 'Quản trị Khách sạn'

/** @type {PB[]} */
const ALL = [
  {
    title: 'IT – Tệp HOT – Chốt cọc ngay',
    priority: 80,
    triggerConditions: [
      { field: 'educationLevel', operator: 'EQUALS', value: IT },
      { field: 'priorityTag', operator: 'EQUALS', value: 'HOT' },
    ],
    strategy:
      'Khách hàng đã rất quan tâm và chủ động. Không cần giới thiệu dài dòng về trường. Hãy đi thẳng vào cam kết việc làm, thực hành phòng máy và hối thúc giữ chỗ trước khi hết ưu đãi. Mục tiêu cuộc gọi: Chốt chuyển khoản cọc.',
    keySellingPoints: [
      'Thực hành 70% tại phòng Lab cấu hình cao.',
      'Cam kết giới thiệu việc làm FPT, CMC.',
    ],
    objectionHandling: [
      'Hỏi ý kiến bố mẹ: -> Mời cả bố mẹ vào nhóm Zalo để gửi hình ảnh phòng máy và video cựu sinh viên thành đạt.',
    ],
  },
  {
    title: 'IT – Tệp WARM – Cần nuôi dưỡng',
    priority: 60,
    triggerConditions: [
      { field: 'educationLevel', operator: 'EQUALS', value: IT },
      { field: 'priorityTag', operator: 'EQUALS', value: 'WARM' },
    ],
    strategy:
      'Khách hàng có hứng thú nhưng còn phân vân ngành khác hoặc trường khác. Cần khơi gợi đam mê công nghệ. Gửi các sản phẩm thực tế của sinh viên khóa trước. Mời tham gia group cộng đồng IT của trường.',
    keySellingPoints: [
      'Học từ con số 0, không yêu cầu thi khối A.',
      'Đội ngũ giảng viên từ doanh nghiệp phần mềm.',
    ],
    objectionHandling: [
      'Sợ học code khó: -> Trường có lộ trình cơ bản, hỗ trợ kèm cặp ngoài giờ thực hành.',
    ],
  },
  {
    title: 'IT – Khách ở Tỉnh xa Hà Nội',
    priority: 70,
    triggerConditions: [
      { field: 'educationLevel', operator: 'EQUALS', value: IT },
      { field: 'province', operator: 'NOT_IN', value: ['Hà Nội'] },
    ],
    strategy:
      'Học sinh tỉnh lẻ thường lo lắng về chi phí sinh hoạt và an ninh. Nhấn mạnh vào việc học IT dễ nhận việc làm thêm (freelance) ngay từ năm 2 để trang trải chi phí. Đề cập ngay KTX.',
    keySellingPoints: [
      'Có Ký túc xá an ninh 24/7 ngay tại trường.',
      'Hỗ trợ tìm việc làm thêm ngành IT năm 2.',
    ],
    objectionHandling: [
      'Sợ sống ở HN đắt đỏ: -> Chi phí KTX chỉ từ 800k/tháng, rẻ và an toàn hơn thuê trọ.',
    ],
  },
  {
    title: 'IT – Nguồn từ Đi trường THPT',
    priority: 50,
    triggerConditions: [
      { field: 'educationLevel', operator: 'EQUALS', value: IT },
      { field: 'source', operator: 'CONTAINS', value: 'đi trường' },
    ],
    strategy:
      'Khách này biết trường qua event nhưng chưa sâu. Cần nhắc lại ấn tượng tại event. Gọi điện với thái độ thân thiện như một người anh/chị khóa trên định hướng nghề nghiệp.',
    keySellingPoints: [
      'Công nghệ thông tin là vua của mọi nghề.',
      'Bằng Cao đẳng thực hành, ra trường sớm 1.5 năm.',
    ],
    objectionHandling: [
      'Đang đợi điểm thi ĐH: -> Giữ chỗ bằng cọc trước cho an toàn, đỗ ĐH rút hồ sơ được hoàn cọc (theo quy định trường).',
    ],
  },
  {
    title: 'IT – Tệp COLD – Chăm sóc tự động',
    priority: 40,
    triggerConditions: [
      { field: 'educationLevel', operator: 'EQUALS', value: IT },
      { field: 'priorityTag', operator: 'EQUALS', value: 'COLD' },
    ],
    strategy:
      'Khách ít tương tác. Chỉ gọi 1 cuộc ngắn hỏi thăm, sau đó xin phép gửi thông tin qua Zalo. Dùng Automation gửi chuỗi ZNS về cơ hội nghề nghiệp ngành IT.',
    keySellingPoints: [
      'Học IT không bao giờ lo thất nghiệp.',
      'Thời gian học linh hoạt, thực hành thực tế.',
    ],
    objectionHandling: [
      'Không muốn nghe máy: -> Dạ chị gửi Zalo kèm tài liệu tham khảo về cơ hội việc làm ngành IT; khi rảnh em xem giúp chị nhé.',
    ],
  },
  {
    title: 'Thiết kế – Nữ giới – Khơi gợi sáng tạo',
    priority: 50,
    triggerConditions: [{ field: 'educationLevel', operator: 'EQUALS', value: TKDH }],
    strategy:
      'Đặc thù ngành này các bạn thích cái đẹp, tự do. Nói về không gian học truyền cảm hứng, workshop handmade, quay chụp ngoại cảnh. Mời kết bạn Zalo và gửi video hậu trường sinh viên quay phim.',
    keySellingPoints: [
      'Thực hành tại Studio ảnh chuyên nghiệp của trường.',
      'Tặng tài khoản Adobe bản quyền suốt khóa.',
    ],
    objectionHandling: [
      'Sợ học phí cao do phải mua máy tính: -> Trường có phòng máy Mac, năm nhất chưa cần mua máy ngay.',
    ],
  },
  {
    title: 'Thiết kế – Phân vân giữa ĐH và CĐ',
    priority: 65,
    triggerConditions: [
      { field: 'educationLevel', operator: 'EQUALS', value: TKDH },
      { field: 'priorityTag', operator: 'EQUALS', value: 'WARM' },
    ],
    strategy:
      'Đánh mạnh vào việc ngành Thiết kế quan trọng Portfolio (Hồ sơ năng lực) hơn Bằng cấp. Học CĐ ra trường sớm, đi làm sớm, có kinh nghiệm thực chiến sớm hơn ĐH.',
    keySellingPoints: [
      'Doanh nghiệp tuyển thiết kế nhìn Portfolio, không nhìn bằng.',
      'Tốt nghiệp sau 2.5 năm, đi làm trước sinh viên ĐH.',
    ],
    objectionHandling: [
      'Bố mẹ ép học Đại học: -> Dạ em gửi bài báo phân tích xu hướng tuyển dụng ngành thiết kế để gia đình xem ạ.',
    ],
  },
  {
    title: 'Thiết kế – Trạng thái MỚI (NEW)',
    priority: 90,
    triggerConditions: [
      { field: 'educationLevel', operator: 'EQUALS', value: TKDH },
      { field: 'pipelineStatus', operator: 'EQUALS', value: 'NEW' },
    ],
    strategy:
      'Gọi ngay trong 5 phút. Khách vừa điền form đang có cảm xúc cao nhất. Hỏi ngay «Em thích thiết kế 2D hay quay dựng video?» để tư vấn đúng trọng tâm.',
    keySellingPoints: [
      'Đào tạo đa phương tiện: 2D, 3D, Video, UI/UX.',
      'Đồ án tốt nghiệp là sản phẩm thực tế cho doanh nghiệp.',
    ],
    objectionHandling: [
      'Chưa biết vẽ có học được không: -> Ngành này xài phần mềm là chính, vẽ tay trường sẽ đào tạo từ số 0.',
    ],
  },
  {
    title: 'Thiết kế – Tỉnh xa',
    priority: 70,
    triggerConditions: [
      { field: 'educationLevel', operator: 'EQUALS', value: TKDH },
      { field: 'province', operator: 'NOT_IN', value: ['Hà Nội'] },
    ],
    strategy:
      'Học sinh tỉnh lẻ thích môi trường năng động của Hà Nội. Nhấn mạnh việc trường thường xuyên tổ chức đi bảo tàng, triển lãm nghệ thuật tại thủ đô.',
    keySellingPoints: [
      'Tham gia các triển lãm nghệ thuật lớn tại Hà Nội.',
      'Hỗ trợ KTX giá rẻ, an ninh cho sinh viên tỉnh.',
    ],
    objectionHandling: [
      'Sợ không theo kịp các bạn thành phố: -> Sinh viên tỉnh trường mình rất chăm chỉ và thường đứng top lớp.',
    ],
  },
  {
    title: 'Thiết kế – Đã liên hệ nhưng chưa chốt (CONTACTED)',
    priority: 80,
    triggerConditions: [
      { field: 'educationLevel', operator: 'EQUALS', value: TKDH },
      { field: 'pipelineStatus', operator: 'EQUALS', value: 'CONTACTED' },
    ],
    strategy:
      'Gọi lại với lý do cụ thể, hữu ích. Ví dụ: trường đang có suất workshop nhiếp ảnh trong tuần — mời em đến trải nghiệm miễn phí và xem cơ sở vật chất.',
    keySellingPoints: [
      'Trải nghiệm thực tế không gian sáng tạo.',
      'Gặp gỡ giảng viên là Giám đốc Sáng tạo.',
    ],
    objectionHandling: [
      'Em bận không đi được: -> Dạ em giữ vé gửi qua Zalo, khi nào em thu xếp được thì báo chị nhé.',
    ],
  },
  {
    title: 'Điều dưỡng – Phụ huynh bắt máy',
    priority: 85,
    triggerConditions: [{ field: 'educationLevel', operator: 'EQUALS', value: DD }],
    strategy:
      'Ngành y tế phụ huynh quyết định 90%. Thái độ TVV phải cực kỳ lễ phép, chững chạc. Nhấn mạnh vào: Ổn định, Không thất nghiệp, và Cơ hội đi làm ở nước ngoài.',
    keySellingPoints: [
      'Ngành học ổn định nhất, 100% có việc làm.',
      'Cơ hội xuất khẩu lao động Đức, Nhật Bản phí rẻ.',
    ],
    objectionHandling: [
      'Trường tư học phí cao: -> Đầu tư cho ngành Y là đầu tư chắc chắn, ra trường lương bù lại rất nhanh ạ.',
    ],
  },
  {
    title: 'Điều dưỡng – Tỉnh xa (Nghệ An/Thanh Hóa/Miền núi)',
    priority: 90,
    triggerConditions: [
      { field: 'educationLevel', operator: 'EQUALS', value: DD },
      {
        field: 'province',
        operator: 'IN',
        value: ['Nghệ An', 'Thanh Hóa', 'Sơn La', 'Điện Biên'],
      },
    ],
    strategy:
      'Tệp miền núi và Bắc Trung Bộ cực chuộng ngành Điều dưỡng. Nhấn mạnh cơ hội đổi đời, thoát nghèo nhờ đi xuất khẩu điều dưỡng hoặc làm tại viện lớn ở HN. Đề cập chính sách trả góp.',
    keySellingPoints: [
      'Hỗ trợ trả góp học phí lãi suất 0%.',
      'Ưu tiên xếp phòng KTX cho học sinh tỉnh.',
    ],
    objectionHandling: [
      'Gia đình không có tiền đóng 1 cục: -> Trường cho đóng theo kỳ, hỗ trợ vay vốn ngân hàng chính sách.',
    ],
  },
  {
    title: 'Điều dưỡng – Trạng thái HOT',
    priority: 95,
    triggerConditions: [
      { field: 'educationLevel', operator: 'EQUALS', value: DD },
      { field: 'priorityTag', operator: 'EQUALS', value: 'HOT' },
    ],
    strategy:
      'Khách đang rất nhiệt tình, sẵn sàng chốt. Nhấn mạnh chỉ tiêu ngành y tế có hạn; mời nộp học bạ (ảnh chụp) qua Zalo để xét tuyển và giữ suất.',
    keySellingPoints: [
      'Chỉ tiêu ngành Y tế năm nay có hạn.',
      'Thực tập tại viện lớn tuyến Trung ương ngay năm 2.',
    ],
    objectionHandling: [
      'Chưa có bằng tốt nghiệp: -> Chỉ cần dùng bảng điểm lớp 12 xét trước giữ chỗ, bổ sung bằng sau.',
    ],
  },
  {
    title: 'Điều dưỡng – Quan tâm cơ hội đi Nhật/Đức (mô tả có từ khóa xuất khẩu)',
    priority: 70,
    triggerConditions: [
      { field: 'educationLevel', operator: 'EQUALS', value: DD },
      { field: 'description', operator: 'CONTAINS', value: 'xuất' },
    ],
    strategy:
      '(Khi mô tả/ghi chú lead có nhắc xuất khẩu / nước ngoài.) Tư vấn kép: Vừa học chuyên môn Điều dưỡng, vừa được học ngoại ngữ ngay tại trường. Có đối tác lo visa, không qua môi giới bên ngoài.',
    keySellingPoints: [
      'Học song song chuyên môn Y tế và Ngoại ngữ.',
      'Trường trực tiếp làm hồ sơ xuất khẩu, an toàn 100%.',
    ],
    objectionHandling: [
      'Sợ sang đó bị bóc lột: -> Trường ký kết với đối tác cấp bộ, cam kết điều kiện làm việc chuẩn châu Âu.',
    ],
  },
  {
    title: 'Điều dưỡng – Sợ máu/Sợ vất vả',
    priority: 60,
    triggerConditions: [
      { field: 'educationLevel', operator: 'EQUALS', value: DD },
      { field: 'priorityTag', operator: 'EQUALS', value: 'WARM' },
    ],
    strategy:
      'Trấn an tâm lý. Giải thích Điều dưỡng không chỉ là làm trong phòng cấp cứu, có thể làm nha khoa, thẩm mỹ viện, phòng khám tư nhân (rất nhàn và lương cao).',
    keySellingPoints: [
      'Cơ hội làm việc tại Spa, Thẩm mỹ viện thu nhập cao.',
      'Chăm sóc sức khỏe là kỹ năng sống giá trị cho gia đình.',
    ],
    objectionHandling: [
      'Em sợ trực đêm mệt: -> Làm ở phòng khám tư hoặc nha khoa chỉ làm giờ hành chính em nhé.',
    ],
  },
  {
    title: 'Tiếng Đức – Chốt xuất khẩu lao động',
    priority: 80,
    triggerConditions: [{ field: 'educationLevel', operator: 'EQUALS', value: TD }],
    strategy:
      'Đánh thẳng vào kinh tế. Phân tích bài toán học tiếng Đức ở trường quy củ hơn ra các trung tâm xuất khẩu bên ngoài. Tốt nghiệp có bằng Cao đẳng Chính quy + Bằng B1 Đức = Vé VIP đi Đức.',
    keySellingPoints: [
      'Cam kết đầu ra trình độ B1/B2 tiếng Đức.',
      'Hỗ trợ 100% thủ tục du học nghề tại Đức.',
    ],
    objectionHandling: [
      'Học tiếng Đức khó quá: -> Trường có phương pháp dạy thực hành, giáo viên bản ngữ kèm cặp.',
    ],
  },
  {
    title: 'Tiếng Đức – Khách hàng từ Nam Định / Thái Bình',
    priority: 85,
    triggerConditions: [
      { field: 'educationLevel', operator: 'EQUALS', value: TD },
      { field: 'province', operator: 'IN', value: ['Nam Định', 'Thái Bình'] },
    ],
    strategy:
      'Đây là thủ phủ của phong trào XKLĐ châu Âu. Nói chuyện thẳng thắn với phụ huynh về mức lương 60-80tr tại Đức sau khi tốt nghiệp.',
    keySellingPoints: [
      'Miễn 100% học phí khi sang Đức học nghề (theo chương trình/điều kiện áp dụng — cập nhật từ kho tri thức).',
      'Lương thực tập tại Đức đủ gửi về gia đình.',
    ],
    objectionHandling: [
      'Chi phí đi Đức cao không: -> Tiền đi Đức rẻ hơn đi Nhật/Hàn rất nhiều vì được chính phủ Đức tài trợ (chi tiết theo chính sách hiện hành).',
    ],
  },
  {
    title: 'Tiếng Đức – Rớt Đại học Ngoại ngữ',
    priority: 75,
    triggerConditions: [
      { field: 'educationLevel', operator: 'EQUALS', value: TD },
      { field: 'pipelineStatus', operator: 'EQUALS', value: 'NEW' },
    ],
    strategy:
      'Xoa dịu nỗi buồn trượt ĐH. Phân tích học Cao đẳng Tiếng Đức chú trọng giao tiếp thực tế, ra trường dễ xin việc ở các tập đoàn đa quốc gia hơn học lý thuyết hàn lâm.',
    keySellingPoints: [
      'Học thiên về giao tiếp thương mại, dịch thuật.',
      'Liên thông Đại học dễ dàng sau khi tốt nghiệp.',
    ],
    objectionHandling: [
      'Bằng Cao đẳng sợ khó xin việc: -> Nhiều doanh nghiệp Đức ưu tiên kỹ năng giao tiếp thực tế hơn bằng cấp lý thuyết hàn lâm.',
    ],
  },
  {
    title: 'Tiếng Đức – Quan tâm ngành Điều dưỡng/Nhà hàng tại Đức',
    priority: 90,
    triggerConditions: [
      { field: 'educationLevel', operator: 'EQUALS', value: TD },
      { field: 'priorityTag', operator: 'EQUALS', value: 'HOT' },
    ],
    strategy:
      'Khách đã có định hướng nghề rõ ràng ở Đức. Tư vấn ngay gói Combo: Học tiếng + Bồi dưỡng sơ cấp nghề tại trường rồi bay.',
    keySellingPoints: [
      'Lộ trình khép kín: Học tiếng -> Học nghề -> Bay.',
      'Đối tác tiếp nhận tại Đức uy tín, nhà ở đầy đủ.',
    ],
    objectionHandling: [
      'Sợ sang đó không có người lo: -> Trường có ban đại diện và hội cựu sinh viên tại Đức hỗ trợ.',
    ],
  },
  {
    title: 'Tiếng Đức – Tệp WARM (Đang phân vân tiếng Trung/Nhật)',
    priority: 65,
    triggerConditions: [
      { field: 'educationLevel', operator: 'EQUALS', value: TD },
      { field: 'priorityTag', operator: 'EQUALS', value: 'WARM' },
    ],
    strategy:
      'So sánh cạnh tranh. Tiếng Trung/Nhật đã bão hòa, lương cơ bản tại châu Á thấp hơn. Tiếng Đức đang là đại dương xanh, Đức đang khát nhân lực trầm trọng.',
    keySellingPoints: [
      'Đức đang thiếu hụt nhân lực trầm trọng, đãi ngộ cực tốt.',
      'Lương tại Đức cao gấp 3 lần Nhật/Hàn (tham khảo thị trường).',
    ],
    objectionHandling: [
      'Tiếng Đức ít người học: -> Chính vì ít người học nên tính cạnh tranh thấp, dễ xin việc lương cao.',
    ],
  },
  {
    title: 'Digital Marketing – Nội thành Hà Nội',
    priority: 80,
    triggerConditions: [
      { field: 'educationLevel', operator: 'EQUALS', value: DM },
      { field: 'province', operator: 'EQUALS', value: 'Hà Nội' },
    ],
    strategy:
      'Học sinh thành phố rất nhạy bén kinh doanh. Nhấn mạnh việc học Marketing để tự kinh doanh online, xây kênh TikTok, làm KOL/KOC.',
    keySellingPoints: [
      'Thực hành chạy Ads bằng tiền thật của doanh nghiệp.',
      'Học cách xây kênh TikTok triệu view.',
    ],
    objectionHandling: [
      'Trường có dạy kinh doanh online không: -> Có hẳn module Thương mại điện tử và Affiliate Marketing.',
    ],
  },
  {
    title: 'Digital Marketing – Quan tâm việc làm sớm',
    priority: 90,
    triggerConditions: [
      { field: 'educationLevel', operator: 'EQUALS', value: DM },
      { field: 'priorityTag', operator: 'EQUALS', value: 'HOT' },
    ],
    strategy:
      'Bán «Cơ hội kiếm tiền ngay năm nhất». Marketing là ngành có thể nhận job freelance viết bài, trực page ngay từ học kỳ 2.',
    keySellingPoints: [
      'Sinh viên kiếm được tiền ngay từ năm thứ nhất.',
      'Đội ngũ giảng viên là Giám đốc Marketing thực chiến.',
    ],
    objectionHandling: [
      'Sợ AI cướp việc Marketing: -> Trường dạy sinh viên cách sử dụng AI để làm Marketing nhanh gấp 10 lần.',
    ],
  },
  {
    title: 'Digital Marketing – COLD / Chưa rõ định hướng',
    priority: 50,
    triggerConditions: [
      { field: 'educationLevel', operator: 'EQUALS', value: DM },
      { field: 'priorityTag', operator: 'EQUALS', value: 'COLD' },
    ],
    strategy:
      'Khơi gợi sự tò mò. Kể câu chuyện sinh viên khóa trước phát triển kênh Shopee/TikTok sau khi học tại trường (mức thu nhập tùy cá nhân).',
    keySellingPoints: [
      'Ngành năng động nhất, phù hợp GenZ.',
      'Môi trường học tập cởi mở, không gò bó lý thuyết.',
    ],
    objectionHandling: [
      'Em không giỏi văn có làm Marketing được không: -> Marketing hiện đại cần tư duy logic và số liệu (Ads), không chỉ viết lách.',
    ],
  },
  {
    title: 'Digital Marketing – Phân vân với Báo chí / PR',
    priority: 70,
    triggerConditions: [
      { field: 'educationLevel', operator: 'EQUALS', value: DM },
      { field: 'pipelineStatus', operator: 'EQUALS', value: 'CONTACTED' },
    ],
    strategy:
      'So sánh thực dụng. Báo chí khó xin việc, Marketing thì doanh nghiệp nào cũng cần. Digital Marketing đo lường được bằng số, dễ thăng tiến.',
    keySellingPoints: [
      'Doanh nghiệp nào cũng khát nhân sự Digital.',
      'Thu nhập dựa trên hiệu quả doanh thu, rất cao.',
    ],
    objectionHandling: [
      'Bố mẹ bảo ngành này «chém gió»: -> Digital marketing đo lường bằng chỉ số, báo cáo và hiệu quả chiến dịch — hoàn toàn có thể minh chứng bằng số liệu ạ.',
    ],
  },
  {
    title: 'Digital Marketing – Mời tham quan trường',
    priority: 60,
    triggerConditions: [
      { field: 'educationLevel', operator: 'EQUALS', value: DM },
      { field: 'priorityTag', operator: 'EQUALS', value: 'WARM' },
    ],
    strategy:
      'Gọi điện mời đến trường dự thính 1 buổi học môn Quay dựng video ngắn. Trăm nghe không bằng một thấy.',
    keySellingPoints: [
      'Tham gia thực tế một buổi học làm nội dung TikTok ngắn.',
      'Giao lưu với các chuyên gia Marketing tại trường.',
    ],
    objectionHandling: [
      'Nhà em xa ngại đi: -> Trường hỗ trợ xe đưa đón hoặc hỗ trợ voucher Grab cho nhóm đăng ký tham quan (theo chính sách).',
    ],
  },
  {
    title: 'Công nghệ Ô tô – Đam mê kỹ thuật',
    priority: 80,
    triggerConditions: [{ field: 'educationLevel', operator: 'EQUALS', value: OTO }],
    strategy:
      'Nam giới đam mê xe cộ. Nhấn mạnh vào xưởng thực hành hiện đại, xu hướng xe điện (VinFast) và xe Hybrid. Bức tranh thu nhập mở gara riêng.',
    keySellingPoints: [
      '70% thời gian học tại xưởng thực hành ô tô hiện đại.',
      'Cập nhật công nghệ xe điện và Hybrid mới nhất.',
    ],
    objectionHandling: [
      'Sợ lấm lem dầu mỡ: -> Kỹ sư ô tô hiện đại làm việc với máy chẩn đoán lỗi bằng máy tính, rất sạch sẽ và chuyên nghiệp.',
    ],
  },
  {
    title: 'Công nghệ Ô tô – Tỉnh xa',
    priority: 75,
    triggerConditions: [
      { field: 'educationLevel', operator: 'EQUALS', value: OTO },
      { field: 'province', operator: 'NOT_IN', value: ['Hà Nội'] },
    ],
    strategy:
      'Cam kết việc làm tại các đại lý Toyota, Kia... ở Hà Nội. Nhấn mạnh việc học nghề cứng thì về quê mở xưởng cũng rất giàu.',
    keySellingPoints: [
      'Học nghề cứng, không lo thất nghiệp ở cả thành phố lẫn quê.',
      'Trường giới thiệu thực tập có lương tại gara lớn.',
    ],
    objectionHandling: [
      'Chi phí học có tốn thêm tiền vật tư không: -> Học phí đã bao gồm toàn bộ vật tư thực hành cơ bản.',
    ],
  },
  {
    title: 'Quản trị Khách sạn – Ngoại hình sáng',
    priority: 80,
    triggerConditions: [{ field: 'educationLevel', operator: 'EQUALS', value: KS }],
    strategy:
      'Đánh vào sự hào nhoáng, sang trọng của nghề. Được thực tập tại các resort 5 sao. Cơ hội du lịch và gặp gỡ giới tinh hoa.',
    keySellingPoints: [
      'Thực tập nhận lương (Paid Internship) tại Resort 5 sao.',
      'Môi trường học tập phong cách châu Âu, đồng phục đẹp.',
    ],
    objectionHandling: [
      'Tiếng Anh em kém: -> Trường đào tạo Tiếng Anh chuyên ngành từ con số 0, tập trung giao tiếp.',
    ],
  },
  {
    title: 'Quản trị Khách sạn – COLD (Nghĩ nghề này làm phục vụ)',
    priority: 60,
    triggerConditions: [
      { field: 'educationLevel', operator: 'EQUALS', value: KS },
      { field: 'priorityTag', operator: 'EQUALS', value: 'COLD' },
    ],
    strategy:
      'Gỡ bỏ định kiến «làm bồi bàn». Giải thích lộ trình thăng tiến lên Giám sát, Quản lý tiền sảnh (Front Office Manager) với mức lương nghìn đô.',
    keySellingPoints: [
      'Đào tạo tư duy Quản lý, không chỉ đào tạo nghề phục vụ.',
      'Cơ hội làm việc trên các siêu du thuyền quốc tế.',
    ],
    objectionHandling: [
      'Bố mẹ chê nghề phục vụ: -> Nghề Dịch vụ hiếu khách (Hospitality) là ngành công nghiệp triệu đô, rất được tôn trọng.',
    ],
  },
  {
    title: 'Ô tô / Khách sạn – Nguồn từ Form Ads',
    priority: 50,
    triggerConditions: [
      { field: 'source', operator: 'CONTAINS', value: 'Facebook' },
      { field: 'educationLevel', operator: 'IN', value: [OTO, KS] },
    ],
    strategy:
      'Khách từ quảng cáo thường quyết định nhanh nhưng dễ quên. Gọi trong 15 phút. Xác nhận lại thông tin và gửi ngay tài liệu hình ảnh xưởng / phòng thực hành khách sạn.',
    keySellingPoints: [
      'Học đi đôi với hành, cam kết việc làm 100%.',
      'Cơ sở vật chất đầu tư mô phỏng doanh nghiệp.',
    ],
    objectionHandling: [
      'Em bấm nhầm: -> Dạ không sao ạ. Nếu em tiện, kết bạn Zalo để chị gửi hình cơ sở vật chất cho em tham khảo.',
    ],
  },
  {
    title: 'Khách Nội thành Hà Nội – Đánh mạnh Tuyến xe',
    priority: 40,
    triggerConditions: [{ field: 'province', operator: 'EQUALS', value: 'Hà Nội' }],
    strategy:
      'Học sinh Hà Nội có nhiều lựa chọn. Nhấn mạnh tiện lợi (xe đưa đón, lộ trình rõ), môi trường học hiện đại và trải nghiệm thực tế tại trường.',
    keySellingPoints: [
      'Có hệ thống xe Bus đưa đón toàn Hà Nội.',
      'Môi trường học tập năng động, nhiều sự kiện giải trí.',
    ],
    objectionHandling: [
      'Trường xa nhà em: -> Trường có xe đưa đón tận ngõ, lên xe ngủ 1 giấc là tới trường ạ.',
    ],
  },
  {
    title: 'Khách Ngoại thành Hà Nội (Sóc Sơn, Ba Vì...)',
    priority: 45,
    triggerConditions: [
      { field: 'province', operator: 'EQUALS', value: 'Hà Nội' },
      { field: 'priorityTag', operator: 'EQUALS', value: 'HOT' },
    ],
    strategy:
      'Nửa muốn trọ học nửa muốn đi về. Tư vấn linh hoạt KTX hoặc Bus tuyến dài. Đánh vào chi phí hợp lý hơn học nội thành trung tâm.',
    keySellingPoints: [
      'Vị trí trường tránh tắc đường, dễ dàng di chuyển.',
      'Học phí cạnh tranh so với các trường nội đô.',
    ],
    objectionHandling: [
      'Em muốn học trường giữa trung tâm: -> Trung tâm rất tắc đường và chi phí đắt đỏ, khu vực trường mình không gian rộng rãi, thoáng mát hơn.',
    ],
  },
  {
    title: 'Khách Vùng Tây Bắc (Lào Cai, Yên Bái...)',
    priority: 55,
    triggerConditions: [
      {
        field: 'province',
        operator: 'IN',
        value: ['Lào Cai', 'Yên Bái', 'Phú Thọ', 'Vĩnh Phúc'],
      },
    ],
    strategy:
      'Tuyến đường bộ cao tốc thuận lợi. Nhấn mạnh việc dễ dàng bắt xe khách về quê cuối tuần. Tạo sự gần gũi, chân chất khi tư vấn.',
    keySellingPoints: [
      'Vị trí trường ngay trục đường chính, dễ bắt xe khách về tỉnh.',
      'Cộng đồng sinh viên Tây Bắc tại trường rất đông và đoàn kết.',
    ],
    objectionHandling: [
      'Sợ xa nhà nhớ nhà: -> Đường cao tốc đi lại rất nhanh, cuối tuần em về thăm nhà hoàn toàn tiện lợi.',
    ],
  },
  {
    title: 'Khách Vùng Đông Bắc (Quảng Ninh, Hải Phòng)',
    priority: 55,
    triggerConditions: [
      { field: 'province', operator: 'IN', value: ['Quảng Ninh', 'Hải Phòng', 'Hải Dương'] },
    ],
    strategy:
      'Tệp khách này gia đình thường có kinh tế khá hơn. Đừng bàn nhiều về học phí rẻ, hãy bán sự CHUYÊN NGHIỆP, CƠ SỞ VẬT CHẤT ĐẸP và VIỆC LÀM DOANH NGHIỆP LỚN.',
    keySellingPoints: [
      'Môi trường học tập chuẩn quốc tế, trang thiết bị hiện đại.',
      'Bảo chứng việc làm tại các tập đoàn lớn.',
    ],
    objectionHandling: [
      'Học phí trả 1 lần được không: -> Dạ được ạ, đóng 1 lần toàn khóa trường giảm thêm 15% và tặng laptop (theo chính sách hiện hành).',
    ],
  },
  {
    title: 'Khách miền Nam / Miền Trung (Đà Nẵng đổ vào)',
    priority: 50,
    triggerConditions: [
      { field: 'priorityTag', operator: 'EQUALS', value: 'HOT' },
      {
        field: 'province',
        operator: 'NOT_IN',
        value: ['Hà Nội', 'Thanh Hóa', 'Nghệ An'],
      },
    ],
    strategy:
      'Đề cao sự dũng cảm khi ra thủ đô học tập. Tư vấn chi tiết về việc đưa đón sân bay/bến xe ngày nhập học để phụ huynh yên tâm tuyệt đối.',
    keySellingPoints: [
      'Trường có đội tình nguyện đón tân sinh viên tại bến xe/sân bay.',
      'KTX ưu tiên phòng đẹp nhất cho sinh viên phương xa.',
    ],
    objectionHandling: [
      'Khí hậu ngoài Bắc lạnh sợ ốm: -> KTX có điều hòa 2 chiều và bình nóng lạnh đầy đủ ạ.',
    ],
  },
  {
    title: 'Lead MỚI TINH (NEW) – Mọi ngành',
    priority: 30,
    triggerConditions: [{ field: 'pipelineStatus', operator: 'EQUALS', value: 'NEW' }],
    strategy:
      'Mục tiêu duy nhất: Tốc độ. Phải là người gọi đầu tiên trước các trường đối thủ. Kịch bản chào hỏi nhanh, xác nhận thông tin và tạo sự hứng khởi.',
    keySellingPoints: [
      'Chúc mừng em đã đăng ký nhận thông tin từ trường Cao đẳng Việt Mỹ.',
      'Em là một trong 50 bạn đầu tiên được ưu tiên tư vấn lộ trình.',
    ],
    objectionHandling: [
      'Đang bận không nghe được: -> Em nhắn Zalo anh/chị thông tin tóm tắt nhé, tối anh/chị gọi lại.',
    ],
  },
  {
    title: 'Đã gọi nhưng Kẹt lại (CONTACTED – WARM)',
    priority: 40,
    triggerConditions: [
      { field: 'pipelineStatus', operator: 'EQUALS', value: 'CONTACTED' },
      { field: 'priorityTag', operator: 'EQUALS', value: 'WARM' },
    ],
    strategy:
      'Khách đang ở vùng xám. Gọi lại với một «cái cớ» (Bên trường chuẩn bị chốt danh sách đợt 1 / Có hội thảo mới / Có chính sách ưu đãi mới).',
    keySellingPoints: [
      'Trường sắp hết hạn ưu đãi giảm 10% học phí.',
      'Chỉ còn 5 suất KTX giá rẻ.',
    ],
    objectionHandling: [
      'Em đang suy nghĩ thêm: -> Cứ đặt cọc giữ suất theo mức tối thiểu quy định, em không mất quyền lợi nếu còn trong thời hạn hoàn cọc — để vụt mất ưu đãi thì tiếc ạ.',
    ],
  },
  {
    title: 'Khách HOT – Sắp chốt (đang tư vấn tích cực)',
    priority: 90,
    triggerConditions: [
      { field: 'priorityTag', operator: 'EQUALS', value: 'HOT' },
      { field: 'status', operator: 'EQUALS', value: 'INTERESTED' },
    ],
    strategy:
      'Áp dụng kỹ thuật chốt giả định (Assumptive Close). Thay vì hỏi «Em có nhập học không?», hãy hỏi «Em chuyển khoản cọc bằng Vietcombank hay Sacombank để chị làm hồ sơ?».',
    keySellingPoints: [
      'Thủ tục nhập học online nhanh chóng trong 5 phút.',
      'Gửi ngay Giấy báo trúng tuyển bản PDF qua Zalo.',
    ],
    objectionHandling: [
      'Phụ huynh muốn lên tận nơi xem mới đóng tiền: -> Dạ em mời cô chú cuối tuần này lên trường, em sẽ đích thân dẫn gia đình đi tham quan ạ.',
    ],
  },
  {
    title: 'Khách COLD đã liên hệ (cân nhắc trường khác)',
    priority: 80,
    triggerConditions: [
      { field: 'priorityTag', operator: 'EQUALS', value: 'COLD' },
      { field: 'pipelineStatus', operator: 'EQUALS', value: 'CONTACTED' },
    ],
    strategy:
      'Đóng vai trò là «Chuyên gia hướng nghiệp» thay vì «Người bán hàng». Hỏi chân thành xem rào cản lớn nhất của họ là gì (Tiền? Uy tín trường? Ngành học?).',
    keySellingPoints: [
      'Tư vấn hướng nghiệp hoàn toàn miễn phí, không ép buộc.',
      'Hỗ trợ sinh viên định hướng lại đam mê thực sự.',
    ],
    objectionHandling: [
      'Trường khác báo học phí rẻ hơn: -> Mình so sánh cả chất lượng thực hành và cam kết học phí: trường mình không tăng học phí trong khóa và đầu tư phòng lab hiện đại — em cân nhắc tổng chi phí để ra nghề ạ.',
    ],
  },
  {
    title: 'Nuôi Zalo – thêm [no_answer_7d] vào mô tả lead',
    priority: 85,
    triggerConditions: [{ field: 'description', operator: 'CONTAINS', value: '[no_answer_7d]' }],
    strategy:
      'Chuyển trạng thái sang «Nuôi Zalo». Không gọi điện làm phiền nữa. Dùng ZNS gửi một tin nhắn gây tò mò. (Điều kiện: TVV gắn chuỗi [no_answer_7d] vào mô tả lead khi không bắt máy > 7 ngày.)',
    keySellingPoints: [
      'Cập nhật thông tin tuyển sinh mới nhất qua Zalo.',
      'Hình ảnh thực tế hoạt động sôi nổi của sinh viên.',
    ],
    objectionHandling: [
      '(Không có phản hồi) -> Chỉ cần đảm bảo họ xem được Zalo status của TVV hàng ngày.',
    ],
  },
  {
    title: 'Phụ huynh phản đối trường tư / so với công lập',
    priority: 80,
    triggerConditions: [{ field: 'description', operator: 'CONTAINS', value: 'công lập' }],
    strategy:
      'Thay đổi tư duy phụ huynh. Phân tích trường công học nặng lý thuyết, cơ sở vật chất cũ. Trường tư giáo trình update liên tục theo doanh nghiệp, chăm sóc sinh viên như khách hàng.',
    keySellingPoints: [
      'Giáo trình chuẩn quốc tế, sát với nhu cầu doanh nghiệp.',
      'Dịch vụ chăm sóc sinh viên 24/7, phòng học điều hòa 100%.',
    ],
    objectionHandling: [
      'Bằng trường công mới dễ xin việc: -> Doanh nghiệp giờ test năng lực thực tế (thử việc), không quan trọng bằng công hay tư đâu cô chú ạ.',
    ],
  },
  {
    title: 'Đang phân vân với Đại học (mô tả có «đại học»)',
    priority: 75,
    triggerConditions: [
      { field: 'priorityTag', operator: 'EQUALS', value: 'WARM' },
      { field: 'description', operator: 'CONTAINS', value: 'đại học' },
    ],
    strategy:
      'Tấn công vào điểm yếu của ĐH top dưới (bằng cấp kém giá trị, học phí cao, dễ thất nghiệp). Bán Cao đẳng VietMy như một «Lựa chọn an toàn và thực dụng».',
    keySellingPoints: [
      'Tốt nghiệp Cao đẳng xuất sắc có giá hơn Đại học trung bình.',
      'Ra trường sớm 1.5 năm, tiết kiệm hàng trăm triệu đồng cho bố mẹ.',
    ],
    objectionHandling: [
      'Vẫn muốn cái danh Đại học: -> Học xong Cao đẳng, đi làm có lương rồi em liên thông lên Đại học dễ như trở bàn tay.',
    ],
  },
  {
    title: 'Lead hỏi học phí (mô tả có «học phí»)',
    priority: 90,
    triggerConditions: [{ field: 'description', operator: 'CONTAINS', value: 'học phí' }],
    strategy:
      'Không báo giá 1 cục ngay lập tức (dễ gây shock). Báo giá theo học kỳ, nhấn mạnh «Cam kết không tăng học phí», «Bao gồm vật tư» — chi tiết đối chiếu kho tri thức RAG.',
    keySellingPoints: [
      'Học phí niêm yết minh bạch, cam kết không tăng toàn khóa.',
      'Chia nhỏ đóng theo học kỳ, hỗ trợ trả góp.',
    ],
    objectionHandling: [
      'Chê đắt: -> Tính ra mỗi tháng chỉ bằng tiền học thêm cấp 3, mà em lại được học nghề có lương sau này ạ.',
    ],
  },
  {
    title: 'Khách hỏi KTX / nhà trọ (mô tả có «ktx»)',
    priority: 85,
    triggerConditions: [{ field: 'description', operator: 'CONTAINS', value: 'ktx' }],
    strategy:
      'Xây dựng hình ảnh an toàn tuyệt đối. Phụ huynh ở quê cực kỳ sợ con lên thành phố sa ngã. Bán KTX như một «Trại huấn luyện» an toàn.',
    keySellingPoints: [
      'KTX khép kín, camera an ninh, bảo vệ 24/24.',
      'Quản lý giờ giấc chặt chẽ, có khu tự học.',
    ],
    objectionHandling: [
      'Sợ phòng chật/nóng: -> Có option phòng 4 người máy lạnh tiêu chuẩn như khách sạn để gia đình lựa chọn ạ.',
    ],
  },
  {
    title: 'Giới thiệu bạn bè / nhóm (nguồn Giới thiệu)',
    priority: 80,
    triggerConditions: [{ field: 'source', operator: 'CONTAINS', value: 'Giới thiệu' }],
    strategy:
      'Đánh vào tâm lý bầy đàn và lợi ích tài chính. Cung cấp gói «Học bổng nhóm». Thúc giục bạn này chốt để cả 2 cùng được ưu đãi.',
    keySellingPoints: [
      'Chính sách học bổng giới thiệu/đăng ký nhóm giảm 10%.',
      'Hỗ trợ xếp chung phòng KTX cho 2 bạn.',
    ],
    objectionHandling: [
      'Bạn em đổi ý học trường khác rồi: -> Em hãy quyết định vì tương lai của chính em, lên trường em sẽ có rất nhiều bạn mới xuất sắc.',
    ],
  },
  {
    title: 'Chiến dịch Early Bird (CONTACTED + WARM)',
    priority: 70,
    triggerConditions: [
      { field: 'pipelineStatus', operator: 'EQUALS', value: 'CONTACTED' },
      { field: 'priorityTag', operator: 'EQUALS', value: 'WARM' },
    ],
    strategy:
      'Tạo FOMO. Gọi điện thông báo: Chỉ còn vài ngày nữa là chốt danh sách tặng Laptop/Giảm 15% học phí (theo chính sách hiện hành).',
    keySellingPoints: [
      'Tặng laptop / giảm học phí theo đợt (đối chiếu kho tri thức).',
      'Giảm 10% nếu cọc trước ngày 30/06 (nếu áp dụng).',
    ],
    objectionHandling: [
      'Nhà chưa lo đủ tiền: -> Chỉ cần cọc 2 triệu giữ ưu đãi, đến tháng 8 đóng phần còn lại vẫn được tính ạ.',
    ],
  },
  {
    title: 'Summer Melt – Đã cọc (chống rơi rụng)',
    priority: 95,
    triggerConditions: [{ field: 'status', operator: 'EQUALS', value: 'DEPOSIT_PAID' }],
    strategy:
      'Khách đã cọc nhưng tháng 8 mới nhập học, rất dễ bị đối thủ cướp. Gọi điện hỏi thăm sức khỏe, mời tham gia mini-game trên Fanpage, hoặc gửi áo đồng phục về tận nhà làm quà.',
    keySellingPoints: [
      'Chào mừng tân sinh viên chính thức của VietMy.',
      'Nhà trường gửi tặng bộ quà tặng nhập học về tận nhà.',
    ],
    objectionHandling: [
      'Muốn xin rút cọc vì đỗ ĐH: -> Xử lý theo quy định, cố gắng thuyết phục giữ lại bằng bài toán thời gian và việc làm.',
    ],
  },
  {
    title: 'Hỗ trợ vay vốn (mô tả có «vay»)',
    priority: 80,
    triggerConditions: [{ field: 'description', operator: 'CONTAINS', value: 'vay' }],
    strategy:
      'Đồng cảm sâu sắc. Thể hiện nhà trường luôn có tính nhân văn. Tư vấn rõ ràng quy trình xin Giấy xác nhận để vay vốn ngân hàng chính sách tại địa phương.',
    keySellingPoints: [
      'Cấp giấy xác nhận sinh viên miễn phí ngay tuần đầu.',
      'Hỗ trợ làm hồ sơ trả góp 0% qua thẻ tín dụng (theo chính sách).',
    ],
    objectionHandling: [
      'Thủ tục vay rắc rối: -> Rất đơn giản, nhà trường làm sẵn form, gia đình chỉ việc mang ra xã đóng dấu là ngân hàng giải ngân ạ.',
    ],
  },
  {
    title: 'Cam kết việc làm bằng văn bản (mô tả có «cam kết»)',
    priority: 90,
    triggerConditions: [{ field: 'description', operator: 'CONTAINS', value: 'cam kết' }],
    strategy:
      'Thể hiện sự tự tin tuyệt đối của nhà trường. Không hứa suông. Nhấn mạnh vào văn bản hợp đồng ký kết rõ ràng ngày nhập học.',
    keySellingPoints: [
      'Hợp đồng cam kết việc làm ký bằng văn bản pháp lý.',
      'Hoàn 50% học phí nếu không bố trí được việc làm đúng chuyên ngành (theo điều kiện hợp đồng).',
    ],
    objectionHandling: [
      'Sợ trường hứa suông: -> Đây là văn bản pháp lý ký có mộc đỏ của Hiệu trưởng, em hoàn toàn yên tâm.',
    ],
  },
  {
    title: 'Lead LOSS – Thử gọi lại lần cuối',
    priority: 20,
    triggerConditions: [{ field: 'priorityTag', operator: 'EQUALS', value: 'LOSS' }],
    strategy:
      'Gọi với tâm thế «Không còn gì để mất». Đôi khi khách từ chối do hiểu lầm thông tin. Hỏi một câu chân thành cuối cùng về điều chưa hài lòng để trường cải thiện.',
    keySellingPoints: [
      'Lắng nghe chân thành, không chèo kéo.',
      'Sẵn sàng mở cửa đón sinh viên quay lại nếu có nhu cầu.',
    ],
    objectionHandling: [
      '(Nếu khách kể khó khăn) -> Đưa ra giải pháp cuối (Học bổng đặc biệt của Trưởng khoa phê duyệt) để cứu lại lead.',
    ],
  },
]

if (ALL.length !== 50) {
  console.error('Expected 50 playbooks, got', ALL.length)
  process.exit(1)
}

mkdirSync(outDir, { recursive: true })
const parts = chunk(ALL, 10)
parts.forEach((arr, i) => {
  const name = `${String(i + 1).padStart(2, '0')}.json`
  writeFileSync(join(outDir, name), JSON.stringify(arr, null, 2), 'utf8')
  console.log('Wrote', name, arr.length)
})
console.log('Done. Total', ALL.length)
