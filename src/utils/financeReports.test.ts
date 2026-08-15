import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import type { Lead } from '../types'
import { buildDailyFinanceReportPayload } from './financeReports'

function baseLead(over: Partial<Lead> & { finance?: Lead['finance'] }): Lead {
  return {
    id: 'l1',
    customerId: 'KH1',
    fullName: 'Nguyen A',
    phone: '0912345678',
    parentPhone: '',
    source: 'Web',
    educationLevel: 'Cao đẳng chính quy',
    status: 'NEW',
    pipelineStatus: 'NEW',
    description: '',
    highSchool: '',
    gradeClass: '',
    province: '',
    address: '',
    calculatedScore: 0,
    priorityTag: 'COLD',
    uniqueHash: 'h',
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    uploadedAt: Timestamp.now(),
    ...over,
  } as Lead
}

describe('buildDailyFinanceReportPayload Full NE by day (Apps Script parity)', () => {
  it('chỉ đếm Full NE khi fullNeAt nằm trong ngày báo cáo', () => {
    const today = new Date(2026, 7, 13, 12, 0, 0) // 13/08/2026
    const withToday = baseLead({
      id: 'a',
      finance: {
        fullNeStatus: 'ĐÃ FULL NE',
        fullNeAt: '13/08/2026',
        enrollmentStatus: 'ĐÃ HOÀN THIỆN',
      },
    })
    const withYesterday = baseLead({
      id: 'b',
      customerId: 'KH2',
      finance: {
        fullNeStatus: 'ĐÃ FULL NE',
        fullNeAt: '12/08/2026',
        enrollmentStatus: 'ĐÃ HOÀN THIỆN',
      },
    })
    const noDate = baseLead({
      id: 'c',
      customerId: 'KH3',
      finance: {
        fullNeStatus: 'ĐÃ FULL NE',
        enrollmentStatus: 'ĐÃ HOÀN THIỆN',
      },
    })

    const payload = buildDailyFinanceReportPayload([withToday, withYesterday, noDate], today)
    expect(payload.dailyDetailHtml).toContain('Đã là NE')
    expect(payload.dailyDetailHtml).toMatch(/Đã là NE:[\s\S]*?<b>1<\/b>/)
    expect(payload.dailyDetailHtml).not.toMatch(/Đã là NE:[\s\S]*?<b>2<\/b>/)
    expect(payload.dailyDetailHtml).not.toMatch(/Đã là NE:[\s\S]*?<b>3<\/b>/)
  })

  it('cộng tiền ĐỒNG Ý theo ngày KT duyệt (approvedAt), không theo ngày TVV nộp', () => {
    const today = new Date(2026, 7, 16, 12, 0, 0) // 16/08/2026
    const approvedToday = baseLead({
      id: 'p1',
      finance: {
        payments: {
          deposit: {
            amountVnd: 1_500_000,
            collectedAt: '15/08/2026', // nộp hôm trước
            approvalStatus: 'ĐỒNG Ý',
            approvedAt: '16/08/2026', // duyệt hôm nay
          },
        },
      },
    })
    const pending = baseLead({
      id: 'p2',
      customerId: 'KH2',
      finance: {
        payments: {
          deposit: {
            amountVnd: 2_000_000,
            collectedAt: '16/08/2026',
            approvalStatus: '',
          },
        },
      },
    })
    const payload = buildDailyFinanceReportPayload([approvedToday, pending], today)
    expect(payload.tongTien).toBe(1_500_000)
    expect(payload.dailyDetailHtml).toContain('1.500.000')
  })
})
