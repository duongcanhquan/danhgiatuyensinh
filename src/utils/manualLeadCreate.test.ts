import { describe, expect, it } from 'vitest'
import { emptyLeadCoreDraft, type LeadCoreDraft } from './leadProfileEdit'
import {
  manualLeadCreatedOriginFields,
  validateManualLeadDraft,
} from './manualLeadCreate'

function validDraft(over: Partial<LeadCoreDraft> = {}): LeadCoreDraft {
  return {
    ...emptyLeadCoreDraft(),
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
    province: 'Ha Noi',
    applicantCategory: 'Học sinh lớp 12',
    studyIntention: 'Cao đẳng chính quy',
    educationLevel: 'Cao đẳng chính quy',
    majorInterest: 'CNTT',
    academicPerformance: 'Khá',
    source1: 'Web đăng ký',
    ...over,
  }
}

describe('validateManualLeadDraft', () => {
  it('rejects empty / incomplete like portal', () => {
    expect(validateManualLeadDraft(emptyLeadCoreDraft())).toMatch(/họ tên|họ và tên/i)
    expect(validateManualLeadDraft(validDraft({ studentEmail: '' }))).toMatch(/email/i)
    expect(validateManualLeadDraft(validDraft({ phone: '' }))).toMatch(/sinh viên|điện thoại/i)
    expect(validateManualLeadDraft(validDraft({ motherPhone: '', parentPhone: '' }))).toBeNull()
    expect(validateManualLeadDraft(validDraft({ gender: 'Khác' }))).toMatch(/giới tính/i)
    expect(validateManualLeadDraft(validDraft({ academicPerformance: '' }))).toMatch(/học lực/i)
    expect(validateManualLeadDraft(validDraft({ source1: '', source: 'ghi chú' }))).toMatch(/Nguồn 1|nguồn/i)
  })

  it('accepts student phone without mother or contact phone', () => {
    expect(
      validateManualLeadDraft(validDraft({ motherPhone: '', fatherPhone: '', parentPhone: '' })),
    ).toBeNull()
  })

  it('accepts parentPhone when motherPhone is empty', () => {
    expect(
      validateManualLeadDraft(validDraft({ motherPhone: '', parentPhone: '0912345678' })),
    ).toBeNull()
  })

  it('accepts a full valid draft', () => {
    expect(validateManualLeadDraft(validDraft())).toBeNull()
  })

  it('allows missing father phone; rejects invalid father phone', () => {
    expect(validateManualLeadDraft(validDraft({ fatherPhone: '' }))).toBeNull()
    expect(validateManualLeadDraft(validDraft({ fatherPhone: '123' }))).toMatch(/cha/i)
  })
})

describe('manualLeadCreatedOriginFields', () => {
  it('writes public_portal origin', () => {
    expect(manualLeadCreatedOriginFields()).toEqual({
      intakeOrigin: 'public_portal',
      registrationChannel: 'public_portal',
    })
  })
})
