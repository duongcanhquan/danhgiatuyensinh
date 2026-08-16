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

/** Map nhãn hệ → category legacy (seed / sắp xếp cũ). */
export function scholarshipCategoryFromTrainingLabel(label: string): ScholarshipCategoryId {
  const n = foldLabel(label)
  if (n.includes('phcd') || (n.includes('pho thong') && n.includes('cao dang'))) return 'phcd'
  return 'cdcq'
}

/** Gộp `trainingProgramIds` + `trainingProgramId` (legacy). */
export function resolveScholarshipTrainingProgramIds(
  s: Pick<ScholarshipRecord, 'trainingProgramId' | 'trainingProgramIds'>,
): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of [...(s.trainingProgramIds ?? []), s.trainingProgramId]) {
    const id = String(raw ?? '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

export function findTrainingProgramEntry(
  programs: readonly MasterDataEntry[] | undefined,
  trainingProgramId: string | undefined,
): MasterDataEntry | undefined {
  const id = String(trainingProgramId ?? '').trim()
  if (!id) return undefined
  return (programs ?? []).find((p) => p.id === id)
}

/** Số kỳ gợi ý khi HB gắn nhiều hệ: lấy max để đủ ô phân bổ. */
export function resolveScholarshipTermCountFromPrograms(
  programs: readonly MasterDataEntry[] | undefined,
  trainingProgramIds: readonly string[],
): number | undefined {
  const ids = trainingProgramIds.map((x) => String(x ?? '').trim()).filter(Boolean)
  if (!ids.length) return undefined
  let max = 0
  for (const id of ids) {
    const n = resolveTrainingProgramTermCount(findTrainingProgramEntry(programs, id))
    if (n > max) max = n
  }
  return max > 0 ? max : undefined
}

/**
 * HB gắn hệ: chỉ hiện khi hệ trên hồ sơ nằm trong danh sách gắn.
 * HB cũ (chưa gắn hệ): vẫn hiện mọi hồ sơ.
 */
export function scholarshipMatchesLeadTrainingProgram(
  s: Pick<ScholarshipRecord, 'trainingProgramId' | 'trainingProgramIds'>,
  educationLevel: string,
  trainingPrograms: readonly MasterDataEntry[] | undefined,
): boolean {
  const linked = resolveScholarshipTrainingProgramIds(s)
  if (!linked.length) return true
  const leadProgId = resolveTrainingProgramId(trainingPrograms, educationLevel)
  if (!leadProgId) {
    // Không resolve được hệ trên hồ sơ → vẫn cho chọn (tránh kẹt TVV).
    return true
  }
  return linked.includes(leadProgId)
}

export function filterScholarshipsForLeadEducation(
  items: readonly ScholarshipRecord[],
  educationLevel: string,
  trainingPrograms: readonly MasterDataEntry[] | undefined,
): ScholarshipRecord[] {
  return items.filter((s) => scholarshipMatchesLeadTrainingProgram(s, educationLevel, trainingPrograms))
}
