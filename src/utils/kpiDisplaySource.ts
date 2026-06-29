/** Nguồn số liệu cuộc gọi trên Tổng kết / KPI. */

export type KpiCallDataSource = 'empty' | 'daily' | 'calls_live' | 'both'



export function resolveKpiCallDataSource(

  kpiDailyTotalCalls: number,

  liveCallsTotal: number,

  mergedTotalCalls?: number,

): KpiCallDataSource {

  const k = Math.max(0, kpiDailyTotalCalls)

  const c = Math.max(0, liveCallsTotal)

  const m = mergedTotalCalls !== undefined ? Math.max(0, mergedTotalCalls) : Math.max(k, c)

  if (m <= 0) return 'empty'

  if (k > 0 && c > 0) return 'both'

  if (c > 0 && (k <= 0 || m > k)) return 'calls_live'

  return 'daily'

}



export function kpiCallSourceShortLabel(source: KpiCallDataSource): string {

  switch (source) {

    case 'daily':

      return 'Báo cáo chính thức'

    case 'calls_live':

      return 'Từ dòng thời gian / tương tác gọi'

    case 'both':

      return 'Đã đồng bộ'

    default:

      return 'Chưa có cuộc gọi'

  }

}

