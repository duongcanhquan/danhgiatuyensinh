import type { PublicRegistrationFormInput } from '../services/publicRegistration'

const INPUT = 'vm-input w-full'

export function emptyPublicRegistrationForm(): PublicRegistrationFormInput {
  return {
    fullName: '',
    phone: '',
    studentEmail: '',
    dateOfBirth: '',
    parentPhone: '',
    province: '',
    highSchool: '',
    gradeClass: '',
    educationLevel: '',
    majorInterest: '',
    academicPerformance: '',
    description: '',
  }
}

export function validatePublicRegistrationForm(form: PublicRegistrationFormInput): string | null {
  const name = form.fullName.trim()
  const phone = form.phone.replace(/\D/g, '')
  const email = form.studentEmail.trim()
  if (!name) return 'Vui lòng nhập họ và tên.'
  if (phone.length < 9) return 'Số điện thoại cần ít nhất 9 chữ số.'
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'Email không hợp lệ — dùng để nhận thông báo từ trường.'
  }
  return null
}

export { INPUT as PUBLIC_REG_INPUT_CLS }
