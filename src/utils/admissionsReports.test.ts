import { describe, expect, it } from 'vitest'
import {
  buildAdmissionsReport,
  isMktSourceLabel,
  type AdmissionsReportLeadInput,
} from './admissionsReports'

function lead(partial: Partial<AdmissionsReportLeadInput> & Pick<AdmissionsReportLeadInput, 'id'>): AdmissionsReportLeadInput {
  return {
    fullName: partial.fullName ?? 'HS Test',
    educationLevel: partial.educationLevel ?? 'Cao đẳng',
    majorInterest: partial.majorInterest ?? 'CNTT',
    source1: partial.source1 ?? 'Hotline',
    uploaderName: partial.uploaderName ?? 'TVV A',
    assignedTo: partial.assignedTo ?? 'TVV A',
    createdAtMs: partial.createdAtMs ?? new Date(2026, 7, 5).getTime(),
    finance: partial.finance,
    id: partial.id,
  }
}

describe('isMktSourceLabel', () => {
  it('nhận diện nguồn marketing theo keyword legacy', () => {
    expect(isMktSourceLabel('Facebook Ads')).toBe(true)
    expect(isMktSourceLabel('Tiktok')).toBe(true)
    expect(isMktSourceLabel('MOU')).toBe(false)
    expect(isMktSourceLabel('TVV Tự kiếm')).toBe(false)
  })
})

describe('buildAdmissionsReport (Apps Script runReportEngine)', () => {
  const period = {
    startMs: new Date(2026, 7, 1).getTime(),
    endMs: new Date(2026, 7, 13, 23, 59, 59, 999).getTime(),
  }

  it('đưa hồ sơ vào kỳ khi tạo trong kỳ / có duyệt tiền trong kỳ / Full NE trong kỳ', () => {
    const createdIn = lead({
      id: 'a',
      createdAtMs: new Date(2026, 7, 3).getTime(),
    })
    const payIn = lead({
      id: 'b',
      createdAtMs: new Date(2026, 5, 1).getTime(),
      finance: {
        enrollmentStatus: 'ĐANG HOÀN THIỆN',
        payments: {
          deposit: { amountVnd: 150_000, approvalStatus: 'ĐỒNG Ý', collectedAt: '05/08/2026' },
        },
      },
    })
    const fullNeIn = lead({
      id: 'c',
      createdAtMs: new Date(2026, 5, 1).getTime(),
      finance: {
        fullNeStatus: 'ĐÃ FULL NE',
        fullNeAt: '10/08/2026',
        enrollmentStatus: 'ĐÃ HOÀN THIỆN',
      },
    })
    const outside = lead({
      id: 'd',
      createdAtMs: new Date(2026, 5, 1).getTime(),
      finance: {
        payments: {
          deposit: { amountVnd: 1_000_000, approvalStatus: 'ĐỒNG Ý', collectedAt: '01/06/2026' },
        },
      },
    })

    const report = buildAdmissionsReport([createdIn, payIn, fullNeIn, outside], period)
    expect(report.rows.map((r) => r.id).sort()).toEqual(['a', 'b', 'c'])
    expect(report.overview.total).toBe(3)
  })

  it('đánh giá độc quyền: fullNE > cọc > lpxt > đang > mới theo tiền trong kỳ', () => {
    const full = lead({
      id: 'f',
      createdAtMs: new Date(2026, 7, 2).getTime(),
      finance: { fullNeStatus: 'ĐÃ FULL NE', fullNeAt: '02/08/2026' },
    })
    const coc = lead({
      id: 'c',
      createdAtMs: new Date(2026, 7, 2).getTime(),
      finance: {
        enrollmentStatus: 'CỌC THÀNH CÔNG',
        payments: {
          deposit: { amountVnd: 1_000_000, approvalStatus: 'ĐỒNG Ý', collectedAt: '02/08/2026' },
        },
      },
    })
    const lpxt = lead({
      id: 'l',
      createdAtMs: new Date(2026, 7, 2).getTime(),
      finance: {
        payments: {
          deposit: { amountVnd: 200_000, approvalStatus: 'ĐỒNG Ý', collectedAt: '02/08/2026' },
        },
      },
    })
    const moi = lead({
      id: 'm',
      createdAtMs: new Date(2026, 7, 2).getTime(),
    })

    const report = buildAdmissionsReport([full, coc, lpxt, moi], period)
    expect(report.overview.fullNe).toBe(1)
    expect(report.overview.coc).toBe(1)
    expect(report.overview.lpxt).toBe(1)
    expect(report.overview.moi).toBe(1)
    expect(report.overview.dang).toBe(0)
  })

  it('xếp hạng TVV theo số NE (cọc hoặc full) trong kỳ', () => {
    const rows = [
      lead({
        id: '1',
        uploaderName: 'An',
        assignedTo: 'uid-an',
        assigneeUid: 'uid-an',
        assigneeLabel: 'An',
        createdAtMs: new Date(2026, 7, 2).getTime(),
        finance: {
          payments: {
            deposit: { amountVnd: 1_000_000, approvalStatus: 'ĐỒNG Ý', collectedAt: '02/08/2026' },
          },
        },
      }),
      lead({
        id: '2',
        uploaderName: 'An',
        assignedTo: 'uid-an',
        assigneeUid: 'uid-an',
        assigneeLabel: 'An',
        createdAtMs: new Date(2026, 7, 3).getTime(),
        finance: { fullNeStatus: 'ĐÃ FULL NE', fullNeAt: '03/08/2026' },
      }),
      lead({
        id: '3',
        uploaderName: 'Bình',
        assignedTo: 'uid-binh',
        assigneeUid: 'uid-binh',
        assigneeLabel: 'Bình',
        createdAtMs: new Date(2026, 7, 4).getTime(),
        finance: {
          payments: {
            deposit: { amountVnd: 1_000_000, approvalStatus: 'ĐỒNG Ý', collectedAt: '04/08/2026' },
          },
        },
      }),
    ]
    const report = buildAdmissionsReport(rows, period)
    expect(report.tvvRanking[0]).toMatchObject({ name: 'An', neCount: 2 })
    expect(report.tvvRanking[1]).toMatchObject({ name: 'Bình', neCount: 1 })
  })

  it('tab MKT chỉ lấy nguồn marketing', () => {
    const rows = [
      lead({
        id: '1',
        source1: 'Facebook Ads',
        createdAtMs: new Date(2026, 7, 2).getTime(),
        finance: {
          payments: {
            deposit: { amountVnd: 1_000_000, approvalStatus: 'ĐỒNG Ý', collectedAt: '02/08/2026' },
          },
        },
      }),
      lead({
        id: '2',
        source1: 'MOU',
        createdAtMs: new Date(2026, 7, 2).getTime(),
        finance: {
          payments: {
            deposit: { amountVnd: 1_000_000, approvalStatus: 'ĐỒNG Ý', collectedAt: '02/08/2026' },
          },
        },
      }),
    ]
    const report = buildAdmissionsReport(rows, period)
    expect(report.mktBySource).toHaveLength(1)
    expect(report.mktBySource[0]?.source).toBe('Facebook Ads')
    expect(report.mktBySource[0]?.neCount).toBe(1)
  })

  it('tab ngành gom total / lpxt / coc / full / chua', () => {
    const rows = [
      lead({
        id: '1',
        majorInterest: 'CNTT',
        createdAtMs: new Date(2026, 7, 2).getTime(),
        finance: {
          payments: {
            deposit: { amountVnd: 200_000, approvalStatus: 'ĐỒNG Ý', collectedAt: '02/08/2026' },
          },
        },
      }),
      lead({
        id: '2',
        majorInterest: 'CNTT',
        createdAtMs: new Date(2026, 7, 3).getTime(),
        finance: { fullNeStatus: 'ĐÃ FULL NE', fullNeAt: '03/08/2026' },
      }),
      lead({
        id: '3',
        majorInterest: 'Kế toán',
        createdAtMs: new Date(2026, 7, 4).getTime(),
      }),
    ]
    const report = buildAdmissionsReport(rows, period)
    const cntt = report.byMajor.find((m) => m.major === 'CNTT')
    const kt = report.byMajor.find((m) => m.major === 'Kế toán')
    expect(cntt).toMatchObject({ total: 2, lpxt: 1, fullNe: 1 })
    expect(kt).toMatchObject({ total: 1, chua: 1 })
  })

  it('lọc theo UID TVV (không phụ thuộc displayName trên assignedTo)', () => {
    const rows = [
      lead({
        id: '1',
        assigneeUid: 'uid-an',
        assigneeLabel: 'An',
        uploaderName: 'An',
        assignedTo: 'uid-an',
        createdAtMs: new Date(2026, 7, 2).getTime(),
      }),
      lead({
        id: '2',
        assigneeUid: 'uid-binh',
        assigneeLabel: 'Bình',
        uploaderName: 'Bình',
        assignedTo: 'uid-binh',
        createdAtMs: new Date(2026, 7, 2).getTime(),
      }),
    ]
    const report = buildAdmissionsReport(rows, period, { assigneeUids: ['uid-an'] })
    expect(report.overview.total).toBe(1)
    expect(report.rows[0]?.id).toBe('1')
    expect(report.tvvRanking[0]).toMatchObject({ name: 'An', uid: 'uid-an' })
  })
})
