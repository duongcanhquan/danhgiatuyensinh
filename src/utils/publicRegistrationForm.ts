import type { PublicRegistrationFormInput } from '../services/publicRegistration'
import { DEFAULT_APPLICANT_CATEGORY_LABELS } from './applicantCategoryCatalog'
import { SCORE_PRESETS } from './publicRegistrationI18n'

export type PublicRegLang = 'vn' | 'en'

export function emptyPublicRegistrationForm(): PublicRegistrationFormInput {
  return {
    fullName: '',
    phone: '',
    studentEmail: '',
    dateOfBirth: '',
    gender: 'Nam',
    placeOfBirth: '',
    ethnicity: 'Kinh',
    nationalId: '',
    nationalIdNotAvailable: false,
    permanentAddress: '',
    fatherName: '',
    fatherPhone: '',
    motherName: '',
    motherPhone: '',
    highSchool: '',
    schoolProvince: '',
    applicantCategory: 'Học sinh lớp 12',
    educationLevel: '',
    studyIntention: '',
    majorInterest: '',
    academicPerformance: '',
    scorePreset: '8.0-9.0',
    customScore: '',
    counselorId: '',
    description: '',
  }
}

/** Gõ 25021984 → 25/02/1984 (DD/MM/YYYY). Nhận cả paste ISO YYYY-MM-DD. */
export function formatDobInput(raw: string): string {
  const trimmed = raw.trim()
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`
  let v = trimmed.replace(/\D/g, '')
  if (v.length > 8) v = v.slice(0, 8)
  if (v.length >= 5) return `${v.slice(0, 2)}/${v.slice(2, 4)}/${v.slice(4)}`
  if (v.length >= 3) return `${v.slice(0, 2)}/${v.slice(2)}`
  return v
}

/**
 * Chuẩn hoá ngày sinh về DD/MM/YYYY khi load hồ sơ (ISO / DD-MM-YYYY / digits).
 * Chuỗi rỗng hoặc không nhận diện được → trả về trim gốc (không phá dữ liệu lạ).
 */
export function normalizeDobToDdMmYyyy(raw: string): string {
  const t = raw.trim()
  if (!t) return ''
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(t)) return t
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`
  const dmyDash = t.match(/^(\d{2})-(\d{2})-(\d{4})$/)
  if (dmyDash) return `${dmyDash[1]}/${dmyDash[2]}/${dmyDash[3]}`
  const digits = t.replace(/\D/g, '')
  if (digits.length === 8) return formatDobInput(digits)
  return t
}

function daysInMonth(year: number, month: number): number {
  const dim = [
    31,
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ]
  return dim[month - 1] ?? 0
}

/** Lý do ngày sinh sai — dùng cho thông báo form (VD tháng 25). */
export function describePublicDobIssue(dob: string, now = new Date()): string | null {
  const t = normalizeDobToDdMmYyyy(dob)
  if (!t) return 'Vui lòng nhập ngày sinh (DD/MM/YYYY).'
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(t)) {
    return 'Ngày sinh dạng DD/MM/YYYY — ví dụ gõ 25021984 sẽ thành 25/02/1984.'
  }
  const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)!
  const day = Number(m[1])
  const month = Number(m[2])
  const year = Number(m[3])
  if (month < 1 || month > 12) {
    return `Tháng không hợp lệ (${m[2]}). Ngày/tháng/năm theo DD/MM/YYYY (vd 25/02/1984).`
  }
  const maxDay = daysInMonth(year, month)
  if (day < 1 || day > maxDay) {
    return `Ngày không hợp lệ (${m[1]}/${m[2]}/${m[3]}).`
  }
  if (year < 1950) return 'Năm sinh không hợp lệ.'
  const birth = new Date(year, month - 1, day)
  if (birth.getFullYear() !== year || birth.getMonth() !== month - 1 || birth.getDate() !== day) {
    return 'Ngày sinh không hợp lệ.'
  }
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (birth > today) return 'Ngày sinh không được ở tương lai.'
  const ageYears =
    today.getFullYear() -
    year -
    (today.getMonth() < month - 1 || (today.getMonth() === month - 1 && today.getDate() < day)
      ? 1
      : 0)
  if (ageYears < 12 || ageYears > 70) {
    return 'Tuổi cần trong khoảng 12–70.'
  }
  return null
}

export function isValidPublicDob(dob: string, now = new Date()): boolean {
  return describePublicDobIssue(dob, now) === null
}

/** Chuẩn hoá SĐT VN → 10 số bắt đầu 0 (84xxxxxxxxx → 0xxxxxxxxx). */
export function normalizeVnPhoneDigits(raw: string): string {
  let d = raw.replace(/\D/g, '')
  if (d.startsWith('84') && d.length >= 11) d = `0${d.slice(2)}`
  return d
}

/** Gõ SĐT chỉ giữ tối đa 10 số. */
export function formatVnPhoneInput(raw: string): string {
  return normalizeVnPhoneDigits(raw).slice(0, 10)
}

/** Điện thoại VN đủ đúng 10 số (bắt đầu 0). */
export function isValidPublicPhone(phone: string): boolean {
  return /^0\d{9}$/.test(normalizeVnPhoneDigits(phone))
}

/**
 * Chỉ cần một trong ba SĐT (sinh viên / mẹ / cha) hợp lệ.
 * Ô nào điền thì phải đúng 10 số bắt đầu bằng 0.
 */
export function describeContactPhonesIssue(
  phones: {
    phone?: string
    motherPhone?: string
    fatherPhone?: string
    parentPhone?: string
  },
  lang: PublicRegLang = 'vn',
): string | null {
  const student = String(phones.phone ?? '').trim()
  const mother = String(phones.motherPhone ?? '').trim()
  const father = String(phones.fatherPhone ?? '').trim()
  const contact = String(phones.parentPhone ?? '').trim()

  const candidates = [student, mother, father].filter(Boolean)
  if (!candidates.length) {
    return lang === 'en'
      ? 'Enter at least one phone: student, mother, or father (exactly 10 digits, start with 0).'
      : 'Cần ít nhất một số điện thoại: sinh viên, mẹ hoặc cha — đủ đúng 10 số (bắt đầu bằng 0).'
  }
  if (student && !isValidPublicPhone(student)) {
    return lang === 'en'
      ? 'Student phone must be exactly 10 digits (start with 0).'
      : 'SĐT sinh viên phải đủ đúng 10 số (bắt đầu bằng 0).'
  }
  if (mother && !isValidPublicPhone(mother)) {
    return lang === 'en'
      ? 'Mother’s phone must be exactly 10 digits.'
      : 'SĐT mẹ phải đủ đúng 10 số.'
  }
  if (father && !isValidPublicPhone(father)) {
    return lang === 'en'
      ? 'Father’s phone must be exactly 10 digits.'
      : 'SĐT cha phải đủ đúng 10 số.'
  }
  if (contact && !isValidPublicPhone(contact)) {
    return lang === 'en'
      ? 'Contact phone must be exactly 10 digits.'
      : 'SĐT người liên hệ phải đủ đúng 10 số.'
  }
  return null
}

/** SĐT chính + SĐT phụ huynh để ghi CRM (ưu tiên SV → mẹ → cha). */
export function resolvePublicRegistrationPhones(phones: {
  phone?: string
  motherPhone?: string
  fatherPhone?: string
  parentPhone?: string
}): { phone: string; parentPhone: string; motherPhone: string; fatherPhone: string } {
  const student = normalizeVnPhoneDigits(String(phones.phone ?? ''))
  const mother = normalizeVnPhoneDigits(String(phones.motherPhone ?? ''))
  const father = normalizeVnPhoneDigits(String(phones.fatherPhone ?? ''))
  const contact = normalizeVnPhoneDigits(String(phones.parentPhone ?? ''))
  const phone = student || mother || father || contact
  const parentPhone = mother || father || contact || student
  return { phone, parentPhone, motherPhone: mother, fatherPhone: father }
}

/** Email bắt buộc có @ và dạng cơ bản hợp lệ. */
export function isValidStudentEmail(email: string): boolean {
  const e = email.trim()
  if (!e.includes('@')) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
}

/** CCCD/CMND: đúng 9 hoặc 12 số; hộ chiếu chữ+số 7–15. */
export function isValidPublicNationalId(raw: string, notAvailable: boolean): boolean {
  const v = raw.trim().toUpperCase()
  if (notAvailable || v === 'CHƯA CÓ') return true
  if (/^\d+$/.test(v) && (v.length === 9 || v.length === 12)) return true
  if (/^[A-Z0-9]{7,15}$/.test(v) && !/^\d+$/.test(v)) return true
  return false
}

export function isValidPublicCustomScore(raw: string): boolean {
  const v = raw.trim().replace(',', '.')
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(v)) return false
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 && n <= 10
}

export function resolveAcademicPerformance(form: PublicRegistrationFormInput): string {
  if (form.scorePreset === 'Khác') return form.customScore.trim().replace(',', '.')
  return form.scorePreset.trim()
}

const ALLOWED_GENDERS = new Set<string>(['Nam', 'Nữ'])
const ALLOWED_CATEGORIES = new Set<string>(DEFAULT_APPLICANT_CATEGORY_LABELS)
const ALLOWED_SCORE_PRESETS = new Set<string>(SCORE_PRESETS.map((s) => s.value))

export function validatePublicRegistrationForm(
  form: PublicRegistrationFormInput,
  lang: PublicRegLang = 'vn',
  opts?: {
    trainingProgramLabels?: readonly string[]
    majorLabels?: readonly string[]
    counselorIds?: readonly string[]
    /** Nhãn đối tượng từ masterData; trống → dùng seed mặc định. */
    applicantCategoryLabels?: readonly string[]
  },
): string | null {
  const t =
    lang === 'en'
      ? {
          name: 'Please enter full name.',
          dob: 'Date of birth must be DD/MM/YYYY (e.g. type 25021984 → 25/02/1984).',
          gender: 'Please select gender.',
          pob: 'Please enter place of birth.',
          ethnicity: 'Please enter ethnicity.',
          id: 'National ID must be exactly 9 or 12 digits; passport 7–15 alphanumeric.',
          phone: 'Phone must be exactly 10 digits (start with 0).',
          email: 'Email must include @ and be valid (e.g. name@school.edu.vn).',
          address: 'Please enter permanent address.',
          fatherPhone: 'Father’s phone must be exactly 10 digits.',
          school: 'Please enter school attended.',
          schoolProvince: 'Please enter school province/city.',
          situation: 'Please select applicant category.',
          situationInvalid: 'Selected applicant category is not in the current list.',
          edu: 'Please select education system.',
          eduInvalid: 'Selected education system is invalid.',
          major: 'Please select major.',
          majorInvalid: 'Selected major does not match the education system.',
          score: 'Please select or enter GPA.',
          scoreCustom: 'Enter a GPA from 0 to 10 (e.g. 7.8).',
          counselor: 'Please select an admission counselor.',
          counselorInvalid: 'Selected counselor is not available on this portal.',
        }
      : {
          name: 'Vui lòng nhập họ và tên.',
          dob: 'Ngày sinh dạng DD/MM/YYYY — ví dụ gõ 25021984 → 25/02/1984.',
          gender: 'Vui lòng chọn giới tính.',
          pob: 'Vui lòng nhập nơi sinh.',
          ethnicity: 'Vui lòng nhập dân tộc.',
          id: 'CCCD/CMND phải đủ đúng 9 hoặc 12 số; hộ chiếu 7–15 ký tự chữ và số.',
          phone: 'Số điện thoại phải đủ đúng 10 số (bắt đầu bằng 0).',
          email: 'Email phải có @ và hợp lệ (vd: ten@truong.edu.vn).',
          address: 'Vui lòng nhập địa chỉ thường trú.',
          fatherPhone: 'SĐT cha phải đủ đúng 10 số.',
          school: 'Vui lòng nhập trường đã theo học.',
          schoolProvince: 'Vui lòng nhập tỉnh/thành của trường.',
          situation: 'Vui lòng chọn đối tượng dự tuyển.',
          situationInvalid: 'Đối tượng dự tuyển không nằm trong danh mục hiện tại.',
          edu: 'Vui lòng chọn hệ đào tạo.',
          eduInvalid: 'Hệ đào tạo không nằm trong danh mục hiện tại.',
          major: 'Vui lòng chọn ngành học.',
          majorInvalid: 'Ngành học không khớp hệ đào tạo đã chọn.',
          score: 'Vui lòng chọn hoặc nhập điểm trung bình.',
          scoreCustom: 'Nhập điểm từ 0 đến 10 (vd: 7.8).',
          counselor: 'Vui lòng chọn thầy/cô tư vấn hướng dẫn.',
          counselorInvalid: 'Thầy/cô đã chọn không còn trên cổng đăng ký.',
        }

  if (!form.fullName.trim()) return t.name
  const dobIssue = describePublicDobIssue(form.dateOfBirth)
  if (dobIssue) return lang === 'en' ? t.dob : dobIssue
  if (!ALLOWED_GENDERS.has(form.gender.trim())) return t.gender
  if (!form.placeOfBirth.trim()) return t.pob
  if (!form.ethnicity.trim()) return t.ethnicity
  if (!isValidPublicNationalId(form.nationalId, form.nationalIdNotAvailable)) return t.id
  if (!isValidStudentEmail(form.studentEmail)) return t.email
  if (!form.permanentAddress.trim()) return t.address
  const phoneIssue = describeContactPhonesIssue(
    {
      phone: form.phone,
      motherPhone: form.motherPhone,
      fatherPhone: form.fatherPhone,
      parentPhone: form.parentPhone,
    },
    lang,
  )
  if (phoneIssue) return phoneIssue
  if (!form.highSchool.trim()) return t.school
  if (!form.schoolProvince.trim()) return t.schoolProvince

  const category = form.applicantCategory.trim()
  if (!category) return t.situation
  const allowedCategories =
    opts?.applicantCategoryLabels && opts.applicantCategoryLabels.length > 0
      ? new Set(opts.applicantCategoryLabels.map((x) => x.trim()).filter(Boolean))
      : ALLOWED_CATEGORIES
  if (!allowedCategories.has(category)) return t.situationInvalid

  const study = (form.studyIntention || form.educationLevel).trim()
  if (!study) return t.edu
  if (opts?.trainingProgramLabels?.length && !opts.trainingProgramLabels.includes(study)) {
    return t.eduInvalid
  }

  if (!form.majorInterest.trim()) return t.major
  if (opts?.majorLabels?.length && !opts.majorLabels.includes(form.majorInterest.trim())) {
    return t.majorInvalid
  }

  if (!ALLOWED_SCORE_PRESETS.has(form.scorePreset)) return t.score
  if (form.scorePreset === 'Khác') {
    if (!isValidPublicCustomScore(form.customScore)) return t.scoreCustom
  } else if (!resolveAcademicPerformance(form)) {
    return t.score
  }

  if (!form.counselorId.trim()) return t.counselor
  if (opts?.counselorIds?.length && !opts.counselorIds.includes(form.counselorId.trim())) {
    return t.counselorInvalid
  }
  return null
}

export const PUBLIC_REG_INPUT_CLS =
  'w-full rounded-[10px] border border-slate-200 bg-[#fafafa] px-3.5 py-3 text-sm text-slate-900 outline-none transition focus:border-[#0056b3] focus:bg-white focus:ring-4 focus:ring-[#0056b3]/10'
