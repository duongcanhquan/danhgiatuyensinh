export type SettingsMainTabId = 'data' | 'rules' | 'advise' | 'connect' | 'people'

export type SettingsSubTabId =
  | 'intake'
  | 'intake_staff'
  | 'master'
  | 'lead_profile'
  | 'tuition'
  | 'scoring_profiles'
  | 'scoring'
  | 'classification'
  | 'rule_templates'
  | 'consulting'
  | 'knowledge'
  | 'llm'
  | 'kpi'
  | 'staff'
  | 'permissions'
  | 'hub'
  | 'omicall'
  | 'webhooks'
  | 'invite_docs'
  | 'receipts'
  | 'public_registration'
  | 'comms'

/** Thứ tự nhóm — logic vận hành: hồ sơ → chấm → tư vấn → kênh → nhân sự. */
export const SETTINGS_MAIN_TAB_ORDER: SettingsMainTabId[] = [
  'data',
  'rules',
  'advise',
  'connect',
  'people',
]

export const SETTINGS_MAIN_LABELS: Record<SettingsMainTabId, string> = {
  data: 'Hồ sơ',
  rules: 'Chấm điểm',
  advise: 'Tư vấn',
  connect: 'Kênh',
  people: 'Nhân sự',
}

/** Màu phân vùng — active / sub / track (Tailwind classes). */
export const SETTINGS_MAIN_THEME: Record<
  SettingsMainTabId,
  {
    track: string
    active: string
    idle: string
    subActive: string
    subIdle: string
    accentBar: string
  }
> = {
  data: {
    track: 'bg-sky-100/90 ring-1 ring-sky-200/80',
    active: 'bg-sky-700 text-white shadow-sm',
    idle: 'text-sky-950/75 hover:bg-sky-50/90 hover:text-sky-950',
    subActive: 'border-sky-300/70 bg-sky-50 text-sky-950 shadow-sm',
    subIdle: 'border-transparent text-slate-700 hover:border-sky-200 hover:bg-sky-50/70',
    accentBar: 'border-sky-200/90',
  },
  rules: {
    track: 'bg-amber-100/90 ring-1 ring-amber-200/80',
    active: 'bg-amber-700 text-white shadow-sm',
    idle: 'text-amber-950/75 hover:bg-amber-50/90 hover:text-amber-950',
    subActive: 'border-amber-300/70 bg-amber-50 text-amber-950 shadow-sm',
    subIdle: 'border-transparent text-slate-700 hover:border-amber-200 hover:bg-amber-50/70',
    accentBar: 'border-amber-200/90',
  },
  advise: {
    track: 'bg-emerald-100/90 ring-1 ring-emerald-200/80',
    active: 'bg-emerald-700 text-white shadow-sm',
    idle: 'text-emerald-950/75 hover:bg-emerald-50/90 hover:text-emerald-950',
    subActive: 'border-emerald-300/70 bg-emerald-50 text-emerald-950 shadow-sm',
    subIdle: 'border-transparent text-slate-700 hover:border-emerald-200 hover:bg-emerald-50/70',
    accentBar: 'border-emerald-200/90',
  },
  connect: {
    track: 'bg-indigo-100/90 ring-1 ring-indigo-200/80',
    active: 'bg-indigo-700 text-white shadow-sm',
    idle: 'text-indigo-950/75 hover:bg-indigo-50/90 hover:text-indigo-950',
    subActive: 'border-indigo-300/70 bg-indigo-50 text-indigo-950 shadow-sm',
    subIdle: 'border-transparent text-slate-700 hover:border-indigo-200 hover:bg-indigo-50/70',
    accentBar: 'border-indigo-200/90',
  },
  people: {
    track: 'bg-rose-100/90 ring-1 ring-rose-200/80',
    active: 'bg-rose-700 text-white shadow-sm',
    idle: 'text-rose-950/75 hover:bg-rose-50/90 hover:text-rose-950',
    subActive: 'border-rose-300/70 bg-rose-50 text-rose-950 shadow-sm',
    subIdle: 'border-transparent text-slate-700 hover:border-rose-200 hover:bg-rose-50/70',
    accentBar: 'border-rose-200/90',
  },
}

export const SETTINGS_SUB_LABELS: Record<SettingsSubTabId, string> = {
  intake: 'Nhập liệu',
  intake_staff: 'Nhập tư vấn viên',
  master: 'Danh mục nâng cao',
  lead_profile: 'Danh mục hồ sơ',
  tuition: 'Học phí kỳ 1',
  scoring_profiles: 'Profile chấm điểm',
  scoring: 'Điểm thông tin',
  classification: 'Phân loại nhãn',
  rule_templates: 'Quy tắc mẫu',
  consulting: 'Bộ tư vấn',
  knowledge: 'Tri thức tuyển sinh',
  llm: 'AI hỗ trợ',
  kpi: 'Quy tắc KPI',
  staff: 'Quản lý nhân sự',
  permissions: 'Phân quyền',
  hub: 'Các kênh',
  omicall: 'Gọi điện',
  webhooks: 'Tự động hóa (n8n)',
  invite_docs: 'Giấy mời & mẫu',
  receipts: 'Ngưỡng cọc & chứng từ',
  public_registration: 'Cổng đăng ký SV',
  comms: 'Email & tin nhắn',
}

/**
 * Tab hiện trên thanh điều hướng.
 * Tư vấn tách riêng; Kênh chỉ lưới đầu nối (+ URL sâu).
 */
export const SETTINGS_MAIN_SUBS: Record<SettingsMainTabId, SettingsSubTabId[]> = {
  data: ['intake', 'intake_staff', 'lead_profile', 'tuition', 'master'],
  rules: ['scoring_profiles', 'scoring', 'classification', 'rule_templates'],
  advise: ['consulting'],
  connect: ['hub'],
  people: ['kpi', 'staff', 'permissions'],
}

/** Màn chi tiết mở từ Các kênh (URL sâu, không hiện tab ngang). */
export const SETTINGS_CONNECT_DETAIL_SUBS: readonly SettingsSubTabId[] = [
  'comms',
  'omicall',
  'webhooks',
  'invite_docs',
  'receipts',
  'public_registration',
] as const

/** AI nằm trong Tư vấn bước 4. */
export const SETTINGS_AI_ADVISE_HREF = '/settings?tab=advise&sub=consulting&adviseStep=ai'

export function isConnectDetailSub(sub: SettingsSubTabId): boolean {
  return (SETTINGS_CONNECT_DETAIL_SUBS as readonly string[]).includes(sub)
}

/** Ẩn hàng tab con khi nhóm chỉ có 1 màn (trừ khi đang ở chi tiết kênh). */
export function shouldShowSettingsSubNav(
  main: SettingsMainTabId,
  subs: readonly SettingsSubTabId[],
  activeSub: SettingsSubTabId,
): boolean {
  if (isConnectDetailSub(activeSub)) return false
  if (main === 'advise' || main === 'connect') return false
  return subs.length > 1
}

const LEGACY_TAB_ROUTE: Partial<Record<string, { main: SettingsMainTabId; sub: SettingsSubTabId }>> = {
  import: { main: 'data', sub: 'intake' },
  intake: { main: 'data', sub: 'intake' },
  intake_staff: { main: 'data', sub: 'intake_staff' },
  staff_import: { main: 'data', sub: 'intake_staff' },
  nhap_tvv: { main: 'data', sub: 'intake_staff' },
  master: { main: 'data', sub: 'master' },
  lead_profile: { main: 'data', sub: 'lead_profile' },
  scholarships: { main: 'data', sub: 'lead_profile' },
  tuition: { main: 'data', sub: 'tuition' },
  hoc_phi: { main: 'data', sub: 'tuition' },
  bang_hoc_phi: { main: 'data', sub: 'tuition' },
  catalog_profile: { main: 'data', sub: 'master' },
  scoring_profiles: { main: 'rules', sub: 'scoring_profiles' },
  scoring: { main: 'rules', sub: 'scoring' },
  classification: { main: 'rules', sub: 'classification' },
  rule_templates: { main: 'rules', sub: 'rule_templates' },
  consulting: { main: 'advise', sub: 'consulting' },
  knowledge: { main: 'advise', sub: 'consulting' },
  llm: { main: 'advise', sub: 'consulting' },
  ai_lab: { main: 'advise', sub: 'consulting' },
  advise: { main: 'advise', sub: 'consulting' },
  kpi: { main: 'people', sub: 'kpi' },
  staff: { main: 'people', sub: 'staff' },
  permissions: { main: 'people', sub: 'permissions' },
  kpi_permissions: { main: 'people', sub: 'kpi' },
  knowledge_advisory: { main: 'advise', sub: 'consulting' },
  system: { main: 'connect', sub: 'hub' },
  hub: { main: 'connect', sub: 'hub' },
  integrations: { main: 'connect', sub: 'hub' },
  omicall: { main: 'connect', sub: 'omicall' },
  webhooks: { main: 'connect', sub: 'webhooks' },
  n8n: { main: 'connect', sub: 'webhooks' },
  invite_docs: { main: 'connect', sub: 'invite_docs' },
  giay_moi: { main: 'connect', sub: 'invite_docs' },
  receipts: { main: 'connect', sub: 'receipts' },
  chung_tu: { main: 'connect', sub: 'receipts' },
  public_registration: { main: 'connect', sub: 'public_registration' },
  comms: { main: 'connect', sub: 'comms' },
  email: { main: 'connect', sub: 'comms' },
  sms: { main: 'connect', sub: 'comms' },
  messaging: { main: 'connect', sub: 'comms' },
}

export type SettingsAccessContext = {
  canIntake: boolean
  canMaster: boolean
  canScoringRules: boolean
  canScoringProfilesTeam: boolean
  canScoringProfilesOwn: boolean
  canPlaybooks: boolean
  canAiEngine: boolean
  canOmicall: boolean
  canStaff: boolean
  canStaffTeam: boolean
  canPermMatrix: boolean
}

export function isSettingsSubEnabled(sub: SettingsSubTabId, ctx: SettingsAccessContext): boolean {
  switch (sub) {
    case 'intake':
      return ctx.canIntake
    case 'intake_staff':
      return ctx.canStaff
    case 'master':
    case 'lead_profile':
    case 'tuition':
      return ctx.canMaster
    case 'scoring_profiles':
      return ctx.canScoringRules || ctx.canScoringProfilesTeam || ctx.canScoringProfilesOwn
    case 'scoring':
    case 'classification':
    case 'rule_templates':
    case 'kpi':
      return ctx.canScoringRules
    case 'consulting':
      return ctx.canPlaybooks || ctx.canAiEngine
    case 'knowledge':
    case 'llm':
      return false
    case 'omicall':
      return ctx.canOmicall
    case 'hub':
    case 'webhooks':
    case 'invite_docs':
    case 'receipts':
    case 'comms':
      return ctx.canMaster || ctx.canOmicall
    case 'public_registration':
      return ctx.canMaster
    case 'staff':
      return ctx.canStaff || ctx.canStaffTeam
    case 'permissions':
      return ctx.canPermMatrix
    default:
      return false
  }
}

export function enabledSubsForMain(main: SettingsMainTabId, ctx: SettingsAccessContext): SettingsSubTabId[] {
  return SETTINGS_MAIN_SUBS[main].filter((sub) => isSettingsSubEnabled(sub, ctx))
}

export function enabledMainTabs(ctx: SettingsAccessContext): SettingsMainTabId[] {
  return SETTINGS_MAIN_TAB_ORDER.filter((main) => enabledSubsForMain(main, ctx).length > 0)
}

export function resolveSettingsRoute(
  tabParam: string | null,
  subParam: string | null,
  ctx: SettingsAccessContext,
): { main: SettingsMainTabId; sub: SettingsSubTabId } {
  const mains = enabledMainTabs(ctx)
  const fallbackMain = mains[0] ?? 'data'
  const fallbackSub = enabledSubsForMain(fallbackMain, ctx)[0] ?? 'intake'

  // Legacy: Tư vấn / AI nằm dưới connect → advise
  if (
    tabParam === 'connect' &&
    (subParam === 'consulting' || subParam === 'knowledge' || subParam === 'llm') &&
    isSettingsSubEnabled('consulting', ctx)
  ) {
    return { main: 'advise', sub: 'consulting' }
  }

  if (
    (subParam === 'knowledge' ||
      subParam === 'llm' ||
      tabParam === 'llm' ||
      tabParam === 'ai_lab' ||
      tabParam === 'consulting') &&
    isSettingsSubEnabled('consulting', ctx)
  ) {
    return { main: 'advise', sub: 'consulting' }
  }

  if (
    subParam &&
    isConnectDetailSub(subParam as SettingsSubTabId) &&
    isSettingsSubEnabled(subParam as SettingsSubTabId, ctx)
  ) {
    return { main: 'connect', sub: subParam as SettingsSubTabId }
  }

  if (tabParam && (SETTINGS_MAIN_TAB_ORDER as string[]).includes(tabParam)) {
    const main = tabParam as SettingsMainTabId
    const subs = enabledSubsForMain(main, ctx)
    if (!subs.length) return { main: fallbackMain, sub: fallbackSub }
    if (subParam && subs.includes(subParam as SettingsSubTabId)) {
      return { main, sub: subParam as SettingsSubTabId }
    }
    if (main === 'connect' && subParam && isSettingsSubEnabled(subParam as SettingsSubTabId, ctx)) {
      if (isConnectDetailSub(subParam as SettingsSubTabId)) {
        return { main: 'connect', sub: subParam as SettingsSubTabId }
      }
    }
    return { main, sub: subs[0] }
  }

  const legacy = tabParam ? LEGACY_TAB_ROUTE[tabParam] : undefined
  if (legacy && isSettingsSubEnabled(legacy.sub, ctx)) {
    return legacy
  }

  if (subParam && isSettingsSubEnabled(subParam as SettingsSubTabId, ctx)) {
    for (const main of SETTINGS_MAIN_TAB_ORDER) {
      if (
        SETTINGS_MAIN_SUBS[main].includes(subParam as SettingsSubTabId) ||
        (main === 'connect' && isConnectDetailSub(subParam as SettingsSubTabId))
      ) {
        return { main, sub: subParam as SettingsSubTabId }
      }
    }
  }

  return { main: fallbackMain, sub: fallbackSub }
}

export function staffSubLabel(ctx: SettingsAccessContext): string {
  return ctx.canStaff ? 'Quản lý nhân sự' : 'Nhóm tư vấn'
}

export function subTabLabel(sub: SettingsSubTabId, ctx: SettingsAccessContext): string {
  if (sub === 'staff') return staffSubLabel(ctx)
  return SETTINGS_SUB_LABELS[sub]
}
