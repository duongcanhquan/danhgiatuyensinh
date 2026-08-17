/**
 * Xuất báo cáo dạng PDF qua hộp thoại In của trình duyệt (In → Lưu PDF).
 * Không thêm dependency nặng — đủ cho admin / trưởng nhóm / cá nhân.
 */
import { appAlert } from './appNotify'

export function printReportAsPdf(opts: {
  title: string
  subtitle?: string
  /** HTML an toàn (đã escape) — bảng / đoạn văn. */
  bodyHtml: string
}): void {
  const w = window.open('', '_blank', 'noopener,noreferrer,width=960,height=720')
  if (!w) {
    appAlert('Trình duyệt chặn cửa sổ in. Cho phép pop-up rồi thử lại.', 'warning')
    return
  }
  const title = escapeHtml(opts.title)
  const subtitle = opts.subtitle ? `<p class="sub">${escapeHtml(opts.subtitle)}</p>` : ''
  w.document.open()
  w.document.write(`<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    body { font-family: "Segoe UI", system-ui, sans-serif; color: #0f172a; margin: 24px; font-size: 12px; }
    h1 { font-size: 18px; margin: 0 0 6px; }
    .sub { color: #475569; margin: 0 0 16px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
    th { background: #f1f5f9; font-size: 11px; text-transform: uppercase; letter-spacing: 0.02em; }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
    .meta { margin-top: 20px; color: #64748b; font-size: 10px; }
    @media print {
      body { margin: 12px; }
      a { color: inherit; text-decoration: none; }
    }
  </style>
</head>
<body>
  <h1>${title}</h1>
  ${subtitle}
  ${opts.bodyHtml}
  <p class="meta">In lúc ${escapeHtml(new Date().toLocaleString('vi-VN'))} — VietMy CRM</p>
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () { window.focus(); window.print(); }, 200);
    });
  </script>
</body>
</html>`)
  w.document.close()
}

export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function htmlTable(opts: {
  headers: string[]
  rows: string[][]
  numericCols?: number[]
}): string {
  const num = new Set(opts.numericCols ?? [])
  const th = opts.headers
    .map((h, i) => `<th class="${num.has(i) ? 'num' : ''}">${escapeHtml(h)}</th>`)
    .join('')
  const body = opts.rows
    .map(
      (row) =>
        `<tr>${row
          .map((cell, i) => `<td class="${num.has(i) ? 'num' : ''}">${escapeHtml(cell)}</td>`)
          .join('')}</tr>`,
    )
    .join('')
  return `<table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`
}
