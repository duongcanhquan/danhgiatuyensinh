import { describe, expect, it } from 'vitest'
import {
  emptyPublicRegistrationForm,
  formatDobInput,
  formatVnPhoneInput,
  describePublicDobIssue,
  isValidPublicCustomScore,
  isValidPublicDob,
  isValidPublicNationalId,
  isValidPublicPhone,
  isValidStudentEmail,
  normalizeDobToDdMmYyyy,
  resolveAcademicPerformance,
  validatePublicRegistrationForm,
} from './publicRegistrationForm'

describe('publicRegistrationForm', () => {
  it('formats DOB as DD/MM/YYYY while typing', () => {
    expect(formatDobInput('25021984')).toBe('25/02/1984')
    expect(formatDobInput('02251984')).toBe('02/25/1984')
    expect(formatDobInput('0101200')).toBe('01/01/200')
    expect(formatDobInput('01012000')).toBe('01/01/2000')
    expect(formatDobInput('2005-01-15')).toBe('15/01/2005')
  })

  it('normalizes ISO DOB without corrupting on load', () => {
    expect(normalizeDobToDdMmYyyy('2006-01-01')).toBe('01/01/2006')
    expect(normalizeDobToDdMmYyyy('01/01/2005')).toBe('01/01/2005')
    expect(normalizeDobToDdMmYyyy('15-03-2008')).toBe('15/03/2008')
    expect(isValidPublicDob('2006-01-01')).toBe(true)
  })

  it('rejects invalid month like 02/25/1984', () => {
    expect(isValidPublicDob('02/25/1984')).toBe(false)
    expect(describePublicDobIssue('02/25/1984')).toMatch(/tháng/i)
    expect(isValidPublicDob('25/02/1984')).toBe(true)
  })

  it('validates DOB / phone / CCCD / email / custom score', () => {
    expect(isValidPublicDob('01/01/2005')).toBe(true)
    expect(isValidPublicDob('31/02/2000')).toBe(false)
    expect(isValidPublicDob('01/01/2030')).toBe(false)
    expect(isValidPublicDob('01/01/2018')).toBe(false) // too young (<12 in 2026)
    expect(isValidPublicPhone('0982856648')).toBe(true)
    expect(isValidPublicPhone('+84982856648')).toBe(true) // normalize 84 → 0
    expect(formatVnPhoneInput('+84982856648')).toBe('0982856648')
    expect(isValidPublicPhone('123')).toBe(false)
    expect(isValidPublicNationalId('001234567890', false)).toBe(true) // 12
    expect(isValidPublicNationalId('0123456789', false)).toBe(false) // 10 digits rejected
    expect(isValidPublicNationalId('123456789', false)).toBe(true) // 9
    expect(isValidPublicNationalId('ABC1234', false)).toBe(true)
    expect(isValidPublicNationalId('', true)).toBe(true)
    expect(isValidPublicNationalId('12345', false)).toBe(false)
    expect(isValidStudentEmail('a@b.com')).toBe(true)
    expect(isValidStudentEmail('abc')).toBe(false)
    expect(isValidStudentEmail('a@b')).toBe(false)
    expect(isValidPublicCustomScore('7.8')).toBe(true)
    expect(isValidPublicCustomScore('11')).toBe(false)
  })

  it('rejects incomplete form and accepts a full valid form', () => {
    expect(validatePublicRegistrationForm(emptyPublicRegistrationForm())).toMatch(/họ và tên/i)

    const form = {
      ...emptyPublicRegistrationForm(),
      fullName: 'Nguyen Van A',
      dateOfBirth: '01/01/2005',
      gender: 'Nam',
      placeOfBirth: 'Ha Noi',
      ethnicity: 'Kinh',
      nationalId: '001234567890',
      phone: '0982856648',
      studentEmail: 'a@example.com',
      permanentAddress: '168 Trinh Van Bo',
      motherPhone: '0912345678',
      highSchool: 'THPT A',
      schoolProvince: 'Ha Noi',
      applicantCategory: 'Học sinh lớp 12',
      studyIntention: 'Cao đẳng chính quy',
      educationLevel: 'Cao đẳng chính quy',
      majorInterest: 'CNTT',
      scorePreset: '8.0-9.0',
      counselorId: 'tvv-1',
    }
    expect(validatePublicRegistrationForm(form)).toBeNull()
    expect(
      validatePublicRegistrationForm({ ...form, motherPhone: '' }),
    ).toBeNull()
    expect(
      validatePublicRegistrationForm({ ...form, phone: '' }),
    ).toMatch(/sinh viên|điện thoại|phone/i)
    expect(
      validatePublicRegistrationForm(form, 'vn', {
        trainingProgramLabels: ['Cao đẳng chính quy'],
        majorLabels: ['CNTT'],
        counselorIds: ['tvv-1'],
      }),
    ).toBeNull()
    expect(
      validatePublicRegistrationForm(form, 'vn', {
        trainingProgramLabels: ['Cao đẳng chính quy'],
        majorLabels: ['Khác'],
        counselorIds: ['tvv-1'],
      }),
    ).toMatch(/không khớp|ngành/i)
    expect(
      validatePublicRegistrationForm(form, 'vn', {
        trainingProgramLabels: ['Cao đẳng chính quy'],
        majorLabels: ['CNTT'],
        counselorIds: ['tvv-1'],
        applicantCategoryLabels: ['Ứng viên nước ngoài'],
      }),
    ).toMatch(/không nằm|đối tượng|category/i)
    expect(
      validatePublicRegistrationForm(
        { ...form, applicantCategory: 'Ứng viên nước ngoài' },
        'vn',
        {
          trainingProgramLabels: ['Cao đẳng chính quy'],
          majorLabels: ['CNTT'],
          counselorIds: ['tvv-1'],
          applicantCategoryLabels: ['Ứng viên nước ngoài'],
        },
      ),
    ).toBeNull()
    expect(resolveAcademicPerformance(form)).toBe('8.0-9.0')
    expect(resolveAcademicPerformance({ ...form, scorePreset: 'Khác', customScore: '7,5' })).toBe('7.5')
    expect(
      validatePublicRegistrationForm({ ...form, scorePreset: 'Khác', customScore: '12' }),
    ).toMatch(/0 đến 10|0–10|GPA/i)
    expect(validatePublicRegistrationForm({ ...form, dateOfBirth: '02/25/1984' })).toMatch(/tháng/i)
    expect(validatePublicRegistrationForm({ ...form, studentEmail: 'khongco' })).toMatch(/@|email/i)
  })
})
