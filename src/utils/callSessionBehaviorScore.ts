import type { CallEvalDimension, CallEvalPick } from '../types'
import type { EvaluationSelections } from './callSessionEvaluation'
import { CALL_BEHAVIOR_BASE_SCORE } from './callSessionBehaviorCatalog'

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min
  return Math.max(min, Math.min(max, n))
}

/** Tổng delta điểm từ các lựa chọn đã tick (chỉ option có `points`). */
export function sumBehaviorPointsFromPicks(picks: readonly CallEvalPick[]): number {
  return picks.reduce((s, p) => s + (typeof p.points === 'number' ? p.points : 0), 0)
}

export function sumBehaviorPointsFromSelections(
  dimensions: readonly CallEvalDimension[],
  selections: EvaluationSelections,
): number {
  let total = 0
  for (const dim of dimensions) {
    const ids = selections[dim.id] ?? []
    for (const optionId of ids) {
      const opt = dim.options.find((o) => o.id === optionId)
      if (opt && typeof opt.points === 'number') total += opt.points
    }
  }
  return total
}

/** Điểm hành vi cuộc gọi 0–100 = base + delta, clamp. */
export function behaviorScoreFromDelta(
  delta: number,
  baseScore: number = CALL_BEHAVIOR_BASE_SCORE,
): { behaviorScore: number; behaviorPointsDelta: number } {
  const behaviorPointsDelta = Math.round(delta)
  const behaviorScore = clamp(Math.round(baseScore + behaviorPointsDelta), 0, 100)
  return { behaviorScore, behaviorPointsDelta }
}

export function behaviorScoreFromPicks(
  picks: readonly CallEvalPick[],
  baseScore: number = CALL_BEHAVIOR_BASE_SCORE,
): { behaviorScore: number; behaviorPointsDelta: number } {
  return behaviorScoreFromDelta(sumBehaviorPointsFromPicks(picks), baseScore)
}

export function behaviorScoreFromSelections(
  dimensions: readonly CallEvalDimension[],
  selections: EvaluationSelections,
  baseScore: number = CALL_BEHAVIOR_BASE_SCORE,
): { behaviorScore: number; behaviorPointsDelta: number } {
  return behaviorScoreFromDelta(sumBehaviorPointsFromSelections(dimensions, selections), baseScore)
}

/** Chuẩn hóa điểm hành vi trung bình tháng → 0–100 cho trụ tuân thủ KPI. */
export function monthlyBehaviorScoreFromCallScores(scores: readonly number[]): number {
  if (!scores.length) return 100
  const avg = scores.reduce((s, v) => s + v, 0) / scores.length
  return clamp(Math.round(avg), 0, 100)
}

export function formatBehaviorDelta(delta: number): string {
  if (delta > 0) return `+${delta}`
  if (delta < 0) return String(delta)
  return '0'
}
