/** Phân trang client khi fullScope đã tải hết rồi lọc trên UI. */
export function sliceClientPagedRows<T>(
  rows: T[],
  page: number,
  pageSize: number,
): { pageRows: T[]; totalPages: number; safePage: number } {
  const size = Math.max(1, Math.floor(pageSize) || 1)
  const totalPages = Math.max(1, Math.ceil(rows.length / size))
  const safePage = Math.min(Math.max(1, Math.floor(page) || 1), totalPages)
  const start = (safePage - 1) * size
  return {
    pageRows: rows.slice(start, start + size),
    totalPages,
    safePage,
  }
}
