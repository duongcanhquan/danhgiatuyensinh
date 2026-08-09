/**
 * Quyết định Dashboard TVV có cần đọc fullScope (đắt) hay phân trang server.
 * Chỉ fullScope khi lọc không đẩy được lên Firestore một cách đáng tin.
 */
export function counselorDashboardNeedsFullScope(opts: {
  myDayFilter: null | 'followup' | 'hot_sla'
  dueOnly: boolean
  counselorFilterUid: string
  canReadGlobalLeads: boolean
  dateAxis: 'updated' | 'created' | 'followup'
  dateFrom: string
  dateTo: string
}): boolean {
  const dateNeedsClientScope =
    (Boolean(opts.dateFrom.trim()) || Boolean(opts.dateTo.trim())) && opts.dateAxis === 'followup'
  const assigneeClientNeedsScope =
    Boolean(opts.counselorFilterUid) &&
    opts.counselorFilterUid !== '__UNASSIGNED__' &&
    !opts.canReadGlobalLeads

  return (
    opts.myDayFilter === 'followup' ||
    opts.myDayFilter === 'hot_sla' ||
    opts.dueOnly ||
    opts.counselorFilterUid === '__UNASSIGNED__' ||
    assigneeClientNeedsScope ||
    dateNeedsClientScope
  )
}
