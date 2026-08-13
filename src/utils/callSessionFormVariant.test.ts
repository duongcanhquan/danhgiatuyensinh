import { describe, expect, it } from 'vitest'
import {
  buildPicksFromSelections,
  getDefaultCallEvaluationConfig,
  validateEvaluationSelections,
} from './callSessionEvaluation'
import {
  callFormVariantForWorkMode,
  filterDimensionsForCallForm,
} from './callSessionFormVariant'

describe('callFormVariantForWorkMode', () => {
  it('volume_filter và score_queue → short', () => {
    expect(callFormVariantForWorkMode('volume_filter')).toBe('short')
    expect(callFormVariantForWorkMode('score_queue')).toBe('short')
  })

  it('care_close và thiếu mode → full (compat)', () => {
    expect(callFormVariantForWorkMode('care_close')).toBe('full')
    expect(callFormVariantForWorkMode(undefined)).toBe('full')
  })
})

describe('filterDimensionsForCallForm', () => {
  const dims = getDefaultCallEvaluationConfig()

  it('short loại enrollment_signal và chiều khách', () => {
    const filtered = filterDimensionsForCallForm(dims, 'short')
    expect(filtered.some((d) => d.id === 'enrollment_signal')).toBe(false)
    expect(filtered.some((d) => d.id === 'affect')).toBe(false)
    expect(filtered.some((d) => d.id === 'readiness')).toBe(false)
    expect(filtered.every((d) => d.required === false)).toBe(true)
  })

  it('full loại enrollment_signal nhưng giữ affect/readiness/decision_role', () => {
    const filtered = filterDimensionsForCallForm(dims, 'full')
    expect(filtered.some((d) => d.id === 'enrollment_signal')).toBe(false)
    expect(filtered.some((d) => d.id === 'affect')).toBe(true)
    expect(filtered.some((d) => d.id === 'readiness')).toBe(true)
    expect(filtered.some((d) => d.id === 'decision_role')).toBe(true)
    expect(filtered.some((d) => d.id === 'topics')).toBe(true)
    expect(filtered.some((d) => d.id === 'barriers')).toBe(true)
    expect(filtered.some((d) => d.id === 'call_actions')).toBe(true)
  })

  it('validate full đã lọc: đủ required khách, không cần enrollment_signal', () => {
    const filtered = filterDimensionsForCallForm(dims, 'full')
    const sel = {
      affect: ['positive_open'],
      readiness: ['considering'],
      decision_role: ['parent'],
    }
    expect(validateEvaluationSelections(filtered, sel).ok).toBe(true)
    expect(validateEvaluationSelections(dims, sel).ok).toBe(false)
  })

  it('validate short (disposition-only): không chọn chiều nào vẫn ok', () => {
    const filtered = filterDimensionsForCallForm(dims, 'short')
    expect(validateEvaluationSelections(filtered, {}).ok).toBe(true)
    const picks = buildPicksFromSelections(filtered, {})
    expect(picks.every((p) => p.dimensionId !== 'enrollment_signal')).toBe(true)
  })
})
