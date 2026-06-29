import type { MasterDataEntry } from '../types'
import { labelsFromEntries } from './masterDataCatalogOps'

/** Gộp nhãn hệ đào tạo + dự định hình thức → «Hình thức học quan tâm». */
export function mergedStudyFormatLabels(
  trainingPrograms?: readonly MasterDataEntry[],
  studyIntentions?: readonly string[],
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const label of [...labelsFromEntries(trainingPrograms), ...(studyIntentions ?? [])]) {
    const t = label.trim()
    if (!t) continue
    const key = t.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }
  return out.sort((a, b) => a.localeCompare(b, 'vi'))
}

export function studyFormatFromParts(studyIntention?: string, educationLevel?: string): string {
  return studyIntention?.trim() || educationLevel?.trim() || ''
}
