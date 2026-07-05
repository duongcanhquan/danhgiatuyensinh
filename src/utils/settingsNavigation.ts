export type SettingsMainTabId = 'data' | 'rules' | 'people' | 'connect'

export type SettingsSubTabId =
  | 'intake'
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
  | 'omicall'
  | 'public_registration'

export const SETTINGS_MAIN_TAB_ORDER: SettingsMainTabId[] = ['data', 'rules', 'people', 'connect']

export const SETTINGS_MAIN_LABELS: Record<SettingsMainTabId, string> = {
  data: 'Dữ liệu',
  rules: 'Chấm điểm',
  people: 'KPI & Nhân sự',
  connect: 'Tích hợp',
}

export const SETTINGS_SUB_LABELS: Record<SettingsSubTabId, string> = {
  intake: 'Nhập liệu',
  master: 'Danh mục (nâng cao)',
  lead_profile: 'Danh mục hồ sơ',
  scoring_profiles: 'Profile chấm điểm',
  scoring: 'Điểm thông tin',
  classification: 'Phân loại nhãn',
  rule_templates: 'Quy tắc mẫu',
  consulting: 'Thông tin tư vấn',
  knowledge: 'Tri thức tuyển sinh',
  llm: 'AI & LLM',
  kpi: 'Quy tắc KPI',
  staff: 'Quản lý nhân sự',
  permissions: 'Phân quyền',
  omicall: 'Gọi điện',
  public_registration: 'Cổng đăng ký SV',
}

export const SETTINGS_MAIN_SUBS: Record<SettingsMainTabId, SettingsSubTabId[]> = {
  data: ['intake', 'master', 'lead_profile'],
  rules: ['scoring_profiles', 'scoring', 'classification', 'rule_templates'],
  people: ['kpi', 'staff', 'permissions'],
  connect: ['consulting', 'knowledge', 'llm', 'omicall', 'public_registration'],
}

const LEGACY_TAB_ROUTE: Partial<Record<string, { main: SettingsMainTabId; sub: SettingsSubTabId }>> = {
  import: { main: 'data', sub: 'intake' },
  intake: { main: 'data', sub: 'intake' },
  master: { main: 'data', sub: 'master' },
  lead_profile: { main: 'data', sub: 'lead_profile' },
  scholarships: { main: 'data', sub: 'lead_profile' },
  catalog_profile: { main: 'data', sub: 'master' },
  scoring_profiles: { main: 'rules', sub: 'scoring_profiles' },
  scoring: { main: 'rules', sub: 'scoring' },
  classification: { main: 'rules', sub: 'classification' },
  rule_templates: { main: 'rules', sub: 'rule_templates' },
  consulting: { main: 'connect', sub: 'consulting' },
  knowledge: { main: 'connect', sub: 'knowledge' },
  llm: { main: 'connect', sub: 'llm' },
  ai_lab: { main: 'connect', sub: 'llm' },
  kpi: { main: 'people', sub: 'kpi' },
  staff: { main: 'people', sub: 'staff' },
  permissions: { main: 'people', sub: 'permissions' },
  kpi_permissions: { main: 'people', sub: 'kpi' },
  knowledge_advisory: { main: 'connect', sub: 'consulting' },
  system: { main: 'connect', sub: 'omicall' },
  omicall: { main: 'connect', sub: 'omicall' },
  public_registration: { main: 'connect', sub: 'public_registration' },
}

export type SettingsAccessContext = {
  canIntake: boolean
  canMaster: boolean
  canScoringRules: boolean
  canScoringProfilesTeam: boolean
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
    case 'master':
    case 'lead_profile':
      return ctx.canMaster
    case 'scoring_profiles':
      return ctx.canScoringRules || ctx.canScoringProfilesTeam
    case 'scoring':
    case 'classification':
    case 'rule_templates':
    case 'kpi':
      return ctx.canScoringRules
    case 'consulting':
      return ctx.canPlaybooks
    case 'knowledge':
    case 'llm':
      return ctx.canAiEngine
    case 'omicall':
      return ctx.canOmicall
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

  if (tabParam && (SETTINGS_MAIN_TAB_ORDER as string[]).includes(tabParam)) {
    const main = tabParam as SettingsMainTabId
    const subs = enabledSubsForMain(main, ctx)
    if (!subs.length) return { main: fallbackMain, sub: fallbackSub }
    if (subParam && subs.includes(subParam as SettingsSubTabId)) {
      return { main, sub: subParam as SettingsSubTabId }
    }
    return { main, sub: subs[0] }
  }

  const legacy = tabParam ? LEGACY_TAB_ROUTE[tabParam] : undefined
  if (legacy && isSettingsSubEnabled(legacy.sub, ctx)) {
    return legacy
  }

  if (subParam && isSettingsSubEnabled(subParam as SettingsSubTabId, ctx)) {
    for (const main of SETTINGS_MAIN_TAB_ORDER) {
      if (SETTINGS_MAIN_SUBS[main].includes(subParam as SettingsSubTabId)) {
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
