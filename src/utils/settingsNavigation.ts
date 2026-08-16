export type SettingsMainTabId = 'data' | 'rules' | 'people' | 'connect'

export type SettingsSubTabId =
  | 'intake'
  | 'intake_staff'
  | 'master'
  | 'lead_profile'
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

export const SETTINGS_MAIN_TAB_ORDER: SettingsMainTabId[] = ['data', 'rules', 'people', 'connect']

export const SETTINGS_MAIN_LABELS: Record<SettingsMainTabId, string> = {
  data: 'Dữ liệu',
  rules: 'Chấm điểm',
  people: 'KPI & Nhân sự',
  connect: 'Kết nối',
}

export const SETTINGS_SUB_LABELS: Record<SettingsSubTabId, string> = {
  intake: 'Nhập liệu',
  intake_staff: 'Nhập tư vấn viên',
  master: 'Danh mục (nâng cao)',
  lead_profile: 'Danh mục hồ sơ',
  scoring_profiles: 'Profile chấm điểm',
  scoring: 'Điểm thông tin',
  classification: 'Phân loại nhãn',
  rule_templates: 'Quy tắc mẫu',
  consulting: 'Tư vấn',
  knowledge: 'Tri thức tuyển sinh',
  llm: 'AI hỗ trợ',
  kpi: 'Quy tắc KPI',
  staff: 'Quản lý nhân sự',
  permissions: 'Phân quyền',
  /** Lưới kênh — Gọi điện / n8n / email… mở từ đây, không tab ngang trùng. */
  hub: 'Các kênh',
  omicall: 'Gọi điện',
  webhooks: 'Tự động hóa (n8n)',
  invite_docs: 'Giấy mời & mẫu',
  receipts: 'Chứng từ & ngưỡng cọc',
  public_registration: 'Cổng đăng ký SV',
  comms: 'Email & tin nhắn',
}

/**
 * Tab hiện trên thanh điều hướng.
 * Kết nối chỉ còn «Các kênh» + «Tư vấn» — chi tiết mở từ lưới / bước Tư vấn.
 */
export const SETTINGS_MAIN_SUBS: Record<SettingsMainTabId, SettingsSubTabId[]> = {
  data: ['intake', 'intake_staff', 'master', 'lead_profile'],
  rules: ['scoring_profiles', 'scoring', 'classification', 'rule_templates'],
  people: ['kpi', 'staff', 'permissions'],
  connect: ['hub', 'consulting'],
}

/** Màn chi tiết mở từ Các kênh (URL sâu vẫn chạy, không hiện như tab ngang). */
export const SETTINGS_CONNECT_DETAIL_SUBS: readonly SettingsSubTabId[] = [
  'comms',
  'omicall',
  'webhooks',
  'invite_docs',
  'receipts',
  'public_registration',
] as const

/** AI chỉ nằm trong Tư vấn bước 4 — không còn màn `sub=llm` riêng. */
export const SETTINGS_AI_ADVISE_HREF = '/settings?tab=connect&sub=consulting&adviseStep=ai'

export function isConnectDetailSub(sub: SettingsSubTabId): boolean {
  return (SETTINGS_CONNECT_DETAIL_SUBS as readonly string[]).includes(sub)
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
  catalog_profile: { main: 'data', sub: 'master' },
  scoring_profiles: { main: 'rules', sub: 'scoring_profiles' },
  scoring: { main: 'rules', sub: 'scoring' },
  classification: { main: 'rules', sub: 'classification' },
  rule_templates: { main: 'rules', sub: 'rule_templates' },
  consulting: { main: 'connect', sub: 'consulting' },
  knowledge: { main: 'connect', sub: 'consulting' },
  llm: { main: 'connect', sub: 'consulting' },
  ai_lab: { main: 'connect', sub: 'consulting' },
  kpi: { main: 'people', sub: 'kpi' },
  staff: { main: 'people', sub: 'staff' },
  permissions: { main: 'people', sub: 'permissions' },
  kpi_permissions: { main: 'people', sub: 'kpi' },
  knowledge_advisory: { main: 'connect', sub: 'consulting' },
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
      return false
    case 'llm':
      // Gộp vào Tư vấn bước 4 — không còn tab/màn riêng.
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

  if (subParam === 'knowledge' && isSettingsSubEnabled('consulting', ctx)) {
    return { main: 'connect', sub: 'consulting' }
  }

  // AI gộp vào Tư vấn bước 4 (không còn sub=llm).
  if (
    (subParam === 'llm' || tabParam === 'llm' || tabParam === 'ai_lab') &&
    isSettingsSubEnabled('consulting', ctx)
  ) {
    return { main: 'connect', sub: 'consulting' }
  }

  // URL sâu từ Các kênh (Gọi điện, n8n…) — vẫn mở được dù không còn trên thanh tab.
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
    // tab=connect&sub=webhooks đã bắt ở trên; còn lại fallback hub
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
