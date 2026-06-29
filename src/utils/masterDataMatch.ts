import type { MasterCatalogDefinition, MasterDataEntry, MasterEntryMatchMode } from '../types'

/** Cùng quy tắc chuẩn hoá như `scoringEngine.norm` — giữ đồng bộ khi đổi một nơi. */
export function scoringNormMaster(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
}

export function parseLeadNumericString(raw: string): number | null {
  const t = String(raw ?? '')
    .trim()
    .replace(/\s/g, '')
    .replace(/,/g, '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export function findMasterEntryForListItem(entries: MasterDataEntry[], wantNorm: string): MasterDataEntry | undefined {
  if (!wantNorm) return undefined
  return entries.find((e) => {
    if (scoringNormMaster(e.label) === wantNorm) return true
    return Boolean(e.synonyms?.some((s) => scoringNormMaster(String(s)) === wantNorm))
  })
}

function effectiveMatchMode(entry: MasterDataEntry, catalog?: MasterCatalogDefinition): MasterEntryMatchMode {
  return entry.matchMode ?? catalog?.defaultMatchMode ?? 'exact_norm'
}

function effectiveValueKind(catalog?: MasterCatalogDefinition): 'text' | 'number' {
  return catalog?.valueKind === 'number' ? 'number' : 'text'
}

/**
 * Kiểm tra giá trị lead (`rawField` gốc + `fieldValNorm` đã chuẩn hoá) có khớp mục master theo chế độ không.
 * Dùng cho điều kiện IN_LIST khi rule liệt kê nhãn (hoặc synonym) trùng mục trong catalog.
 */
export function entryMatchesMasterValue(
  rawField: string,
  fieldValNorm: string,
  entry: MasterDataEntry,
  catalog?: MasterCatalogDefinition,
): boolean {
  const mode = effectiveMatchMode(entry, catalog)
  const kind = effectiveValueKind(catalog)

  if (kind === 'number') {
    if (mode === 'exact_raw') {
      const raw = String(rawField ?? '').trim()
      if (!raw) return false
      if (raw === String(entry.label).trim()) return true
      return Boolean(entry.synonyms?.some((s) => raw === String(s).trim()))
    }
    const n = parseLeadNumericString(rawField)
    if (n === null) return false
    const min = entry.numericMin
    const max = entry.numericMax
    if (mode === 'gte') {
      return min !== undefined && Number.isFinite(min) && n >= min
    }
    if (mode === 'lte') {
      return max !== undefined && Number.isFinite(max) && n <= max
    }
    if (mode === 'between') {
      return (
        min !== undefined &&
        max !== undefined &&
        Number.isFinite(min) &&
        Number.isFinite(max) &&
        n >= min &&
        n <= max
      )
    }
    if (mode === 'fuzzy_contains') {
      const fv = fieldValNorm
      const lab = scoringNormMaster(entry.label)
      if (!fv) return false
      if (fv.includes(lab) || lab.includes(fv)) return true
      return Boolean(entry.synonyms?.some((s) => {
        const sn = scoringNormMaster(String(s))
        return fv.includes(sn) || sn.includes(fv)
      }))
    }
    const entryNum = parseLeadNumericString(entry.label)
    if (entryNum !== null && n === entryNum) return true
    if (fieldValNorm === scoringNormMaster(entry.label)) return true
    return Boolean(entry.synonyms?.some((s) => fieldValNorm === scoringNormMaster(String(s))))
  }

  if (mode === 'exact_raw') {
    const raw = String(rawField ?? '').trim()
    if (!raw) return false
    if (raw === String(entry.label).trim()) return true
    return Boolean(entry.synonyms?.some((s) => raw === String(s).trim()))
  }

  if (mode === 'fuzzy_contains') {
    const fv = fieldValNorm
    const lab = scoringNormMaster(entry.label)
    if (!fv) return false
    if (fv.includes(lab) || lab.includes(fv)) return true
    return Boolean(entry.synonyms?.some((s) => {
      const sn = scoringNormMaster(String(s))
      return fv.includes(sn) || sn.includes(fv)
    }))
  }

  if (fieldValNorm === scoringNormMaster(entry.label)) return true
  return Boolean(entry.synonyms?.some((s) => fieldValNorm === scoringNormMaster(String(s))))
}
