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
// 2) Trưởng nhóm (`team_lead`)
//    - Quản lý / cập nhật hồ sơ TVV trong nhóm (`managedCounselorIds`); đổi TVV; profile nhóm; mẫu tư vấn
//    - Không: master data toàn trường, Tri thức/LLM engine, nhân sự admin
//    - Legacy Firestore: `head_of_profession` / `head_of_department` → đọc như `team_lead`
//
// 3) Admin / Principal
//    - Full configuration: ScoringRules, MasterData, Playbook Builder, routing policies
//
// Enforcement: combine Firestore Security Rules + App checks; types here document intent.
// -----------------------------------------------------------------------------

export const USER_ROLES = [
  'super_admin',
  'counselor',
  'team_lead',
  'admin',
] as const

export type UserRole = (typeof USER_ROLES)[number]

/** Human-readable labels (UI / audit) */
export const USER_ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Siêu quản trị',
  counselor: 'Tư vấn viên',
  team_lead: 'Trưởng nhóm',
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
  /** Legacy / tùy chọn: khoa (fallback lọc TVV nếu chưa có `managedCounselorIds`). */
  departmentId?: DocumentId
  /** Legacy / tùy chọn: đơn vị ngành. */
  professionUnitId?: DocumentId
  /** Legacy: các ngành — fallback lọc hồ sơ theo `educationLevel` nếu chưa có TVV trong `managedCounselorIds`. */
  managedMajorIds?: DocumentId[]
  /** Trưởng nhóm: danh sách UID tư vấn viên trong nhóm (ưu tiên khi lọc hồ sơ). */
  managedCounselorIds?: UserId[]
  /** Counselor: chuyên môn ưu tiên để routing IT → IT counselor, v.v. */
  specialtyMajorIds?: DocumentId[]
  /** Counselor: soft capacity / workload hint for routing engine */
  maxConcurrentLeads?: number
  isActive: boolean
  /**
   * Quản lý nhân sự bật: được chạy phân tích LLM trên hồ sơ và AI Lead Miner (Admin / Siêu quản trị luôn được)
   * (vẫn cần API đã cấu hình trên trình duyệt nơi Siêu quản trị lưu khóa).
   * Siêu quản trị không cần cờ này.
   */
  allowLlmAndAiTasks?: boolean
  /**
   * Bổ sung quyền ngoài ma trận vai trò (gán trên Firestore `users/{uid}` — thường do Siêu quản trị).
   * Firestore Rules vẫn là nguồn chân lý; UI chỉ mở rộng tính năng khi Rules cho phép.
   */
  extraPermissions?: Permission[]
  /** Thu hồi quyền so với ma trận vai trò (ưu tiên hơn `extraPermissions`). */
  deniedPermissions?: Permission[]
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
  'leads:read:team_scope',
  'leads:read:global',
  'leads:write:self_assigned',
  /** Trưởng nhóm: sửa hồ sơ thuộc TVV trong phạm vi quản lý. */
  'leads:write:team_scope',
  /** TVV: chuyển hồ sơ đang gán cho mình sang TVV khác (cần Firestore Rules cho phép ghi `assignedTo`). */
  'leads:reassign:peer',
  /** Trưởng nhóm: đổi TVV cho hồ sơ trong nhóm. */
  'leads:reassign:team',
  'interactions:create:self_assigned',
  /** Trưởng nhóm: ghi tương tác trên hồ sơ TVV trong nhóm. */
  'interactions:create:team_scope',
  'interactions:read:team_scope',
  'dashboard:counselor',
  'dashboard:team_lead',
  'config:scoring_rules',
  /**
   * TVV: tạo / sửa / xóa profile chấm điểm **do chính mình tạo** (`createdBy` = uid).
   * Profile toàn trường (không `createdBy` hoặc `createdBy` khác) chỉ xem — không ghi đè profile người khác.
   */
  'config:scoring_profiles_own',
  /** Trưởng nhóm: tạo & sửa profile chấm điểm của TVV trong nhóm (`managedCounselorIds`). */
  'config:scoring_profiles_team',
  'config:master_data',
  'config:playbooks',
  'config:routing_policies',
  'config:users',
  /** Trưởng nhóm: quản lý TVV trong phạm vi (không tạo admin). */
  'config:users:team',
  'data:intake',
  'ai:use',
  /** Chỉ Siêu quản trị: lưu khóa API LLM + AI Gatekeeper (localStorage trên trình duyệt). */
  'config:llm_api',
  /** Cấu hình tác vụ AI trên Firestore (`ai_tasks`) — Admin / Siêu quản trị. */
  'config:ai_engine',
  'analytics:advanced',
  /** Cổng kế toán — duyệt thu/chi, Full NE, gửi n8n kế toán. */
  'finance:accountant',
  /** Báo cáo thu ngày/tháng từ Firestore → webhook n8n. */
  'finance:reports',
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
/** Mã danh mục — mặc định + danh mục tự thêm trong Cài đặt (chữ in hoa, gạch dưới). */
export type KnowledgeDocumentType = string

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

/** Trạng thái kế toán duyệt từng khoản — cột valid1..5 hệ cũ */
export type LeadPaymentApprovalStatus = '' | 'ĐỒNG Ý' | 'TỪ CHỐI' | 'KIỂM TRA LẠI'

export type LeadPaymentSlotKey = 'deposit' | 'supplementL1' | 'supplementL2' | 'supplementL3' | 'supplementL4'

export interface LeadPaymentLine {
  amountVnd?: number
  /** dd/MM/yyyy hoặc YYYY-MM-DD */
  collectedAt?: string
  receiptUrl?: string
  approvalStatus?: LeadPaymentApprovalStatus
}

export interface LeadFinanceRecord {
  payments?: Partial<Record<LeadPaymentSlotKey, LeadPaymentLine>>
  declaredTotalVnd?: number
  /** Trạng thái tuyển sinh / thu phí (MỚI, ĐANG HOÀN THIỆN, CỌC THÀNH CÔNG…) — cột 39 hệ cũ */
  enrollmentStatus?: string
  /** TVV tick «đã thu đủ FULL NE» — map cột 65: YÊU CẦU FULL NE / ĐÃ FULL NE */
  reqFullNe?: boolean
  fullNeStatus?: string
  n8nStatus?: string
}

/** Loại giấy tờ gửi n8n `create_document` */
export type InviteDocumentType =
  | 'LE_PHI_CO_DAU'
  | 'LE_PHI_KHONG_DAU'
  | 'TRUNG_TUYEN_9_CO_DAU'
  | 'TRUNG_TUYEN_9_KHONG_DAU'
  | 'TRUNG_TUYEN_CD_CO_DAU'
  | 'TRUNG_TUYEN_CD_KHONG_DAU'
  | 'THU_MOI_CD_CO_DAU'
  | 'THU_MOI_CD_KHONG_DAU'

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
  /** Ngành / nội dung quan tâm (ưu tiên cho chấm điểm `majorInterest`; tách khỏi hệ đào tạo khi nhập đủ cột) */
  majorInterest?: string
  /** Học lực / xếp loại (ưu tiên cho khối chấm điểm `academicLevel`) */
  academicPerformance?: string
  /** Loại hình THPT — nhãn hoặc mã (vd. Công lập, Liên kết, PUBLIC) */
  schoolType?: string
  /** Dự định hình thức đào tạo (Đại học / Cao đẳng / …) */
  studyIntention?: string
  /** Nhóm tài chính / khả năng (đồng bộ danh mục `financial_profiles` + chấm điểm IN_LIST) */
  financialStatus?: string
  /** Quận / huyện Hà Nội khi có (danh mục `hanoi_areas`) */
  hanoiArea?: string
  /** Người phụ trách — Firebase Auth UID (RBAC biên Counselor) */
  assignedTo: UserId | null
  /** Tình trạng — Kanban tư vấn (Firestore `status`) */
  status: LeadCounselorStatus
  /** Ghi chú / mô tả chung (import, tổng hợp) — quy tắc dùng targetField `description` / CONTAINS */
  description: string
  /**
   * Nguyện vọng / mong muốn học tập (ưu tiên tách khỏi mô tả chung).
   * Import Excel: cột «Nguyện vọng» / tương đương; chấm điểm / AI: `aspirations`.
   */
  aspirations?: string
  /** Sở thích — `hobbies` trong tác vụ AI / quy tắc nếu cần */
  hobbies?: string
  /** Ghi chú khảo sát / đi thực tế — `fieldTripNotes` */
  fieldTripNotes?: string
  /** Trường học */
  highSchool: string
  /** Lớp */
  gradeClass: string
  /** Tỉnh / thành phố */
  province: string
  /** Địa chỉ */
  address: string
  /** Ngày sinh (chuỗi theo Excel, vd. dd/MM/yyyy hoặc YYYY-MM-DD) */
  dateOfBirth?: string
  /** Ghi chú 1 — cột Excel quy chuẩn; `targetField` chấm điểm: profileNote1 */
  profileNote1?: string
  /** Ghi chú 2 — targetField: profileNote2 */
  profileNote2?: string
  /** Nội dung lưu ý khác — targetField: otherAttentionNotes */
  otherAttentionNotes?: string

  /** CCCD / CMND (10 chữ số) — bỏ qua khi `nationalIdNotAvailable` */
  nationalId?: string
  /** Tick «chưa có» trên form — không bắt buộc nhập CCCD */
  nationalIdNotAvailable?: boolean
  /** Email sinh viên */
  studentEmail?: string
  /** Nguồn tiếp nhận 1 (nhãn danh mục `leadSources`) */
  source1?: string
  /** Nguồn tiếp nhận 2 */
  source2?: string
  fatherName?: string
  fatherPhone?: string
  motherName?: string
  motherPhone?: string
  /** Người giám hộ (họ tên hoặc mô tả ngắn) */
  guardian?: string
  /** Doc id trong `scholarships` — rỗng = không có học bổng */
  scholarship1Id?: string
  scholarship2Id?: string

  /** 5 khoản thu + FULL NE — đồng bộ logic hệ thống cũ (Sheet / n8n `full_data`) */
  finance?: LeadFinanceRecord
  /** Thư mục Drive giấy mời — cột 36 hệ cũ */
  inviteFolderUrl?: string

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
  /** Điểm thông tin (0–100): tỷ lệ thông tin đã ghi nhận trên hồ sơ; nên đi kèm `mlExplanation` khi lưu. */
  mlWinProbability?: number
  /** Giải thích đi kèm điểm thông tin (khi đủ cặp với `mlWinProbability`, UI hiển thị bản đã lưu thay MVP). */
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
  /**
   * Cờ bổ sung theo id tín hiệu TVV tùy chỉnh (toàn trường trong `scoringAux/tvvSignalDefinitions` và/hoặc legacy trên profile);
   * điểm cộng/trừ do profile định nghĩa (không cần thêm khối canvas).
   */
  scoringCustomSignals?: Record<string, boolean>
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
  /** Giống CONTAINS (bỏ dấu, nhiều từ phẩy) + khớp thêm chuỗi không khoảng trắng và chữ cái đầu từng từ (viết tắt). */
  | 'CONTAINS_ABBR_NORM'
  /** Nhiều từ cách phẩy — lead phải chứa **tất cả** (AND), đều so sau bỏ dấu / gom khoảng trắng. */
  | 'CONTAINS_ALL_NORM'
  /** Nếu trường chứa **bất kỳ** từ khóa nào (phẩy, không dấu) thì không khớp — dùng loại trừ. */
  | 'NOT_CONTAINS_NORM'
  /** Trường có ít nhất một chữ số (theo chuỗi gốc). */
  | 'HAS_DIGIT'
  | 'IS_NOT_EMPTY'
  | 'IN_LIST'
  | 'PHONE_VN_10_DIGITS'
  | 'PHONE_VN_NOT_10_DIGITS'

/** Danh sách đủ điều kiện — dùng validate Firestore & form mẫu quy tắc. */
export const ALL_PROFILE_SCORING_CONDITIONS: readonly ProfileScoringCondition[] = [
  'EQUALS',
  'CONTAINS',
  'CONTAINS_ABBR_NORM',
  'CONTAINS_ALL_NORM',
  'NOT_CONTAINS_NORM',
  'HAS_DIGIT',
  'IS_NOT_EMPTY',
  'IN_LIST',
  'PHONE_VN_10_DIGITS',
  'PHONE_VN_NOT_10_DIGITS',
]

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

/** Một dòng điều kiện lưu trong mẫu Firestore (không cần `id` — sinh lại khi kéo vào profile). */
export type ScoringRuleTemplateRowPersist = Omit<ScoringRuleConditionRow, 'id'>

/**
 * Một khối quy tắc mẫu trong `scoringRuleTemplates/{id}` — kéo sang profile rồi chỉnh / lưu riêng từng profile.
 */
export interface ScoringRuleTemplateDoc {
  id: string
  /** Thứ tự trong thư viện (sắp xếp tăng dần). */
  order: number
  category: RuleCategory
  /** Tiêu đề hiển thị trong thư viện kéo-thả */
  title: string
  hint: string
  label: string
  targetField: string
  maxWeight: number
  rows: ScoringRuleTemplateRowPersist[]
  updatedAt?: Timestamp
  /**
   * Khi có giá trị: mẫu này thay thế mẫu có sẵn trong app trùng `key` (kéo-thả vẫn dùng đúng key đó).
   * Xóa document → trở lại mẫu gốc trong code.
   */
  replacesBuiltinKey?: string | null
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
 * Tín hiệu TVV tùy chỉnh (Hành vi / Rủi ro) — checkbox trên chi tiết hồ sơ, điểm theo profile.
 */
export interface ProfileCustomScoringSignal {
  id: DocumentId
  label: string
  group: 'behavior' | 'risk'
  /** Điểm khi bật (thường dương cho hành vi, âm cho rủi ro). */
  points: number
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
  /** @deprecated Dùng `scoringAux/tvvSignalDefinitions` (Cài đặt → Quy tắc mẫu). Giữ để tương thích — gộp với bản toàn trường khi chấm điểm. */
  customScoringSignals?: ProfileCustomScoringSignal[]
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

/** Kiểu giá trị trong danh mục — ảnh hưởng cách IN_LIST so với trường lead. */
export type MasterCatalogValueKind = 'text' | 'number'

/**
 * Chế độ khớp mặc định cho catalog (mỗi mục có thể ghi đè `matchMode`).
 * - exact_raw: khớp chính xác theo chữ gốc (trim), có dấu, phân biệt hoa thường.
 * - exact_norm: khớp không dấu — chuẩn hoá giống scoring, so khớp đúng nhãn hoặc synonym.
 * - fuzzy_contains: khớp tương đối — chuỗi chứa lẫn nhau sau chuẩn hoá.
 * - gte / lte / between: so sánh số (parse từ giá trị lead); dùng `numericMin` / `numericMax` trên mục.
 */
export type MasterEntryMatchMode =
  | 'exact_raw'
  | 'exact_norm'
  | 'fuzzy_contains'
  | 'gte'
  | 'lte'
  | 'between'

export interface MasterCatalogDefinition {
  id: string
  label: string
  order: number
  /**
   * Nhóm hiển thị (giống khối Chấm điểm: Nhân khẩu, Học thuật, …). Bỏ trống = «Khác» trong UI.
   * Không đổi id document Firestore `masterData/{id}`.
   */
  ruleCategory?: RuleCategory
  /** Mặc định `text` — dùng `number` khi danh mục là khoảng điểm, học phí, v.v. */
  valueKind?: MasterCatalogValueKind
  /** Khi mục không khai báo `matchMode`. */
  defaultMatchMode?: MasterEntryMatchMode
}

/** Seed + gợi ý nhãn khi chưa có `_registry` hoặc khi thêm catalog lạ. */
export const DEFAULT_MASTER_CATALOGS: readonly MasterCatalogDefinition[] = [
  { id: 'regions', label: 'Vùng / tỉnh', order: 10, ruleCategory: 'demographics' },
  { id: 'hanoi_areas', label: 'Khu vực Hà Nội (quận / huyện)', order: 20, ruleCategory: 'demographics' },
  { id: 'high_schools', label: 'Trường THPT', order: 30, ruleCategory: 'demographics' },
  { id: 'majors', label: 'Ngành đào tạo', order: 40, ruleCategory: 'academic' },
  { id: 'school_types', label: 'Loại hình trường', order: 50, ruleCategory: 'academic' },
  { id: 'financial_profiles', label: 'Nhóm tài chính', order: 60, ruleCategory: 'psychographics' },
  { id: 'academic_performance', label: 'Học lực', order: 70, ruleCategory: 'academic' },
  { id: 'study_intentions', label: 'Dự định (hình thức đào tạo)', order: 80, ruleCategory: 'academic' },
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
  /** Ghi đè `defaultMatchMode` của catalog cho mục này. */
  matchMode?: MasterEntryMatchMode
  /** Biên dưới (gte, between) hoặc ngưỡng tùy `matchMode`. */
  numericMin?: number
  /** Biên trên (lte, between). */
  numericMax?: number
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
  /**
   * Từ khóa (mỗi dòng hoặc cách nhau dấu phẩy): khớp nếu xuất hiện trong nội dung hồ sơ
   * (tỉnh, ngành, mô tả, ghi chú…). Bổ sung cho triggerConditions — không bắt buộc AND cùng lúc.
   */
  matchKeywords?: string[]
  /** Khi bật: hiển thị với mọi hồ sơ đang mở (không cần điều kiện / từ khóa). */
  matchAllLeads?: boolean
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
  /**
   * Tính chất nội dung (Học phí, Chất lượng trường, Bằng cấp…).
   * @see playbookContentCategories.ts
   */
  contentCategory?: string
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
  /** Snapshot CRM (TVV) tại lúc lưu — hiển thị lịch sử đầy đủ trên client mới */
  snapshotCrmStatus?: LeadCounselorStatus
  /** Snapshot funnel tuyển sinh */
  snapshotPipelineStatus?: LeadPipelineStatus
  /** Snapshot nhãn ưu tiên (HOT/WARM/…) sau tính điểm */
  snapshotPriorityTag?: PriorityTag
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
  /** Dành cho mở rộng (chưa có hook đọc/ghi trong app hiện tại). */
  scoringRuleSets: 'scoringRuleSets',
  /** Mỗi doc = một `ScoringProfile` (rules + thresholds nhúng trong doc) */
  scoringProfiles: 'scoringProfiles',
  /** Khối quy tắc mẫu — kéo sang canvas profile (Firestore: `scoringRuleTemplates/{id}`). */
  scoringRuleTemplates: 'scoringRuleTemplates',
  /** Cấu hình phụ chấm điểm (vd. tín hiệu TVV toàn trường — doc cố định). */
  scoringAux: 'scoringAux',
  masterData: 'masterData',
  consultingPlaybooks: 'consultingPlaybooks',
  /** Smart Script Hub — modular consulting snippets */
  scriptSnippets: 'scriptSnippets',
  /** Dành cho mở rộng (chưa có hook đọc/ghi trong app hiện tại). */
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
  /** Danh mục nguồn lead (Nguồn 1 / 2 trên hồ sơ). */
  leadSources: 'leadSources',
  /** Danh mục học bổng (Học bổng 1 / 2). */
  scholarships: 'scholarships',
  /** Lịch sử gửi báo cáo thu ngày/tháng (kiểm tra trực tiếp trên app). */
  financeReports: 'financeReports',
} as const

export type FinanceReportKind = 'daily' | 'monthly'

export interface FinanceReportLog {
  id: string
  kind: FinanceReportKind
  /** dd/MM/yyyy hoặc MM/yyyy */
  periodLabel: string
  sentAt: Timestamp
  triggeredBy?: UserId
  triggeredByName?: string
  payloadPreview?: string
  n8nOk: boolean
  errorMessage?: string
}

/** Nhóm học bổng trên form hồ sơ. */
export type ScholarshipCategoryId = 'phcd' | 'cdcq'

export interface LeadSourceRecord {
  id: DocumentId
  label: string
  sortOrder: number
  isActive: boolean
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

export interface ScholarshipRecord {
  id: DocumentId
  label: string
  category: ScholarshipCategoryId
  /** Số tiền VNĐ (hiển thị trên nhãn) */
  amountVnd: number
  sortOrder: number
  isActive: boolean
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

export const SCHOLARSHIP_CATEGORY_LABELS: Record<ScholarshipCategoryId, string> = {
  phcd: 'PHỔ THÔNG CAO ĐẲNG',
  cdcq: 'CAO ĐẲNG CHÍNH QUY',
}

export type FsCollectionKey = keyof typeof FS_COLLECTIONS

/** Doc cố định: `scoringAux/tvvSignalDefinitions` — checklist tùy chỉnh (Hành vi / Rủi ro) cho chi tiết hồ sơ. */
export const SCORING_AUX_TVV_SIGNALS_DOC_ID = 'tvvSignalDefinitions' as const

/** Doc cố định: `scoringAux/infoScoreConfig` — quy tắc điểm thông tin (% đầy hồ sơ) toàn trường. */
export const SCORING_AUX_INFO_SCORE_DOC_ID = 'infoScoreConfig' as const

/** Các trường hồ sơ dùng trong công thức điểm thông tin — đồng bộ 20 cột Excel + 2 trường mở rộng (legacy). */
export const INFO_SCORE_FIELD_IDS = [
  'customerId',
  'fullName',
  'dateOfBirth',
  'phone',
  'parentPhone',
  'source',
  'majorInterest',
  'academicPerformance',
  'highSchool',
  'aspirations',
  'financialStatus',
  'hanoiArea',
  'hobbies',
  'profileNote1',
  'profileNote2',
  'gradeClass',
  'province',
  'address',
  'assignedTo',
  'otherAttentionNotes',
  'educationLevel',
  'description',
] as const

export type InfoScoreFieldId = (typeof INFO_SCORE_FIELD_IDS)[number]

export type InfoScoreFieldRowPersisted = {
  id: InfoScoreFieldId
  label: string
  pointsIfMatch: number
  hint?: string
  enabled: boolean
}

/** Lưu Firestore — `scoringAux/infoScoreConfig` */
export type InfoScoreRulesPersisted = {
  schemaVersion: 1
  basePoints: number
  capMin: number
  capMax: number
  fields: InfoScoreFieldRowPersisted[]
}
