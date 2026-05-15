import type { LeadCoreDraft } from '../utils/leadProfileEdit'

function Field({
  label,
  hint,
  target,
  children,
}: {
  label: string
  hint?: string
  /** Tên trường trên lead / engine (cho quy tắc chấm điểm & AI). */
  target?: string
  children: React.ReactNode
}) {
  return (
    <label className="block min-w-0">
      <span className="flex flex-wrap items-baseline gap-x-1.5 text-[11px] font-medium text-slate-600">
        <span>{label}</span>
        {target ? (
          <code
            className="rounded bg-slate-100 px-1 font-mono text-[10px] text-slate-700"
            title="Dùng làm targetField trong profile chấm điểm / tác vụ AI"
          >
            {target}
          </code>
        ) : null}
      </span>
      {hint ? <span className="mt-0.5 block text-[10px] leading-snug text-slate-500">{hint}</span> : null}
      <div className="mt-0.5">{children}</div>
    </label>
  )
}

export function LeadProfileCoreForm({
  draft,
  onChange,
  disabled,
}: {
  draft: LeadCoreDraft
  onChange: (next: LeadCoreDraft) => void
  disabled: boolean
}) {
  const patch = <K extends keyof LeadCoreDraft>(k: K, v: string) => onChange({ ...draft, [k]: v })

  const inputCls =
    'w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:ring-1 focus:ring-emerald-500/40 disabled:bg-slate-50 disabled:text-slate-500'

  return (
    <div className="space-y-3 text-slate-800">
      <details open className="group rounded-lg border border-slate-200/90 bg-white p-2 shadow-sm">
        <summary className="cursor-pointer list-none text-xs font-bold uppercase tracking-wide text-slate-700 marker:content-none [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-2">
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-900">1</span>
            Liên hệ &amp; nguồn
          </span>
        </summary>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Field label="Họ tên" target="fullName">
            <input className={inputCls} value={draft.fullName} disabled={disabled} onChange={(e) => patch('fullName', e.target.value)} />
          </Field>
          <Field label="Mã khách hàng" target="customerId">
            <input className={inputCls} value={draft.customerId} disabled={disabled} onChange={(e) => patch('customerId', e.target.value)} />
          </Field>
          <Field label="Ngày sinh" target="dateOfBirth" hint="Chuỗi tự do (vd. 15/03/2008 hoặc 2008-03-15) — có thể chấm IS_NOT_EMPTY / CONTAINS năm.">
            <input className={inputCls} value={draft.dateOfBirth} disabled={disabled} onChange={(e) => patch('dateOfBirth', e.target.value)} />
          </Field>
          <Field label="Điện thoại SV" target="phone">
            <input className={inputCls} inputMode="tel" value={draft.phone} disabled={disabled} onChange={(e) => patch('phone', e.target.value)} />
          </Field>
          <Field label="ĐT người liên hệ" target="parentPhone">
            <input className={inputCls} inputMode="tel" value={draft.parentPhone} disabled={disabled} onChange={(e) => patch('parentPhone', e.target.value)} />
          </Field>
          <Field label="Nguồn tiếp nhận" target="source / leadSource" hint="Chấm điểm: thường dùng source hoặc leadSource (cùng giá trị).">
            <input className={inputCls} value={draft.source} disabled={disabled} onChange={(e) => patch('source', e.target.value)} />
          </Field>
        </div>
      </details>

      <details open className="rounded-lg border border-slate-200/90 bg-white p-2 shadow-sm">
        <summary className="cursor-pointer list-none text-xs font-bold uppercase tracking-wide text-slate-700 marker:content-none [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-2">
            <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-900">2</span>
            Địa lý &amp; trường lớp
          </span>
        </summary>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Field label="Tỉnh / TP" target="province / region">
            <input className={inputCls} value={draft.province} disabled={disabled} onChange={(e) => patch('province', e.target.value)} />
          </Field>
          <Field label="Quận/ huyện" target="hanoiArea" hint="Cột Excel quy chuẩn; IN_LIST nếu map danh mục hanoi_areas.">
            <input className={inputCls} value={draft.hanoiArea} disabled={disabled} onChange={(e) => patch('hanoiArea', e.target.value)} />
          </Field>
          <Field label="Địa chỉ" target="address">
            <input className={inputCls} value={draft.address} disabled={disabled} onChange={(e) => patch('address', e.target.value)} />
          </Field>
          <Field label="Trường THPT" target="highSchool / highSchoolName">
            <input className={inputCls} value={draft.highSchool} disabled={disabled} onChange={(e) => patch('highSchool', e.target.value)} />
          </Field>
          <Field label="Lớp hiện đang học" target="gradeClass">
            <input className={inputCls} value={draft.gradeClass} disabled={disabled} onChange={(e) => patch('gradeClass', e.target.value)} />
          </Field>
        </div>
      </details>

      <details open className="rounded-lg border border-slate-200/90 bg-white p-2 shadow-sm">
        <summary className="cursor-pointer list-none text-xs font-bold uppercase tracking-wide text-slate-700 marker:content-none [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-2">
            <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-900">3</span>
            Học tập &amp; định hướng
          </span>
        </summary>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Field label="Hệ đào tạo" target="educationLevel" hint="Khác «Ngành quan tâm» — dùng cho fallback khi chưa tách cột.">
            <input className={inputCls} value={draft.educationLevel} disabled={disabled} onChange={(e) => patch('educationLevel', e.target.value)} />
          </Field>
          <Field label="Ngành quan tâm" target="majorInterest">
            <input className={inputCls} value={draft.majorInterest} disabled={disabled} onChange={(e) => patch('majorInterest', e.target.value)} />
          </Field>
          <Field label="Học lực / xếp loại" target="academicLevel" hint="Engine chấm điểm đọc academicPerformance → academicLevel.">
            <input className={inputCls} value={draft.academicPerformance} disabled={disabled} onChange={(e) => patch('academicPerformance', e.target.value)} />
          </Field>
          <Field label="Dự định (hình thức)" target="studyIntention">
            <input className={inputCls} value={draft.studyIntention} disabled={disabled} onChange={(e) => patch('studyIntention', e.target.value)} />
          </Field>
          <Field label="Loại hình trường" target="schoolType / schoolTypeKey" hint="Nhãn gốc trên hồ sơ; schoolTypeKey do engine suy ra khi chấm.">
            <input className={inputCls} value={draft.schoolType} disabled={disabled} onChange={(e) => patch('schoolType', e.target.value)} />
          </Field>
          <Field label="Nhóm tài chính" target="financialStatus">
            <input className={inputCls} value={draft.financialStatus} disabled={disabled} onChange={(e) => patch('financialStatus', e.target.value)} />
          </Field>
        </div>
      </details>

      <details open className="rounded-lg border border-amber-200/90 bg-amber-50/40 p-2 shadow-sm">
        <summary className="cursor-pointer list-none text-xs font-bold uppercase tracking-wide text-amber-950 marker:content-none [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-2">
            <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-950">4</span>
            Nội dung mô tả (tách bạch — tránh nhầm cho AI / chấm điểm)
          </span>
        </summary>
        <div className="mt-2 space-y-2">
          <Field label="Mong muốn" target="aspirations" hint="Trùng cột «Mong muốn» trên Excel mẫu 20 cột.">
            <textarea rows={3} className={`${inputCls} resize-y`} value={draft.aspirations} disabled={disabled} onChange={(e) => patch('aspirations', e.target.value)} />
          </Field>
          <Field label="Ghi chú 1" target="profileNote1" hint="Tách khỏi Ghi chú 2 và «Nội dung lưu ý khác» — dễ map quy tắc CONTAINS.">
            <textarea rows={2} className={`${inputCls} resize-y`} value={draft.profileNote1} disabled={disabled} onChange={(e) => patch('profileNote1', e.target.value)} />
          </Field>
          <Field label="Ghi chú 2" target="profileNote2">
            <textarea rows={2} className={`${inputCls} resize-y`} value={draft.profileNote2} disabled={disabled} onChange={(e) => patch('profileNote2', e.target.value)} />
          </Field>
          <Field label="Nội dung lưu ý khác" target="otherAttentionNotes">
            <textarea rows={2} className={`${inputCls} resize-y`} value={draft.otherAttentionNotes} disabled={disabled} onChange={(e) => patch('otherAttentionNotes', e.target.value)} />
          </Field>
          <Field
            label="Mô tả tổng hợp (legacy / import cũ)"
            target="description"
            hint="File cũ «Ghi chú thêm» / mô tả chung — vẫn dùng được làm targetField description."
          >
            <textarea rows={3} className={`${inputCls} resize-y`} value={draft.description} disabled={disabled} onChange={(e) => patch('description', e.target.value)} />
          </Field>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label="Sở thích" target="hobbies">
              <textarea rows={2} className={`${inputCls} resize-y`} value={draft.hobbies} disabled={disabled} onChange={(e) => patch('hobbies', e.target.value)} />
            </Field>
            <Field label="Ghi chú đi thực tế / khảo sát" target="fieldTripNotes">
              <textarea rows={2} className={`${inputCls} resize-y`} value={draft.fieldTripNotes} disabled={disabled} onChange={(e) => patch('fieldTripNotes', e.target.value)} />
            </Field>
          </div>
          <p className="rounded-md border border-slate-200/80 bg-white/80 px-2 py-1.5 text-[10px] leading-snug text-slate-600">
            <strong>Ghi chú tương tác TVV</strong> (buổi làm việc, đánh giá nhanh) nhập ở khối cam «Ghi chú tương tác» bên dưới — lưu vào lịch sử, tổng hợp cho AI qua{' '}
            <code className="font-mono text-[10px]">counselorNote</code>, <strong>không</strong> trộn vào ô «Mô tả chung» ở trên.
          </p>
        </div>
      </details>

      <details className="rounded-lg border border-slate-200/80 bg-slate-50/80 p-2">
        <summary className="cursor-pointer text-xs font-semibold text-slate-700">Bản đồ nhanh: import Excel → Lead</summary>
        <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-[10px] leading-snug text-slate-600">
          <li>
            Mẫu tải về / xuất đánh giá: <strong>20 cột</strong> quy chuẩn (tên cột giống file mẫu). Cột thêm (vd. «Tình
            trạng») vẫn map nếu có trong file.
          </li>
          <li>
            <strong>Mong muốn</strong> → <code className="font-mono">aspirations</code>; <strong>Ghi chú 1 / 2</strong> →{' '}
            <code className="font-mono">profileNote1</code>, <code className="font-mono">profileNote2</code>;{' '}
            <strong>Nội dung lưu ý khác</strong> → <code className="font-mono">otherAttentionNotes</code>
          </li>
          <li>
            <strong>Ngày sinh</strong> → <code className="font-mono">dateOfBirth</code> (chuỗi)
          </li>
          <li>
            <strong>Tư vấn viên</strong> (Excel) → gán <code className="font-mono">assignedTo</code> (UID); chấm điểm
            dùng targetField <code className="font-mono">assignedTo</code>
          </li>
          <li>
            <strong>Ghi chú thêm</strong> / mô tả cũ → <code className="font-mono">description</code>
          </li>
          <li>
            <strong>Học lực</strong> → <code className="font-mono">academicPerformance</code> (engine:{' '}
            <code className="font-mono">academicLevel</code>)
          </li>
        </ul>
      </details>
    </div>
  )
}
