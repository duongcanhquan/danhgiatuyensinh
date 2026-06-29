import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import type { Lead, ScoringProfile } from '../types'
import { AI_LEAD_FIELD_OPTIONS } from '../components/aiLeadFieldOptions'
import { STANDARD_LEAD_INTAKE_COLUMNS, scoringTargetFieldForIntakeColumn } from './excelLeadMapper'
import {
  evaluateLead,
  evaluationRecordFromLeadLike,
  leadToEvaluationRecord,
} from './scoring'
import { evaluationRecordFieldValue } from './leadSemanticFieldValue'
import { partialLeadFromExcelRow } from './scoringLeadInput'

const EVAL_STUB_TS = Timestamp.fromMillis(1_700_000_000_000)

function stubLead(over: Partial<Lead>): Lead {
  return {
    id: 'lead-1',
    customerId: 'KH-1',
    fullName: 'Nguyễn Văn A',
    phone: '0912345678',
    parentPhone: '0987654321',
    source: '',
    educationLevel: 'Đại học',
    assignedTo: null,
    status: 'NEW',
    description: 'Mô tả',
    highSchool: 'THPT A',
    gradeClass: '12A1',
    province: 'Hà Nội',
    address: 'Số 1',
    calculatedScore: 0,
    priorityTag: 'COLD',
    uploadedAt: EVAL_STUB_TS,
    updatedAt: EVAL_STUB_TS,
    pipelineStatus: 'NEW',
    uniqueHash: 'h',
    createdAt: EVAL_STUB_TS,
    ...over,
  }
}

function equalsProfileForField(field: string, value: string): Pick<ScoringProfile, 'rules' | 'ruleBlocks' | 'thresholds'> {
  return {
    rules: [],
    ruleBlocks: [
      {
        id: `b-${field}`,
        category: 'demographics',
        label: field,
        targetField: field,
        maxWeight: 20,
        rows: [
          {
            id: 'r1',
            condition: 'EQUALS',
            value,
            allocationKind: 'absolute',
            allocationValue: 20,
          },
        ],
      },
    ],
    thresholds: { hotMinScore: 15, warmMinScore: 10 },
  }
}

describe('scoring field coverage', () => {
  it('leadToEvaluationRecord + evaluateLead khớp source1 cho rule leadSource', () => {
    const lead = stubLead({ source: '', source1: 'Facebook Ads', source2: 'Zalo' })
    const profile = equalsProfileForField('leadSource', 'Facebook Ads')
    const rec = leadToEvaluationRecord(lead)
    expect(evaluationRecordFieldValue(rec, 'leadSource')).toBe('Facebook Ads')
    expect(evaluateLead(rec, profile).calculatedScore).toBe(20)
  })

  it('partialLeadFromExcelRow đủ 20 cột chuẩn cho chấm điểm import', () => {
    const row = {
      customerId: 'KH-X',
      fullName: 'Test',
      dateOfBirth: '01/01/2008',
      phone: '0911111111',
      parentPhone: '0922222222',
      source: 'Offline Event',
      majorInterest: 'CNTT',
      academicPerformance: 'Giỏi',
      highSchool: 'THPT B',
      aspirations: 'Học lập trình',
      financialStatus: 'Khá',
      hanoiArea: 'Ba Đình',
      hobbies: 'Bóng đá',
      profileNote1: 'Ghi chú 1',
      profileNote2: 'Ghi chú 2',
      gradeClass: '12A2',
      province: 'Hà Nội',
      address: 'Địa chỉ X',
      assignedToRaw: '',
      otherAttentionNotes: 'Lưu ý khác',
    }
    const rec = evaluationRecordFromLeadLike(partialLeadFromExcelRow(row))
    expect(evaluationRecordFieldValue(rec, 'financialStatus')).toBe('Khá')
    expect(evaluationRecordFieldValue(rec, 'hanoiArea')).toBe('Ba Đình')
    expect(evaluationRecordFieldValue(rec, 'profileNote1')).toBe('Ghi chú 1')
    expect(evaluationRecordFieldValue(rec, 'leadSource')).toBe('Offline Event')
    const profile = equalsProfileForField('financialStatus', 'Khá')
    expect(evaluateLead(rec, profile).calculatedScore).toBe(20)
  })

  it('mọi cột Excel chuẩn map được targetField và đọc được từ bản ghi chấm', () => {
    const sampleValues: Record<string, string> = {
      customerId: 'KH-99',
      fullName: 'SV Test',
      dateOfBirth: '2008-01-01',
      phone: '0900000000',
      parentPhone: '0911111111',
      source: 'Web',
      majorInterest: 'Kế toán',
      academicPerformance: 'Khá',
      highSchool: 'THPT C',
      aspirations: 'Nguyện vọng',
      financialStatus: 'Trung bình',
      hanoiArea: 'Cầu Giấy',
      hobbies: 'Đọc sách',
      profileNote1: 'N1',
      profileNote2: 'N2',
      gradeClass: '11A',
      province: 'Hải Phòng',
      address: 'Addr',
      assignedTo: 'uid-tvv',
      otherAttentionNotes: 'Khác',
    }
    const row: Record<string, string> = { ...sampleValues, assignedToRaw: sampleValues.assignedTo! }
    const rec = evaluationRecordFromLeadLike(partialLeadFromExcelRow(row))
    for (const col of STANDARD_LEAD_INTAKE_COLUMNS) {
      const tf = scoringTargetFieldForIntakeColumn(col.key)
      const rawKey = col.key === 'assignedToRaw' ? 'assignedTo' : (col.key as string)
      const expected = sampleValues[rawKey] ?? ''
      if (!expected) continue
      expect(evaluationRecordFieldValue(rec, tf)).toBe(expected)
    }
  })

  it('các trường gợi ý AI (trừ meta/derived) đọc được trên hồ sơ mẫu', () => {
    const skip = new Set([
      'email',
      'majorTrainingAlignment',
      'schoolTypeKey',
      'calculatedScore',
      'priorityTag',
      'counselorNote',
      'dateOfBirth',
      'assignedTo',
    ])
    const lead = stubLead({
      dateOfBirth: '01/01/2008',
      assignedTo: 'uid-tvv',
      aspirations: 'Học CNTT',
      hobbies: 'Đọc sách',
      fieldTripNotes: 'Đi trường',
      profileNote1: 'G1',
      profileNote2: 'G2',
      otherAttentionNotes: 'Khác',
      source1: 'Ads',
      source2: 'Referral',
      majorInterest: 'CNTT',
      academicPerformance: 'Giỏi',
      ethnicity: 'Kinh',
      permanentAddress: 'TT',
      currentResidence: 'HT',
      financialStatus: 'Khá',
      hanoiArea: 'Đống Đa',
      schoolType: 'Công lập',
      studentEmail: 'a@b.c',
      nationalId: '1234567890',
      systemCode: 'VM-001',
      fatherName: 'Ba',
      motherName: 'Mẹ',
    })
    const rec = leadToEvaluationRecord(lead)
    for (const opt of AI_LEAD_FIELD_OPTIONS) {
      if (skip.has(opt.id) || opt.extra) continue
      const v = evaluationRecordFieldValue(rec, opt.id)
      expect(v.length, `field ${opt.id} should not be empty on sample lead`).toBeGreaterThan(0)
    }
  })
})
