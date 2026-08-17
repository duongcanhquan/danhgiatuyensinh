import type { ReactNode } from 'react'

export type AppConfirmVariant = 'default' | 'danger' | 'warning'

export type AppConfirmOptions = {
  title: string
  description?: ReactNode
  /** Bullet points dưới mô tả */
  details?: string[]
  confirmLabel?: string
  cancelLabel?: string
  variant?: AppConfirmVariant
  /**
   * Bắt buộc gõ cụm (vd. XOA VINH VIEN) mới bật nút xác nhận.
   * So khớp sau khi bỏ dấu / khoảng trắng thừa.
   */
  requirePhrase?: string
  phraseHint?: string
}

type HostFn = (opts: AppConfirmOptions) => Promise<boolean>

let host: HostFn | null = null

/** Đăng ký host UI (AppConfirmDialog). Trả về hàm hủy đăng ký. */
export function registerAppConfirmHost(fn: HostFn): () => void {
  host = fn
  return () => {
    if (host === fn) host = null
  }
}

function normalizePhrase(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
}

export function phrasesMatch(typed: string, expected: string): boolean {
  return normalizePhrase(typed) === normalizePhrase(expected)
}

function browserFallback(opts: AppConfirmOptions): boolean {
  const lines: string[] = [opts.title]
  if (typeof opts.description === 'string' && opts.description.trim()) {
    lines.push('', opts.description.trim())
  }
  if (opts.details?.length) {
    lines.push('', ...opts.details.map((d) => `• ${d}`))
  }
  const ok = typeof globalThis.confirm === 'function' ? globalThis.confirm(lines.join('\n')) : false
  if (!ok) return false
  const phrase = opts.requirePhrase?.trim()
  if (!phrase) return true
  const typed =
    typeof globalThis.prompt === 'function'
      ? globalThis.prompt(opts.phraseHint || `Gõ chính xác «${phrase}» để xác nhận:`, '')
      : null
  if (typed == null) return false
  return phrasesMatch(typed, phrase)
}

/** Hộp thoại xác nhận trong app (hoặc confirm trình duyệt nếu chưa gắn host). */
export async function appConfirm(opts: AppConfirmOptions): Promise<boolean> {
  if (host) return host(opts)
  return browserFallback(opts)
}

/** Xác nhận xóa một mục (nút đỏ «Xóa»). */
export async function appConfirmDelete(itemLabel: string): Promise<boolean> {
  return appConfirm({
    title: `Xóa «${itemLabel}»?`,
    description: 'Thao tác này không hoàn tác được.',
    variant: 'danger',
    confirmLabel: 'Xóa',
    cancelLabel: 'Hủy',
  })
}

/** Xác nhận thao tác có rủi ro — thay window.confirm một câu. */
export async function appConfirmWarning(title: string, description?: string): Promise<boolean> {
  return appConfirm({
    title,
    description,
    variant: 'warning',
    confirmLabel: 'Tiếp tục',
    cancelLabel: 'Hủy',
  })
}
