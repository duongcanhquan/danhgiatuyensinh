import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import type { Lead } from '../types'
import { buildLeadClassificationRuntime, getDefaultLeadClassificationConfig } from './leadClassificationConfig'
import { computeLeadClassification } from './leadClassificationScore'

const ts = Timestamp.fromMillis(1_700_000_000_000)

function stubLead(partial: Partial<Lead> = {}): Lead {
  return {
    id: 'l1',
    customerId: 'c1',
    fullName: 'Test',
    phone: '0912345678',
    parentPhone: '0987654321',
    source: 'Web',
    educationLevel: '12',
    assignedTo: 'u1',
    status: 'NEW',
    description: 'Mô tả đủ dài cho điểm thông tin',
    highSchool: 'THPT A',
    gradeClass: '12A1',
    province: 'Hà Nội',
    address: 'HN',
    calculatedScore: 0,
    priorityTag: 'COLD',
    uploadedAt: ts,
    updatedAt: ts,
    pipelineStatus: 'NEW',
    uniqueHash: 'h1',
    createdAt: ts,
    majorInterest: 'CNTT',
    ...partial,
  }
}

describe('leadClassificationScore', () => {
  const cfg = buildLeadClassificationRuntime(getDefaultLeadClassificationConfig())

  it('composite = profile×40% + engagement×60%', () => {
    const lead = stubLead({
      lastCallBehaviorScore: 90,
      lastCallEnrollmentSignalId: 'hot',
      lastCallReadinessId: 'ready',
      aiSentimentScore: 80,
    })
    const r = computeLeadClassification(lead, null, cfg)
    expect(r.profilePart).toBeGreaterThan(0)
    expect(r.engagementPart).toBeGreaterThan(50)
    expect(r.compositeScore).toBe(
      Math.round((r.profilePart * cfg.profileWeightPercent + r.engagementPart * cfg.engagementWeightPercent) / 100),
    )
  })

  it('gọi tốt có thể nâng nhãn dù hồ sơ mỏng', () => {
    const thin = computeLeadClassification(stubLead({ phone: '' }), null, cfg)
    const richCall = computeLeadClassification(
      stubLead({
        phone: '',
        lastCallBehaviorScore: 95,
        lastCallEnrollmentSignalId: 'hot',
        lastCallReadinessId: 'ready',
        aiSentimentScore: 90,
        callEvalPriorityBoost: 'HOT',
      }),
      null,
      cfg,
    )
    expect(richCall.engagementPart).toBeGreaterThan(thin.engagementPart)
    expect(richCall.compositeScore).toBeGreaterThan(thin.compositeScore)
  })
})
