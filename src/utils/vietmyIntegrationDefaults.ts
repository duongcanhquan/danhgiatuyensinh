/**
 * URL webhook n8n mặc định hệ Apps Script VietMy (apchn-host.lapage.vn).
 * Dùng làm gợi ý điền nhanh trong Cài đặt — không hardcode khi runtime gửi request
 * (runtime chỉ lấy orgSettings / VITE_N8N_*).
 */
export const VIETMY_DEFAULT_N8N_WEBHOOKS = {
  giayMoi: 'https://apchn-host.lapage.vn/webhook/giaymoits',
  ctsv: 'https://apchn-host.lapage.vn/webhook/testctsv',
  daily: 'https://apchn-host.lapage.vn/webhook/baocao-ngay',
  monthly: 'https://apchn-host.lapage.vn/webhook/baocao-thang',
} as const

/** Folder Drive gốc chứng từ / giấy mời từ CONFIG Apps Script. */
export const VIETMY_DEFAULT_DRIVE_FOLDERS = {
  /** FOLDER_ROOT — bill chứng từ */
  receiptRootFolderId: '1wXoWyfUVC8hva-7MEKJaaoV6p67BEhyG',
  /** FOLDER_INVITE_ROOT — thư mục giấy mời */
  inviteRootFolderId: '1efMVihgSpNqMCeIo1M8s2SHSbFo0WYoZ',
} as const

export const N8N_WEBHOOK_FIELD_HINTS: Record<
  keyof typeof VIETMY_DEFAULT_N8N_WEBHOOKS,
  { title: string; when: string; events: string }
> = {
  giayMoi: {
    title: 'Giấy mời',
    when: 'TVV bấm tạo giấy mời; TVV nộp tiền cũng gửi kèm (parity Apps Script).',
    events: 'create_document · update_profile',
  },
  ctsv: {
    title: 'CTSV / tài chính',
    when: 'TVV nộp tiền; kế toán duyệt / từ chối / Full NE → Google Chat.',
    events: 'update_profile · accountant_decision · accountant_full_ne',
  },
  daily: {
    title: 'Báo cáo ngày',
    when: 'Gửi tay trên cổng KT hoặc cron 23:55 ICT.',
    events: 'daily_finance_report',
  },
  monthly: {
    title: 'Báo cáo tháng',
    when: 'Gửi tay hoặc cron ngày cuối tháng ICT.',
    events: 'month / nbMonth / lpxtMonth / neMonth',
  },
}
