export type SettingsMainTabId = 'catalog_profile' | 'knowledge_advisory' | 'kpi_permissions' | 'system'

export type SettingsSubTabId =
  | 'master'
  | 'scoring_profiles'
  | 'scoring'
  | 'rule_templates'
  | 'consulting'
  | 'knowledge'
  | 'llm'
  | 'kpi'
  | 'staff'
  | 'permissions'
  | 'lead_profile'
  | 'omicall'

export const SETTINGS_MAIN_TAB_ORDER: SettingsMainTabId[] = [
  'catalog_profile',
  'knowledge_advisory',
  'kpi_permissions',
  'system',
]

export const SETTINGS_MAIN_LABELS: Record<SettingsMainTabId, string> = {
  catalog_profile: 'Danh mục & Profile',
  knowledge_advisory: 'Kiến thức Tư vấn',
  kpi_permissions: 'KPI & Phân quyền',
  system: 'Cài đặt hệ thống',
}

export const SETTINGS_SUB_LABELS: Record<SettingsSubTabId, string> = {
  master: 'Cài đặt danh mục',
  scoring_profiles: 'Cài đặt Profile',
  scoring: 'Điểm thông tin',
  rule_templates: 'Quy tắc mẫu',
  consulting: 'Thông tin tư vấn',
  knowledge: 'Tri thức tuyển sinh',
  llm: 'LLM & Tư vấn AI',
  kpi: 'KPI Sale',
  staff: 'Quản lý nhân sự',
  permissions: 'Phân quyền',
  lead_profile: 'Hồ sơ & danh mục tuyển sinh',
  omicall: 'Gọi điện (OMICall)',
}

export const SETTINGS_MAIN_SUBS: Record<SettingsMainTabId, SettingsSubTabId[]> = {
  catalog_profile: ['master', 'scoring_profiles', 'scoring', 'rule_templates'],
  knowledge_advisory: ['consulting', 'knowledge', 'llm'],
  kpi_permissions: ['kpi', 'staff', 'permissions'],
  system: ['lead_profile', 'omicall'],
}

const LEGACY_TAB_ROUTE: Partial<Record<string, { main: SettingsMainTabId; sub: SettingsSubTabId }>> = {
  master: { main: 'catalog_profile', sub: 'master' },
  scoring_profiles: { main: 'catalog_profile', sub: 'scoring_profiles' },
  scoring: { main: 'catalog_profile', sub: 'scoring' },
  rule_templates: { main: 'catalog_profile', sub: 'rule_templates' },
  consulting: { main: 'knowledge_advisory', sub: 'consulting' },
  knowledge: { main: 'knowledge_advisory', sub: 'knowledge' },
  llm: { main: 'knowledge_advisory', sub: 'llm' },
  ai_lab: { main: 'knowledge_advisory', sub: 'llm' },
  kpi: { main: 'kpi_permissions', sub: 'kpi' },
  staff: { main: 'kpi_permissions', sub: 'staff' },
  permissions: { main: 'kpi_permissions', sub: 'permissions' },
  lead_profile: { main: 'system', sub: 'lead_profile' },
  scholarships: { main: 'system', sub: 'lead_profile' },
  omicall: { main: 'system', sub: 'omicall' },
}

export type SettingsAccessContext = {
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
    case 'master':
    case 'lead_profile':
      return ctx.canMaster
    case 'scoring_profiles':
      return ctx.canScoringRules || ctx.canScoringProfilesTeam
    case 'scoring':
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
  const fallbackMain = mains[0] ?? 'catalog_profile'
  const fallbackSub = enabledSubsForMain(fallbackMain, ctx)[0] ?? 'master'

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
