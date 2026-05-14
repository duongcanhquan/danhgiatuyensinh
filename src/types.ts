import type { Timestamp } from 'firebase/firestore'

// =============================================================================
// VietMy Admissions OS — Core domain & RBAC types (Phase 1)
// Firestore is the source of truth; Timestamps are stored server-side where noted.
// =============================================================================

/** Firebase Auth UID (string) */
export type UserId = string

/** Firestore document id */
export type DocumentId = string

// -----------------------------------------------------------------------------
// RBAC — strict hierarchy & data boundaries
// -----------------------------------------------------------------------------
//
// 1) Counselor (Tư vấn viên)
//    - May ONLY read/update Leads where `assignedCounselorId === auth.uid`
//    - May create Interactions & counselor notes for those leads only
//    - May read ConsultingPlaybooks (global playbook library; matching is server/client logic)
//
// 2) Head of Profession / Trưởng ngành
//    - Manages counselors (membership via `managedCounselorIds` OR `professionUnitId` graph — choose one model in Phase 2)
//    - Reads Leads for counselors in scope; reads their Interactions for QA dashboards
//    - Does NOT mutate global ScoringRules / MasterData unless also Admin (recommended: separate permission)
//
// 3) Head of Department / Trưởng khoa
//    - Scoped to `departmentId` + `managedMajorIds`
//    - Reads Leads intersecting department majors; department-level analytics
//
// 4) Admin / Principal
//    - Full configuration: ScoringRules, MasterData, Playbook Builder, routing policies
//
// Enforcement: combine Firestore Security Rules + App checks; types here document intent.
// -----------------------------------------------------------------------------

export const USER_ROLES = [
  'counselor',
  'head_of_profession',
  'head_of_department',
  'admin',
] as const

export type UserRole = (typeof USER_ROLES)[number]

/** Human-readable labels (UI / audit) */
export const USER_ROLE_LABELS: Record<UserRole, string> = {
  counselor: 'Tư vấn viên',
  head_of_profession: 'Trưởng ngành',
  head_of_department: 'Trưởng khoa',
  admin: 'Quản trị / Hiệu trưởng',
}

/**
 * Extended profile stored in Firestore, keyed by Auth `uid`.
 * Collection suggestion: `users/{uid}`
 */
export interface VietMyUserProfile {
  id: UserId
  email: string
  displayName: string
  role: UserRole
  /** Trưởng khoa: khoa quản lý */
  departmentId?: DocumentId
  /** Trưởng ngành: đơn vị nghiệp vụ / khối ngành */
  professionUnitId?: DocumentId
  /** Trưởng khoa: các ngành thuộc phạm vi */
  managedMajorIds?: DocumentId[]
  /** Trưởng ngành: danh sách counselor do mình quản lý (denormalized snapshot) */
  managedCounselorIds?: UserId[]
  /** Counselor: chuyên môn ưu tiên để routing IT → IT counselor, v.v. */
  specialtyMajorIds?: DocumentId[]
  /** Counselor: soft capacity / workload hint for routing engine */
  maxConcurrentLeads?: number
  isActive: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
}

/** Optional custom claims mirror (keep in sync with Cloud Functions / Auth claims if used) */
export interface VietMyCustomClaims {
  role: UserRole
  departmentId?: string
  professionUnitId?: string
}

// -----------------------------------------------------------------------------
// Permissions — coarse capabilities for UI gating (Rules are authoritative)
// -----------------------------------------------------------------------------

export const PERMISSIONS = [
  'leads:read:self_assigned',
  'leads:read:profession_scope',
  'leads:read:department_scope',
  'leads:read:global',
  'leads:write:self_assigned',
  /** TVV: chuyển hồ sơ đang gán cho mình sang TVV khác (cần Firestore Rules cho phép ghi `assignedTo`). */
  'leads:reassign:peer',
  'interactions:create:self_assigned',
  'interactions:read:profession_scope',
  'interactions:read:department_scope',
  'dashboard:counselor',
  'dashboard:head_of_profession',
  'dashboard:head_of_department',
  'config:scoring_rules',
  'config:master_data',
  'config:playbooks',
  'config:routing_policies',
  'config:users',
  'data:intake',
  'ai:use',
  /** Cấu hình API LLM + builder tác vụ AI (Settings) */
  'config:ai_engine',
  'analytics:advanced',
] as const

export type Permission = (typeof PERMISSIONS)[number]

/** Map roles → default permissions (override per-tenant in Phase 2 if needed) */
export type RolePermissionMatrix = Record<UserRole, readonly Permission[]>

// -----------------------------------------------------------------------------
// Leads
// -----------------------------------------------------------------------------

/** Nhãn ưu tiên — gán theo điểm tích lũy và ngưỡng HOT/WARM trong từng bộ profile (COLD 0…warm−1, LOSS &lt;0). */
export type PriorityTag = 'HOT' | 'WARM' | 'COLD' | 'LOSS'

// -----------------------------------------------------------------------------
// Lead scoring signals — Hành vi / Rủi ro (checklist TVV, `leads.scoringSignals`)
// -----------------------------------------------------------------------------

/** Khóa cờ lưu Firestore; chỉ giá trị `true` được lưu (thiếu = không bật). */
export type LeadScoringSignalKey =
  | 'askedTuition'
  | 'askedCareerAfterGrad'
  | 'addedZalo'
  | 'sentTranscript'
  | 'consultedParents'
  | 'filledRegistrationForm'
  | 'silentOver7Days'
  | 'wantsUniversityAtAllCosts'
  | 'parentsWantUniversityOnly'
  | 'enrolledElsewhere'

export type LeadScoringSignals = Partial<Record<LeadScoringSignalKey, true>>

export type LeadPipelineStatus =
  | 'NEW'
  | 'CONTACTED'
  | 'QUALIFIED'
  | 'APPLIED'
  | 'ENROLLED'
  | 'LOST'
  | 'ARCHIVED'

/**
 * Counselor CRM / Kanban — EdTech pipeline (distinct from admission `pipelineStatus`).
 * Persisted on each lead as `status` in Firestore.
 * Legacy values (`ATTEMPTED_CONTACT`, …) are normalized on read.
 */
export type LeadCounselorStatus =
  | 'NEW'
  | 'INTERESTED'
  | 'DEPOSIT_PAID'
  | 'ENROLLED'
  | 'SUMMER_MELT'
  | 'DEAD'

export const LEAD_COUNSELOR_STATUS_ORDER: readonly LeadCounselorStatus[] = [
  'NEW',
  'INTERESTED',
  'DEPOSIT_PAID',
  'ENROLLED',
  'SUMMER_MELT',
  'DEAD',
] as const

export const LEAD_COUNSELOR_STATUS_LABELS: Record<LeadCounselorStatus, string> = {
  NEW: 'Mới',
  INTERESTED: 'Quan tâm / đang tư vấn',
  DEPOSIT_PAID: 'Đã cọc',
  ENROLLED: 'Nhập học',
  SUMMER_MELT: 'Hủy phút chót',
  DEAD: 'Không tiềm năng / đóng',
}

/** Institutional knowledge for RAG-backed copilot (`knowledgeDocuments/{id}`). */
export type KnowledgeDocumentType = 'TUITION' | 'POLICY' | 'MAJOR_INFO'

export interface KnowledgeDocument {
  id: DocumentId
  title: string
  content: string
  type: KnowledgeDocumentType
  uploadedAt: Timestamp
}

export type SchoolType = 'PUBLIC' | 'PRIVATE' | 'INTERNATIONAL' | 'UNKNOWN'

export type FinancialStatus =
  | 'FULL_PAY'
  | 'INSTALLMENT'
  | 'SCHOLARSHIP_SEEKING'
  | 'FINANCIAL_AID'
  | 'UNKNOWN'

/**
 * Canonical Lead — collection `leads/{leadId}`
 * Schema aligned to VietMy Excel intake columns + persistence / analytics system fields.
 */
export interface Lead {
  id: DocumentId
  /** Mã KH */
  customerId: string
  /** Tên sinh viên (mẫu Excel); trường `fullName` */
  fullName: string
  /** Điện thoại */
  phone: string
  /** ĐT người liên hệ (mẫu Excel) */
  parentPhone: string
  /** Nguồn (mẫu Excel); nhãn tự do từ Excel / CRM */
  source: string
  /** Hệ đào tạo — Trưởng khoa lọc theo khớp nhãn ngành trong phạm vi `managedMajorIds` */
  educationLevel: string
  /** Người phụ trách — Firebase Auth UID (RBAC biên Counselor) */
  assignedTo: UserId | null
  /** Tình trạng — Kanban tư vấn (Firestore `status`) */
  status: LeadCounselorStatus
  /** Ghi chú thêm / mô tả tiến độ (có thể nối thêm theo thời gian) */
  description: string
  /** Trường học */
  highSchool: string
  /** Lớp */
  gradeClass: string
  /** Tỉnh / thành phố */
  province: string
  /** Địa chỉ */
  address: string

  // --- System / analytics (not Excel columns) ---
  calculatedScore: number
  priorityTag: PriorityTag
  /** Thời điểm upload / import (ưu tiên hiển thị vòng đời lead) */
  uploadedAt: Timestamp
  updatedAt: Timestamp
  /** Phễu tuyển sinh — suy ra từ `status` + dữ liệu legacy khi đọc Firestore */
  pipelineStatus: LeadPipelineStatus
  /** Dedupe fingerprint */
  uniqueHash: string
  createdAt: Timestamp
  /** @deprecated Ghi song song khi import để tương thích query cũ; ưu tiên `assignedTo` */
  assignedCounselorId?: UserId | null
  uploadedBy?: UserId
  uploaderName?: string
  uploadBatchId?: string
  importedAt?: Timestamp
  lastTouchedAt?: Timestamp
  routingMeta?: LeadRoutingMeta
  mlWinProbability?: number
  mlExplanation?: string
  nextFollowUpDate?: Timestamp | null
  aiSentimentScore?: number
  aiInsights?: Record<string, unknown>

  /** AI Lead Miner (stage-2 LLM shortlist) — bổ sung sau khi chạy batch phân tích WARM */
  isAiShortlisted?: boolean
  aiShortlistReason?: string
  recommendedAction?: string
  aiProcessedAt?: Timestamp
  /**
   * Checklist «Hành vi» / «Rủi ro» do TVV bật trên màn chi tiết — đưa vào chấm điểm qua các trường `sig_*`
   * trong bản ghi đánh giá nội bộ (xem `leadToEvaluationRecord`).
   */
  scoringSignals?: LeadScoringSignals
}

export interface LeadRoutingMeta {
  lastScoredAt?: Timestamp
  lastRoutingAt?: Timestamp
  scoringRuleSetId?: DocumentId
  routingPolicyId?: DocumentId
  /** Explainability strings for admins */
  scoreBreakdown?: Record<string, number>
  assignmentReason?: string
}

/** Payload when creating/updating from intake (before assign) */
export type LeadCreateInput = Omit<Lead, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: DocumentId
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

// -----------------------------------------------------------------------------
// Scoring — multiple profiles (Firestore: `scoringProfiles/{profileId}`)
// -----------------------------------------------------------------------------

/**
 * Điều kiện trên một trường lead (dùng trong `ScoringProfile.rules`).
 * `PHONE_VN_*`: chỉ áp dụng ý nghĩa đúng khi `targetField` là chuỗi SĐT (vd. `phone`, `parentPhone`);
 * engine lấy chỉ các chữ số, chuẩn hoá `+84`/`84` → `0…` rồi so sánh độ dài 10.
 */
export type ProfileScoringCondition =
  | 'EQUALS'
  | 'CONTAINS'
  | 'IS_NOT_EMPTY'
  | 'IN_LIST'
  | 'PHONE_VN_10_DIGITS'
  | 'PHONE_VN_NOT_10_DIGITS'

// -----------------------------------------------------------------------------
// Scoring profile builder — 100-point budget blocks & rule library
// -----------------------------------------------------------------------------

/** High-level taxonomy for sidebar templates & analytics */
export const RULE_CATEGORIES = [
  'demographics',
  'academic',
  'source_engagement',
  'psychographics',
  'behavior',
  'risk',
  'ai_insights',
] as const

export type RuleCategory = (typeof RULE_CATEGORIES)[number]

export const RULE_CATEGORY_LABELS: Record<RuleCategory, string> = {
  demographics: 'Nhân khẩu',
  academic: 'Học thuật',
  source_engagement: 'Nguồn & tương tác',
  psychographics: 'Tâm lý / định tính',
  behavior: 'Hành vi',
  risk: 'Rủi ro',
  ai_insights: 'AI & insight',
}

/** How a condition row maps its score into the block’s `maxWeight` cap */
export const SCORING_ALLOCATION_KINDS = ['absolute', 'percent_of_max'] as const

export type ScoringRuleAllocationKind = (typeof SCORING_ALLOCATION_KINDS)[number]

/**
 * One branch inside a block — **all matching rows contribute** (cumulative); điểm có thể âm.
 * `maxWeight` chỉ còn ý nghĩa gợi ý UI / tỷ lệ phần trăm khi `allocationKind === 'percent_of_max'`.
 */
export interface ScoringRuleConditionRow {
  id: DocumentId
  condition: ProfileScoringCondition
  value: string | string[]
  allocationKind: ScoringRuleAllocationKind
  /**
   * If `absolute`: points awarded when the row matches (before block cap).
   * If `percent_of_max`: 0–100 meaning % of the block’s `maxWeight`.
   */
  allocationValue: number
}

/**
 * A weighted block — engine **tổng hợp mọi dòng khớp** (không giới hạn tổng 100 điểm toàn profile).
 */
export interface ScoringRuleBlock {
  id: DocumentId
  category: RuleCategory
  /** Human label in the builder (e.g. “Học lực”) */
  label: string
  targetField: keyof Lead | string
  /** Budget reserved for this block on the 100‑point scale */
  maxWeight: number
  rows: ScoringRuleConditionRow[]
}

/**
 * Một quy tắc nhúng trong profile — không còn collection `scoringRules` phẳng.
 * Legacy flat rules. Prefer `ruleBlocks` for new profiles; engine still reads `rules` when `ruleBlocks` is empty.
 */
export interface ScoringRule {
  id: DocumentId
  targetField: keyof Lead | string
  condition: ProfileScoringCondition
  value: string | string[]
  points: number
}

export interface ScoringProfileThresholds {
  /** Điểm tối thiểu để nhãn HOT (mặc định 80 nếu không hợp lệ). */
  hotMinScore: number
  /** Điểm tối thiểu để nhãn WARM; luôn &lt; HOT sau khi chuẩn hóa. */
  warmMinScore: number
}

/**
 * Bộ quy tắc chấm điểm có tên — cùng một lead có thể được “nhìn” khác nhau theo profile.
 */
export interface ScoringProfile {
  id: DocumentId
  profileName: string
  description: string
  rules: ScoringRule[]
  /**
   * Canvas / 100‑point budget model. When present and non‑empty, scoring engine uses blocks
   * instead of flat `rules`.
   */
  ruleBlocks?: ScoringRuleBlock[]
  thresholds: ScoringProfileThresholds
  /** Profile mặc định toàn cục (import + màn hình khi chưa chọn tay) */
  isDefaultForImport?: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy?: UserId
}

/** @deprecated Giữ type cũ cho tài liệu; không dùng trong app */
export interface ScoringRuleSet {
  id: DocumentId
  name: string
  description?: string
  isActive: boolean
  priority: number
  createdAt: Timestamp
  updatedAt: Timestamp
}

// -----------------------------------------------------------------------------
// Master data — catalog động (đăng ký trong `masterData/_registry`)
// -----------------------------------------------------------------------------

/** Document meta: danh sách catalog + thứ tự hiển thị (không phải danh mục giá trị). */
export const MASTER_DATA_REGISTRY_DOC_ID = '_registry' as const

export interface MasterCatalogDefinition {
  id: string
  label: string
  order: number
}

/** Seed + gợi ý nhãn khi chưa có `_registry` hoặc khi thêm catalog lạ. */
export const DEFAULT_MASTER_CATALOGS: readonly MasterCatalogDefinition[] = [
  { id: 'regions', label: 'Vùng / tỉnh', order: 10 },
  { id: 'hanoi_areas', label: 'Khu vực Hà Nội (quận / huyện)', order: 20 },
  { id: 'high_schools', label: 'Trường THPT', order: 30 },
  { id: 'majors', label: 'Ngành đào tạo', order: 40 },
  { id: 'school_types', label: 'Loại hình trường', order: 50 },
  { id: 'financial_profiles', label: 'Nhóm tài chính', order: 60 },
  { id: 'academic_performance', label: 'Học lực', order: 70 },
  { id: 'study_intentions', label: 'Dự định (hình thức đào tạo)', order: 80 },
] as const

/** Id catalog mặc định (bootstrap / migration). Thực tế UI lấy từ `_registry`. */
export const MASTER_DATA_DEFAULT_IDS: readonly string[] = DEFAULT_MASTER_CATALOGS.map((c) => c.id)

/** @deprecated Dùng MASTER_DATA_DEFAULT_IDS hoặc MasterCatalogId */
export const MASTER_DATA_KINDS = MASTER_DATA_DEFAULT_IDS

/** Id document trong `masterData/{id}` — có thể mở rộng qua Cấu hình. */
export type MasterCatalogId = string

/** @deprecated Dùng MasterCatalogId */
export type MasterDataKind = MasterCatalogId

export interface MasterDataRegistryDocument {
  catalogs: MasterCatalogDefinition[]
  updatedAt: Timestamp
}

export interface MasterDataEntry {
  id: DocumentId
  label: string
  /** Alternative spellings for intake normalization */
  synonyms?: string[]
  /** For majors: owning department */
  departmentId?: DocumentId
  /** Program capacity planning (Head of Department dashboards) */
  annualCapacity?: number
  isActive?: boolean
}

/**
 * Một document mỗi catalog: `masterData/{catalogId}` (catalogId đăng ký trong `_registry`).
 */
export interface MasterDataDocument {
  id: string
  entries: MasterDataEntry[]
  updatedAt: Timestamp
  updatedBy?: UserId
}

// -----------------------------------------------------------------------------
// AI Analyzer — LLM integration & dynamic tasks (`ai_tasks` collection)
// -----------------------------------------------------------------------------

export type AIProviderId = 'Gemini' | 'OpenAI'

/** Cấu hình kết nối LLM (MVP: lưu localStorage trên trình duyệt admin — không ghi API key thô vào Firestore). */
export interface AIIntegrationConfig {
  provider: AIProviderId
  apiKey: string
  model: string
}

/**
 * Một tác vụ phân tích AI — prompt + trường lead cần gửi + schema JSON mong đợi.
 * `id` trùng document id trên Firestore `ai_tasks/{id}`.
 */
export interface AITask {
  id: string
  name: string
  systemPrompt: string
  userEmphasis: string
  targetFields: string[]
  /** Ví dụ: { "financialReadiness": "Tốt|Trung Bình|Kém", "reasoning": "string" } */
  expectedOutputSchema: Record<string, string>
}

// -----------------------------------------------------------------------------
// Consulting Playbooks — knowledge base cho tư vấn (kết hợp LLM Gemini / ChatGPT khi cấu hình)
// -----------------------------------------------------------------------------

/**
 * Logical fields playbooks can match against (extend freely; engine should allow unknown fields with safe fallbacks).
 */
export type PlaybookConditionField =
  | 'province'
  | 'region'
  | 'educationLevel'
  | 'source'
  | 'highSchool'
  | 'gradeClass'
  | 'address'
  | 'customerId'
  | 'description'
  | 'hanoiArea'
  | 'major'
  | 'majorInterest'
  | 'schoolType'
  | 'financialStatus'
  | 'academicLevel'
  | 'studyIntention'
  | 'priorityTag'
  | 'pipelineStatus'
  | 'status'
  | (string & {})

export type PlaybookOperator = 'EQUALS' | 'CONTAINS' | 'IN' | 'NOT_IN'

export interface PlaybookTriggerCondition {
  field: PlaybookConditionField
  operator?: PlaybookOperator
  /** Single value or list for IN / NOT_IN */
  value: string | string[]
}

/**
 * Consulting playbook — collection `consultingPlaybooks/{id}`
 * Hiển thị trong playbook tư vấn khi triggerConditions khớp ngữ cảnh hồ sơ.
 */
export interface ConsultingPlaybook {
  id: DocumentId
  title: string
  isActive: boolean
  /** Higher wins on overlaps */
  priority: number
  triggerConditions: PlaybookTriggerCondition[]
  /** Core narrative / positioning */
  strategy: string
  /** Distilled USPs for UI bullet list (optional denormalization from strategy) */
  keySellingPoints?: string[]
  /** Objection → recommended counter (string can embed "->" per legacy examples) */
  objectionHandling: string[]
  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy?: UserId
  /** Gắn khi seed — giữ khi «Sửa» để xóa hàng loạt theo seedTag vẫn khớp */
  seedTag?: string
}

// -----------------------------------------------------------------------------
// Smart Script Hub — modular snippets → dynamic consulting flow (`scriptSnippets`)
// -----------------------------------------------------------------------------

export const SCRIPT_CATEGORIES = [
  'GREETING',
  'USP',
  'CAREER_VISION',
  'OBJECTION_HANDLING',
  'CLOSING',
] as const

export type ScriptCategory = (typeof SCRIPT_CATEGORIES)[number]

export const SCRIPT_CATEGORY_LABELS: Record<ScriptCategory, string> = {
  GREETING: 'Mở đầu',
  USP: 'Điểm mạnh (USP)',
  CAREER_VISION: 'Tầm nhìn nghề nghiệp',
  OBJECTION_HANDLING: 'Xử lý từ chối',
  CLOSING: 'Kết & chốt',
}

/**
 * Điều kiện khớp một lead (cùng mô hình toán tử / trường như playbook trigger & scoring targetField).
 */
export type RuleCondition = PlaybookTriggerCondition

/**
 * Một đoạn kịch bản modular — `scriptSnippets/{id}`.
 * Khớp lead khi **tất cả** `matchConditions` đúng (AND). Không có điều kiện → không kích hoạt snippet này.
 */
export interface ScriptSnippet {
  id: DocumentId
  title: string
  category: ScriptCategory
  /** Nội dung thoại / gợi ý (plain text; OBJECTION_HANDLING: dòng 1 = lo ngại, sau `\\n---\\n` = script trả lời) */
  content: string
  matchConditions: RuleCondition[]
  isActive: boolean
  lastUpdated: Timestamp
  createdAt?: Timestamp
  /** Gắn khi seed hàng loạt — giữ qua lần «Lưu» trong Script Hub để vẫn xóa gọn theo seedTag */
  seedTag?: string
}

// -----------------------------------------------------------------------------
// Interactions — sub-collection `leads/{leadId}/interactions/{interactionId}`
// -----------------------------------------------------------------------------

export type InteractionChannel = 'CALL' | 'SMS' | 'EMAIL' | 'ZALO' | 'IN_PERSON' | 'NOTE' | 'SYSTEM'

export type SentimentLabel = 'positive' | 'neutral' | 'negative' | 'mixed'

export interface AiSentimentAnalysis {
  label: SentimentLabel
  /** -1 .. 1 or 0 .. 100 — pick one convention in Phase 4 & keep consistent */
  score: number
  summary: string
  topics?: string[]
  /** Model identifier for auditability */
  model?: string
  analyzedAt: Timestamp
}

/**
 * Every call / note / AI-enriched touchpoint for training & dashboards.
 */
export interface Interaction {
  id: DocumentId
  leadId: DocumentId
  channel: InteractionChannel
  /** Counselor or system */
  authorUid: UserId
  authorRole: UserRole
  timestamp: Timestamp
  /** Free-form counselor note */
  counselorNote?: string
  /** Structured outcome for funnel metrics */
  callOutcome?: 'NO_ANSWER' | 'CONNECTED' | 'FOLLOW_UP' | 'DISQUALIFIED' | 'APPOINTMENT_SET' | 'OTHER'
  durationSeconds?: number
  /** Post-call AI enrichment */
  aiSentiment?: AiSentimentAnalysis
  /** Optional evaluation tag for QA (Head of Profession) */
  evaluationTag?: string
}

// -----------------------------------------------------------------------------
// Routing policies (optional Phase 3 — typed now for engine cohesion)
// -----------------------------------------------------------------------------

export type RoutingStrategyKind = 'ROUND_ROBIN' | 'LOWEST_LOAD' | 'MAJOR_MATCH' | 'RULE_BASED'

export interface RoutingPolicy {
  id: DocumentId
  name: string
  isActive: boolean
  strategy: RoutingStrategyKind
  /** Major id → counselor uid priority list */
  majorToCounselorMap?: Record<DocumentId, UserId[]>
  createdAt: Timestamp
  updatedAt: Timestamp
}

// -----------------------------------------------------------------------------
// Dashboards & analytics DTOs (computed in Cloud Functions or client Phase 5)
// -----------------------------------------------------------------------------

export interface CounselorDashboardKpis {
  uid: UserId
  openTasks: number
  hotLeadsToday: number
  personalConversionRate: number
  callsToday: number
}

export interface CounselorLeaderboardRow {
  counselorUid: UserId
  displayName: string
  assignedLeads: number
  calls7d: number
  avgResponseMinutes?: number
  avgSentimentScore?: number
  conversionRate?: number
}

export interface HeadOfProfessionDashboard {
  generatedAt: Timestamp
  counselors: CounselorLeaderboardRow[]
}

export interface MajorFunnelStage {
  majorId: DocumentId
  majorLabel: string
  stage: LeadPipelineStatus
  count: number
}

export interface HeadOfDepartmentDashboard {
  departmentId: DocumentId
  generatedAt: Timestamp
  funnelByMajor: MajorFunnelStage[]
  regionDistribution: { region: string; count: number }[]
}

// -----------------------------------------------------------------------------
// Auth context shape (implementation in Phase 2)
// -----------------------------------------------------------------------------

export interface AuthState {
  /** `authenticating` = Firebase user đã có, đang đồng bộ Firestore `users/{uid}` */
  status: 'unknown' | 'unauthenticated' | 'authenticating' | 'authenticated'
  firebaseUid: UserId | null
  profile: VietMyUserProfile | null
  /** Effective permissions after role + overrides */
  permissions: readonly Permission[]
}

// -----------------------------------------------------------------------------
// Audit trail — top-level `auditLogs/{id}` (immutable event log per lead)
// -----------------------------------------------------------------------------

export const AUDIT_LOG_ACTION_TYPES = [
  'STATUS_CHANGE',
  'REASSIGNMENT',
  'NOTE_ADDED',
  'AI_RUN',
  'SYSTEM_UPDATE',
] as const

export type AuditLogActionType = (typeof AUDIT_LOG_ACTION_TYPES)[number]

/** Firestore document shape (id = document id). */
export interface AuditLog {
  id: DocumentId
  leadId: DocumentId
  actionType: AuditLogActionType
  description: string
  /** Auth UID */
  performedBy: UserId
  /** Display snapshot at write time */
  performedByName: string
  timestamp: Timestamp
}

// -----------------------------------------------------------------------------
// Firestore path constants (single source for hooks / services)
// -----------------------------------------------------------------------------

export const FS_COLLECTIONS = {
  users: 'users',
  leads: 'leads',
  scoringRuleSets: 'scoringRuleSets',
  /** Mỗi doc = một `ScoringProfile` (rules + thresholds nhúng trong doc) */
  scoringProfiles: 'scoringProfiles',
  masterData: 'masterData',
  consultingPlaybooks: 'consultingPlaybooks',
  /** Smart Script Hub — modular consulting snippets */
  scriptSnippets: 'scriptSnippets',
  routingPolicies: 'routingPolicies',
  /** Sub-collection of a lead */
  interactions: 'interactions',
  /** Kết quả AI theo tác vụ — không đọc trong danh sách lead; chỉ khi mở chi tiết. */
  leadAiInsightTasks: 'aiInsightTasks',
  /** Tác vụ phân tích AI (prompt + target fields + schema) */
  ai_tasks: 'ai_tasks',
  /** Immutable lead audit events (cross-tenant accountability) */
  auditLogs: 'auditLogs',
  /** RAG knowledge base — tuition, policy, major facts (admin-maintained). */
  knowledgeDocuments: 'knowledgeDocuments',
} as const

export type FsCollectionKey = keyof typeof FS_COLLECTIONS
