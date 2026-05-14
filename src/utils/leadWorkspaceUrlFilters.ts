import type { LeadCounselorStatus, LeadPipelineStatus, PriorityTag } from '../types'
import { LEAD_COUNSELOR_STATUS_ORDER } from '../types'

/** Tham số URL dùng chung giữa tab «Tư vấn» và «Hồ sơ đầy đủ» (`/leads`). */
export const LWF = {
  Q: 'q',
  CRM: 'crm',
  TAG: 'tag',
  REGION: 'region',
  SCHOOL: 'school',
  MAJOR: 'major',
  PIPE: 'pipe',
  SOURCE: 'source',
  ASSIGN: 'assign',
  DATE_AXIS: 'daxis',
  DATE_FROM: 'dfrom',
  DATE_TO: 'dto',
  DUE: 'due',
  MYDAY: 'myday',
} as const

const TAG_SET = new Set<string>(['HOT', 'WARM', 'COLD', 'LOSS'])

const PIPELINE_ORDER: LeadPipelineStatus[] = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'APPLIED',
  'ENROLLED',
  'LOST',
  'ARCHIVED',
]

export function parseTagFromUrl(raw: string | null): string {
  const x = (raw ?? '').trim().toUpperCase()
  if (!x || x === 'ALL') return 'ALL'
  return TAG_SET.has(x) ? x : 'ALL'
}

export function parsePriorityTagStrict(raw: string | null): 'ALL' | PriorityTag {
  const t = parseTagFromUrl(raw)
  return t === 'ALL' ? 'ALL' : (t as PriorityTag)
}

export function parseCrmFromUrl(raw: string | null): 'ALL' | LeadCounselorStatus {
  const x = (raw ?? '').trim()
  if (!x || x === 'ALL') return 'ALL'
  return LEAD_COUNSELOR_STATUS_ORDER.includes(x as LeadCounselorStatus) ? (x as LeadCounselorStatus) : 'ALL'
}

export function parsePipelineFromUrl(raw: string | null): string {
  const x = (raw ?? '').trim()
  if (!x || x === 'ALL') return 'ALL'
  return PIPELINE_ORDER.includes(x as LeadPipelineStatus) ? x : 'ALL'
}

export function parseDateAxisFromUrl(raw: string | null): 'updated' | 'created' | 'followup' {
  const x = (raw ?? '').trim()
  if (x === 'created' || x === 'followup') return x
  return 'updated'
}

export function parseMyDayFromUrl(raw: string | null): null | 'followup' | 'hot_sla' {
  const x = (raw ?? '').trim().toLowerCase()
  if (x === 'followup') return 'followup'
  if (x === 'hotsla' || x === 'hot_sla') return 'hot_sla'
  return null
}

/** Chuỗi ổn định để hydrate từ URL (không gồm `q` — ô tìm đọc trực tiếp từ `searchParams`). */
export function leadFilterSignatureForHydrate(sp: URLSearchParams): string {
  const keys = [
    LWF.CRM,
    LWF.TAG,
    LWF.REGION,
    LWF.SCHOOL,
    LWF.MAJOR,
    LWF.PIPE,
    LWF.SOURCE,
    LWF.ASSIGN,
    LWF.DATE_AXIS,
    LWF.DATE_FROM,
    LWF.DATE_TO,
    LWF.DUE,
    LWF.MYDAY,
  ] as const
  return keys.map((k) => `${k}=${sp.get(k) ?? ''}`).join('|')
}

export function counselorListFilterSignature(sp: URLSearchParams): string {
  return leadFilterSignatureForHydrate(sp) + `|${LWF.Q}=${sp.get(LWF.Q) ?? ''}`
}

export function mergeLeadFiltersIntoSearchParams(
  prev: URLSearchParams,
  patch: Partial<Record<(typeof LWF)[keyof typeof LWF], string | null | undefined>>,
): URLSearchParams {
  const p = new URLSearchParams(prev)
  for (const [key, val] of Object.entries(patch)) {
    if (val == null || val === '' || val === 'ALL') p.delete(key)
    else p.set(key, String(val))
  }
  return p
}

/** Xóa mọi bộ lọc danh sách + `q`, giữ `open` / `view` (nếu có). */
export function stripListFiltersKeepOpenView(prev: URLSearchParams): URLSearchParams {
  const open = prev.get('open')
  const view = prev.get('view')
  const p = new URLSearchParams(prev)
  for (const v of Object.values(LWF)) p.delete(v)
  if (open) p.set('open', open)
  else p.delete('open')
  if (view) p.set('view', view)
  else p.delete('view')
  return p
}
