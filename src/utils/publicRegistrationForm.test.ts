import { describe, expect, it } from 'vitest'
import {
  emptyPublicRegistrationForm,
  formatDobInput,
  isValidPublicCustomScore,
  isValidPublicDob,
  isValidPublicNationalId,
  isValidPublicPhone,
  resolveAcademicPerformance,
  validatePublicRegistrationForm,
} from './publicRegistrationForm'

describe('publicRegistrationForm', () => {
  it('formats DOB as DD/MM/YYYY while typing', () => {
    expect(formatDobInput('0101200')).toBe('01/01/200')
    expect(formatDobInput('01012000')).toBe('01/01/2000')
  })

  it('validates DOB / phone / CCCD / custom score', () => {
    expect(isValidPublicDob('01/01/2005')).toBe(true)
    expect(isValidPublicDob('31/02/2000')).toBe(false)
    expect(isValidPublicDob('01/01/2030')).toBe(false)
    expect(isValidPublicDob('01/01/2018')).toBe(false) // too young (<12 in 2026)
    expect(isValidPublicPhone('0982856648')).toBe(true)
    expect(isValidPublicPhone('+84982856648')).toBe(true)
    expect(isValidPublicPhone('123')).toBe(false)
    expect(isValidPublicNationalId('001234567890', false)).toBe(true) // 12
    expect(isValidPublicNationalId('0123456789', false)).toBe(true) // 10
    expect(isValidPublicNationalId('123456789', false)).toBe(true) // 9
    expect(isValidPublicNationalId('ABC1234', false)).toBe(true)
    expect(isValidPublicNationalId('', true)).toBe(true)
    expect(isValidPublicNationalId('12345', false)).toBe(false)
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
    expect(resolveAcademicPerformance(form)).toBe('8.0-9.0')
    expect(resolveAcademicPerformance({ ...form, scorePreset: 'Khác', customScore: '7,5' })).toBe('7.5')
    expect(
      validatePublicRegistrationForm({ ...form, scorePreset: 'Khác', customScore: '12' }),
    ).toMatch(/0 đến 10|0–10|GPA/i)
  })
})
