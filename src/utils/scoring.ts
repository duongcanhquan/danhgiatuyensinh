/**
 * @deprecated Import from `./scoringEngine` — file này re-export để tương thích import cũ.
 */
export {
  FIXED_TAG_THRESHOLDS,
  computeMajorTrainingAlignment,
  computeStoredScoringForLeadPatch,
  evaluateLead,
  inferRuleCategory,
  isKnownHighSchool,
  isProfileOverBudget,
  leadToEvaluationRecord,
  legacyRulesToBlocks,
  persistedLeadScoringFields,
  normalizeSchoolTypeKey,
  resolveTagBands,
  scoreOneBlock,
  scoreToPriorityTag,
  sumBlockMaxWeights,
  sumBlockPoints,
  sumRulePoints,
  type MasterDataBuckets,
} from './scoringEngine'

import { FIXED_TAG_THRESHOLDS } from './scoringEngine'

/** @deprecated Dùng FIXED_TAG_THRESHOLDS */
export const DEFAULT_TAG_THRESHOLDS = {
  hot: FIXED_TAG_THRESHOLDS.hot,
  warm: FIXED_TAG_THRESHOLDS.warm,
} as const
