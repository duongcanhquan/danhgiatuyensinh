import type { PublicRegistrationFormInput } from '../services/publicRegistration'
import { APPLICANT_CATEGORIES, SCORE_PRESETS } from './publicRegistrationI18n'

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

export function formatDobInput(raw: string): string {
  let v = raw.replace(/\D/g, '')
  if (v.length > 8) v = v.slice(0, 8)
  if (v.length >= 5) return `${v.slice(0, 2)}/${v.slice(2, 4)}/${v.slice(4)}`
  if (v.length >= 3) return `${v.slice(0, 2)}/${v.slice(2)}`
  return v
}

export function isValidPublicDob(dob: string, now = new Date()): boolean {
  const m = dob.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return false
  const day = Number(m[1])
  const month = Number(m[2])
  const year = Number(m[3])
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
  if (year < 1950 || month < 1 || month > 12 || day < 1 || day > dim[month - 1]!) return false
  const birth = new Date(year, month - 1, day)
  if (birth.getFullYear() !== year || birth.getMonth() !== month - 1 || birth.getDate() !== day) {
    return false
  }
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (birth > today) return false
  const ageYears =
    today.getFullYear() -
    year -
    (today.getMonth() < month - 1 || (today.getMonth() === month - 1 && today.getDate() < day)
      ? 1
      : 0)
  if (ageYears < 12 || ageYears > 70) return false
  return true
}

export function isValidPublicPhone(phone: string): boolean {
  return /^(0\d{9}|\+\d{9,15})$/.test(phone.trim())
}

export function isValidPublicNationalId(raw: string, notAvailable: boolean): boolean {
  const v = raw.trim().toUpperCase()
  if (notAvailable || v === 'CHƯA CÓ') return true
  if (/^\d+$/.test(v) && (v.length === 9 || v.length === 10 || v.length === 12)) return true
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
const ALLOWED_CATEGORIES = new Set<string>(APPLICANT_CATEGORIES.map((c) => c.value))
const ALLOWED_SCORE_PRESETS = new Set<string>(SCORE_PRESETS.map((s) => s.value))

export function validatePublicRegistrationForm(
  form: PublicRegistrationFormInput,
  lang: PublicRegLang = 'vn',
  opts?: {
    trainingProgramLabels?: readonly string[]
    majorLabels?: readonly string[]
    counselorIds?: readonly string[]
  },
): string | null {
  const t =
    lang === 'en'
      ? {
          name: 'Please enter full name.',
          dob: 'Date of birth must be DD/MM/YYYY and a realistic age (12–70).',
          gender: 'Please select gender.',
          pob: 'Please enter place of birth.',
          ethnicity: 'Please enter ethnicity.',
          id: 'ID must be 9, 10 or 12 digits; passport 7–15 alphanumeric characters.',
          phone: 'VN phone: 10 digits starting with 0. Int’l: start with +.',
          email: 'Invalid email address.',
          address: 'Please enter permanent address.',
          motherPhone: 'Mother’s phone is required (VN 10 digits or +int’l).',
          fatherPhone: 'Father’s phone is invalid.',
          school: 'Please enter school attended.',
          schoolProvince: 'Please enter school province/city.',
          situation: 'Please select applicant category.',
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
          dob: 'Ngày sinh cần đúng DD/MM/YYYY và tuổi hợp lý (12–70).',
          gender: 'Vui lòng chọn giới tính.',
          pob: 'Vui lòng nhập nơi sinh.',
          ethnicity: 'Vui lòng nhập dân tộc.',
          id: 'CCCD/CMND: 9, 10 hoặc 12 số; hộ chiếu 7–15 ký tự chữ và số.',
          phone: 'SĐT Việt Nam 10 số (bắt đầu 0) hoặc quốc tế bắt đầu bằng +.',
          email: 'Email không hợp lệ.',
          address: 'Vui lòng nhập địa chỉ thường trú.',
          motherPhone: 'SĐT mẹ bắt buộc (10 số VN hoặc + quốc tế).',
          fatherPhone: 'SĐT cha không hợp lệ.',
          school: 'Vui lòng nhập trường đã theo học.',
          schoolProvince: 'Vui lòng nhập tỉnh/thành của trường.',
          situation: 'Vui lòng chọn đối tượng dự tuyển.',
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
  if (!isValidPublicDob(form.dateOfBirth)) return t.dob
  if (!ALLOWED_GENDERS.has(form.gender.trim())) return t.gender
  if (!form.placeOfBirth.trim()) return t.pob
  if (!form.ethnicity.trim()) return t.ethnicity
  if (!isValidPublicNationalId(form.nationalId, form.nationalIdNotAvailable)) return t.id
  if (!isValidPublicPhone(form.phone)) return t.phone
  if (!form.studentEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.studentEmail.trim())) {
    return t.email
  }
  if (!form.permanentAddress.trim()) return t.address
  if (!isValidPublicPhone(form.motherPhone)) return t.motherPhone
  if (form.fatherPhone.trim() && !isValidPublicPhone(form.fatherPhone)) return t.fatherPhone
  if (!form.highSchool.trim()) return t.school
  if (!form.schoolProvince.trim()) return t.schoolProvince
  if (!ALLOWED_CATEGORIES.has(form.applicantCategory.trim())) return t.situation

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
