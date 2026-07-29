/** Xuất bảng KPI tháng / kỳ ra CSV (UTF-8 BOM khi tải). */

export type MonthlyKpiCsvRow = {
  rank: number
  name: string
  teamName: string
  compositeScore: number
  tierLabel: string
  validCalls: number
  depositPaidCount: number
  approvedRevenueVnd: number
  fullNeCount: number
}

export function buildMonthlyKpiCsv(rows: MonthlyKpiCsvRow[], month: string): string {
  const lines = [
    'Tháng,Hạng,TVV,Nhóm,Điểm,Mức thưởng,Gọi HL,Cọc duyệt,Doanh thu duyệt,Full NE',
    ...rows.map((r) =>
      csvRow([
        month,
        String(r.rank),
        r.name,
        r.teamName,
        String(r.compositeScore),
        r.tierLabel,
        String(r.validCalls),
        String(r.depositPaidCount),
        String(r.approvedRevenueVnd),
        String(r.fullNeCount),
      ]),
    ),
  ]
  return lines.join('\n')
}

export type PeriodKpiCsvRow = {
  name: string
  teamName: string
  validCalls: number
  totalCalls: number
  depositPaidCount: number
  approvedRevenueVnd: number
}

export function buildPeriodKpiCsv(rows: PeriodKpiCsvRow[], from: string, to: string): string {
  const lines = [
    'Từ,Đến,TVV,Nhóm,Gọi HL,Tổng gọi,Cọc duyệt,Doanh thu duyệt',
    ...rows.map((r) =>
      csvRow([
        from,
        to,
        r.name,
        r.teamName,
        String(r.validCalls),
        String(r.totalCalls),
        String(r.depositPaidCount),
        String(r.approvedRevenueVnd),
      ]),
    ),
  ]
  return lines.join('\n')
}

export function downloadTextCsv(content: string, filename: string): void {
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function csvRow(cells: string[]): string {
  return cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')
}
