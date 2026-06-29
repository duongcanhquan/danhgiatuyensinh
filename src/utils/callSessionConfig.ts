/** @deprecated Dùng `callSessionEvaluation` — giữ re-export tương thích ngắn. */
export {
  getDefaultCallEvaluationConfig as getDefaultCallSessionChips,
  mergeCallEvaluationConfig as mergeCallSessionChips,
  parseCallEvaluationConfigDoc as parseCallSessionChipsDoc,
  migrateChipsToDimensions,
} from './callSessionEvaluation'

export type { CallSessionChip } from './callSessionCatalog'
