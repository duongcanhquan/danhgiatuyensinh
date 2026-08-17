import type { Permission } from '../types'

/** TVV / trưởng nhóm / quản trị — kênh học & chat trên kho tri thức. */
export function canAccessConsultingSkillLab(can: (p: Permission) => boolean): boolean {
  return can('ai:use') || can('leads:write:self_assigned') || can('config:playbooks')
}

/** Chat AI (CTV không có `ai:use` vẫn xem thư viện). */
export function canChatInConsultingSkillLab(can: (p: Permission) => boolean): boolean {
  return can('ai:use')
}
