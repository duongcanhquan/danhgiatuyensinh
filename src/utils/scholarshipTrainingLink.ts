/**
 * Liên kết học bổng ↔ hệ đào tạo (số kỳ phân bổ + lọc trên hồ sơ).
 */
import type { MasterDataEntry, ScholarshipCategoryId, ScholarshipRecord } from '../types'
import { resolveTrainingProgramId } from './masterDataCatalogOps'

function foldLabel(s: string): string {
  return String(s || '')
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/[đĐ]/g, 'd')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

/** Gợi ý số kỳ khi hệ chưa khai `termCount`. */
export function guessTrainingProgramTermCount(label: string): number {
  const n = foldLabel(label)
  if (!n) return 6
  if (n.includes('so cap') || n.includes('so-cap')) return 2
  if (n.includes('trung cap') || n.includes('trung-cap')) return 4
  if (n.includes('9+') || n.includes('lien thong')) return 6
  if (n.includes('cao dang') || n.includes('cd cq') || n.includes('phcd')) return 6
  return 6
}

export function resolveTrainingProgramTermCount(entry: Pick<MasterDataEntry, 'label' | 'termCount'> | null | undefined): number {
  if (!entry) return 6
  const t = Math.round(Number(entry.termCount) || 0)
  if (t > 0) return Math.min(20, t)
  return guessTrainingProgramTermCount(entry.label)
}

/** Map nhãn hệ → category legacy (seed PHCD / CDCQ). */
export function scholarshipCategoryFromTrainingLabel(label: string): ScholarshipCategoryId {
  const n = foldLabel(label)
  if (n.includes('phcd') || (n.includes('pho thong') && n.includes('cao dang'))) return 'phcd'
  return 'cdcq'
}

export function findTrainingProgramEntry(
  programs: readonly MasterDataEntry[] | undefined,
  trainingProgramId: string | undefined,
): MasterDataEntry | undefined {
  const id = String(trainingProgramId ?? '').trim()
  if (!id) return undefined
  return (programs ?? []).find((p) => p.id === id)
}

/**
 * HB gắn hệ: chỉ hiện khi hệ trên hồ sơ khớp.
 * HB cũ (chưa gắn hệ): vẫn hiện mọi hồ sơ.
 */
export function scholarshipMatchesLeadTrainingProgram(
  s: Pick<ScholarshipRecord, 'trainingProgramId'>,
  educationLevel: string,
  trainingPrograms: readonly MasterDataEntry[] | undefined,
): boolean {
  const linked = String(s.trainingProgramId ?? '').trim()
  if (!linked) return true
  const leadProgId = resolveTrainingProgramId(trainingPrograms, educationLevel)
  if (!leadProgId) {
    // Không resolve được hệ trên hồ sơ → vẫn cho chọn (tránh kẹt TVV).
    return true
  }
  return linked === leadProgId
}

export function filterScholarshipsForLeadEducation(
  items: readonly ScholarshipRecord[],
  educationLevel: string,
  trainingPrograms: readonly MasterDataEntry[] | undefined,
): ScholarshipRecord[] {
  return items.filter((s) => scholarshipMatchesLeadTrainingProgram(s, educationLevel, trainingPrograms))
}
