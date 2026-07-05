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
  'ctv',
  'team_lead',
  'admin',
  'accountant',
] as const

export type UserRole = (typeof USER_ROLES)[number]

/** Human-readable labels (UI / audit) */
export const USER_ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Siêu quản trị',
  counselor: 'Nhân viên Sale',
  ctv: 'Cộng tác viên (CTV)',
  team_lead: 'Trưởng nhóm Sale',
  admin: 'Quản lý',
  accountant: 'Kế toán',
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
  /** Trưởng nhóm: danh sách UID nhân viên sale / CTV trong nhóm (ưu tiên khi lọc hồ sơ). */
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
  /** Số nội bộ OMICall (SIP) — ưu tiên hơn cấu hình mặc định toàn trường. */
  omicallSipUser?: string
  /** Mật khẩu SIP số nội bộ — chỉ quản trị sửa trên Firestore / form nhân sự. */
  omicallSipPassword?: string
  /** ID nhân viên OMICall (`create_by.id`) — map lịch sử cuộc gọi REST API. */
  omicallAgentId?: string
  /** Đầu số gọi ra mặc định của TVV (từ hotline/list hoặc public_number). */
  omicallOutboundNumber?: string
  /** Lần đồng bộ số nội bộ từ API Tổng đài gần nhất. */
  omicallSyncedAt?: Timestamp
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
  /** Cấu hình OMICall (tổng đài gọi từ web) — Admin / Siêu quản trị. */
  'config:omicall',
  'analytics:advanced',
  /** Cổng kế toán — duyệt thu/chi, Full NE, gửi n8n kế toán. */
  'finance:accountant',
  /** Quản lý tài khoản kế toán viên trong cổng kế toán. */
  'finance:manage_accountants',
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
  /** Lý do từ chối / ghi chú kế toán (hiển thị cho TVV). */
  approvalNote?: string
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
  /** Mã hệ thống — YYMMDD + 4 số thứ tự/ngày (tự sinh khi tạo hồ sơ). */
  systemCode?: string
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
  /** Địa chỉ — đồng bộ với `permanentAddress` khi lưu từ form mới */
  address: string
  /** Dân tộc */
  ethnicity?: string
  /** Địa chỉ thường trú */
  permanentAddress?: string
  /** Nơi ở hiện tại */
  currentResidence?: string
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
  /** Tóm tắt AI sau cuộc gọi gần nhất (panel ghi chú OMICall). */
  lastCallAiSummary?: string
  /** Mức sẵn sàng từ AI cuộc gọi (Cao / Trung bình / Thấp). */
  lastCallAiReadiness?: string
  lastCallAiAt?: Timestamp
  /** Nhãn ưu tiên tối thiểu sau bảng đánh giá gọi (chỉ nâng HOT/WARM, không tự hạ). */
  callEvalPriorityBoost?: PriorityTag
  callEvalPriorityBoostAt?: Timestamp
  /** Điểm hành vi cuộc gọi gần nhất (0–100) — từ checklist TVV khi gọi. */
  lastCallBehaviorScore?: number
  /** Mã lựa chọn tín hiệu tuyển sinh sau gọi gần nhất (`enrollment_signal`). */
  lastCallEnrollmentSignalId?: string
  /** Mã mức sẵn sàng sau gọi gần nhất (`readiness`). */
  lastCallReadinessId?: string
  /** Thành phần điểm hồ sơ 0–100 (khi bật phân loại tỷ trọng). */
  leadScoreProfilePart?: number
  /** Thành phần điểm tương tác/gọi 0–100 (khi bật phân loại tỷ trọng). */
  leadScoreEngagementPart?: number
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
export type ScoringProfileScope = 'global' | 'team'

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
  /** `global` = admin — áp dụng toàn hệ thống; `team` = trưởng nhóm — áp dụng nhóm TVV. */
  scope?: ScoringProfileScope
  /** UID trưởng nhóm sở hữu profile nhóm (khi `scope === 'team'`). */
  scopeOwnerUid?: UserId
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
  { id: 'training_programs', label: 'Hệ đào tạo', order: 35, ruleCategory: 'academic' },
  { id: 'majors', label: 'Chuyên ngành', order: 40, ruleCategory: 'academic' },
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

export type AIProviderId = 'Gemini' | 'OpenAI' | 'DeepSeek'

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

/** Nhóm thẻ ghi nhanh trong / sau cuộc gọi (panel OMICall). */
export type CallSessionTagCategory =
  | 'attitude'
  | 'voice'
  | 'topic'
  | 'activity'
  | 'objection'
  | 'signal'

export interface CallSessionTagPick {
  category: CallSessionTagCategory
  label: string
}

/** Một lựa chọn trong bảng đánh giá cuộc gọi (cấu hình + lưu kết quả). */
export interface CallEvalOption {
  id: string
  label: string
  /** Điểm cộng/trừ khi tick (chỉ chiều hành vi TVV). */
  points?: number
}

/** Nhóm hiển thị chiều hành vi TVV — dùng màu và tính điểm cuộc gọi. */
export type CallEvalScoringGroup = 'positive' | 'negative' | 'process'

/** Một chiều đánh giá (thái độ, sẵn sàng, giọng nói…) — admin có thể chỉnh trong Cài đặt. */
export interface CallEvalDimension {
  id: string
  label: string
  /** Gợi ý ngắn cho TVV (không bắt buộc thuật ngữ học thuật). */
  hint?: string
  selectionMode: 'single' | 'multi'
  required?: boolean
  order?: number
  /** Chiều có điểm KPI hành vi khi gọi (tích cực / tiêu cực / quy trình). */
  scoringGroup?: CallEvalScoringGroup
  options: CallEvalOption[]
}

export interface CallEvalPick {
  dimensionId: string
  dimensionLabel: string
  optionId: string
  optionLabel: string
  points?: number
}

/** Bản ghi đánh giá trực tiếp sau cuộc gọi — dùng cho báo cáo / AI. */
export interface CallSessionEvaluationRecord {
  version: 2
  picks: CallEvalPick[]
  evaluatedAt?: Timestamp
  /** Tổng điểm hành vi cuộc gọi 0–100 (cộng/trừ từ checklist TVV). */
  behaviorScore?: number
  /** Tổng delta điểm thô trước clamp (để báo cáo). */
  behaviorPointsDelta?: number
}

/** Kết quả phân tích AI sau cuộc gọi (lưu trên interaction). */
export interface CallAiAssessment {
  tomTatCuocGoi: string
  mucDoSanSang: string
  camXuc: SentimentLabel
  /** 0–100 — đồng bộ lên `lead.aiSentimentScore` khi lưu. */
  diemCamXuc: number
  diemManh: string
  ruiRo: string
  hanhDongTiepTheo: string
  cauHoiNenHoi: string
  model?: string
  analyzedAt: Timestamp
}

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
  /** Đồng bộ từ nhà cung cấp tổng đài (vd. OMICall) */
  provider?: 'OMICALL'
  providerCallId?: string
  providerUuid?: string
  recordingUrl?: string
  recordSeconds?: number
  billSeconds?: number
  answerSeconds?: number
  hotline?: string
  sipUser?: string
  syncedFrom?: 'sdk' | 'webhook' | 'history_sync'
  /** Post-call AI enrichment */
  aiSentiment?: AiSentimentAnalysis
  /** Thẻ TVV bấm nhanh khi / sau gọi (OMICall panel) — legacy, sinh từ bảng đánh giá. */
  callSessionTags?: CallSessionTagPick[]
  /** Bảng đánh giá trực tiếp (các chiều thái độ, sẵn sàng, tín hiệu…). */
  callSessionEvaluation?: CallSessionEvaluationRecord
  /** Phân tích AI từ ghi chú + bảng đánh giá cuộc gọi. */
  callAiAssessment?: CallAiAssessment
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
  /** Lịch sử cuộc gọi OMICall đã đồng bộ từ webhook/API. */
  omicallCalls: 'omicallCalls',
  /** Kết quả phân tích AI của OMICall, tách riêng để tránh làm nặng doc cuộc gọi. */
  omicallCallAnalyses: 'omicallCallAnalyses',
  /** KPI tổng hợp theo ngày: `kpiDaily/{date}/counselors|teams/{id}`. */
  kpiDaily: 'kpiDaily',
  /** Log các lần đồng bộ OMICall từ Cloud Functions. */
  omicallSyncRuns: 'omicallSyncRuns',
  /** Sự kiện chuyển đổi CRM (tag/status) — aggregate vào kpiDaily. */
  leadEvents: 'leadEvents',
  /** KPI tổng hợp tháng: `kpiMonthly/{YYYY-MM}/counselors/{uid}`. */
  kpiMonthly: 'kpiMonthly',
  /** Mục tiêu KPI tháng: `kpiTargets/{YYYY-MM}` + `counselors/{uid}`. */
  kpiTargets: 'kpiTargets',
  /** Điểm tuân thủ thủ công (trưởng nhóm): `kpiManualScores/{YYYY-MM}/counselors/{uid}`. */
  kpiManualScores: 'kpiManualScores',
} as const

export type LeadEventType = 'TAG_CHANGED' | 'STATUS_CHANGED' | 'PIPELINE_CHANGED'

export interface LeadEvent {
  id: string
  leadId: DocumentId
  counselorUid: UserId
  teamLeadUid?: UserId | null
  type: LeadEventType
  from?: string
  to?: string
  at: Timestamp
  kpiAppliedAt?: Timestamp
}

export type KpiBonusTier = 'gold' | 'silver' | 'bronze' | 'none'

export interface CounselorMonthlyKpi {
  id: string
  month: string
  counselorUid: UserId
  teamLeadUid?: UserId | null
  rankInScope?: number
  bonusTier?: KpiBonusTier
  totalCalls: number
  validCalls: number
  connectedCalls: number
  leadCham?: number
  lpxtCount?: number
  talkSeconds: number
  validTalkSeconds: number
  uniqueLeadsCalled: number
  crmActions: number
  depositPaidCount: number
  tuitionPaidCount: number
  approvedRevenueVnd: number
  fullNeCount: number
  warmNew: number
  hotNew: number
  newToInterested: number
  toDeposit: number
  toEnrolled: number
  notesAdded?: number
  updatedAt?: Timestamp
}

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

export interface LeadSourceRecord {
  id: DocumentId
  label: string
  sortOrder: number
  isActive: boolean
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

/** Nhóm học bổng trên form hồ sơ. */
export type ScholarshipCategoryId = 'phcd' | 'cdcq'

/** Ô chọn học bổng trên hồ sơ: HB1 / HB2. */
export type ScholarshipApplySlot = 'slot1' | 'slot2'

/** Nhãn đối tượng áp dụng (cấu hình nhanh trong admin). */
export type ScholarshipAudienceTag =
  | 'all'
  | 'new_enrollment'
  | 'early_bird'
  | 'transfer'
  | 'continuing'
  | 'event_participant'
  | 'referral'
  | 'high_achiever'

export interface ScholarshipRecord {
  id: DocumentId
  label: string
  category: ScholarshipCategoryId
  /** Số tiền VNĐ (hiển thị trên nhãn) */
  amountVnd: number
  sortOrder: number
  isActive: boolean
  /** ISO YYYY-MM-DD — bỏ trống = không giới hạn */
  validFrom?: string
  validTo?: string
  /** Ô HB1 / HB2 trên form — mặc định cả hai nếu bỏ trống */
  applySlots?: ScholarshipApplySlot[]
  /** Tag đối tượng (checkbox admin) */
  audienceTags?: ScholarshipAudienceTag[]
  /** Mô tả đối tượng (hiển thị cho TVV) */
  targetAudience?: string
  /** Điều kiện / phần học phí áp dụng */
  eligibilityNotes?: string
  /** Ghi chú nội bộ admin */
  adminNotes?: string
  /** Hình thức áp dụng — vd. «Cộng dồn 5 kỳ: 3-3-3-3-3 triệu», «Trừ học phí HK1» */
  applicationMethod?: string
  /** Số lượng suất học bổng (theo kế hoạch) */
  quantityLimit?: number
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

export const SCHOLARSHIP_CATEGORY_LABELS: Record<ScholarshipCategoryId, string> = {
  phcd: 'PHỔ THÔNG CAO ĐẲNG',
  cdcq: 'CAO ĐẲNG CHÍNH QUY',
}

export const SCHOLARSHIP_APPLY_SLOT_LABELS: Record<ScholarshipApplySlot, string> = {
  slot1: 'Học bổng 1',
  slot2: 'Học bổng 2',
}

export const SCHOLARSHIP_AUDIENCE_LABELS: Record<ScholarshipAudienceTag, string> = {
  all: 'Tất cả ứng viên',
  new_enrollment: 'Tân sinh viên / nhập học mới',
  early_bird: 'Đăng ký sớm (Early Bird)',
  transfer: 'Chuyển trường',
  continuing: 'Sinh viên tiếp nối (Continuing)',
  event_participant: 'Tham gia sự kiện / hội thảo',
  referral: 'Giới thiệu / CBNV',
  high_achiever: 'Học lực cao / xuất sắc',
}

export type FsCollectionKey = keyof typeof FS_COLLECTIONS

/** Doc cố định: `scoringAux/tvvSignalDefinitions` — checklist tùy chỉnh (Hành vi / Rủi ro) cho chi tiết hồ sơ. */
export const SCORING_AUX_TVV_SIGNALS_DOC_ID = 'tvvSignalDefinitions' as const

/** Doc cố định: `scoringAux/infoScoreConfig` — quy tắc điểm thông tin (% đầy hồ sơ) toàn trường. */
export const SCORING_AUX_INFO_SCORE_DOC_ID = 'infoScoreConfig' as const

/** Doc cố định: `scoringAux/omicallIntegration` — tổng đài OMICall (Web SDK). */
export const SCORING_AUX_OMICALL_DOC_ID = 'omicallIntegration' as const

/** Doc cố định: `scoringAux/kpiEvaluationConfig` — quy tắc KPI Sale (gọi HL, cảnh báo, điểm tháng, hạng thưởng). */
export const SCORING_AUX_KPI_EVAL_DOC_ID = 'kpiEvaluationConfig' as const

/** Doc cố định: `scoringAux/callSessionChips` — thẻ ghi nhanh khi gọi (panel OMICall). */
export const SCORING_AUX_CALL_SESSION_DOC_ID = 'callSessionChips' as const

/** Doc cố định: `scoringAux/leadClassificationConfig` — tỷ trọng hồ sơ vs gọi điện → HOT/WARM/COLD. */
export const SCORING_AUX_LEAD_CLASSIFICATION_DOC_ID = 'leadClassificationConfig' as const

/** Doc cố định: `scoringAux/publicRegistrationConfig` — cổng đăng ký sinh viên công khai + webhook n8n. */
export const SCORING_AUX_PUBLIC_REGISTRATION_DOC_ID = 'publicRegistrationConfig' as const

/** Khóa API LLM + provider/model — Siêu quản trị lưu một lần, mọi TVV được bật quyền AI dùng chung. */
export const SCORING_AUX_ORG_AI_DOC_ID = 'orgAiIntegration' as const

/** Trọng số thành phần trong trụ «Tương tác / gọi điện». */
export type LeadEngagementSubWeights = {
  callBehavior: number
  callSignal: number
  aiSentiment: number
  tvvSignals: number
  priorityBoost: number
}

/** Trọng số trong trụ «Hồ sơ». */
export type LeadProfileSubWeights = {
  /** Quy tắc profile chấm điểm (demographics, ngành, nguồn…) */
  profileRules: number
  /** Điểm thông tin / % đầy hồ sơ */
  infoScore: number
}

/** Cấu hình phân loại nhãn HOT/WARM/COLD theo tỷ trọng — admin chỉnh trên Firestore. */
export type LeadClassificationConfigPersisted = {
  schemaVersion: 1
  /** Bật: `calculatedScore` + `priorityTag` = tổng hợp có tỷ trọng; tắt: logic cũ. */
  enabled: boolean
  /** % trụ hồ sơ (0–100); trụ gọi điện = 100 − profileWeightPercent */
  profileWeightPercent: number
  profile: LeadProfileSubWeights & {
    /** Chuẩn hóa điểm thô quy tắc profile về 0–100 (mặc định 100). */
    profileRulesCap: number
  }
  engagement: {
    subWeights: LeadEngagementSubWeights
    /** Điểm tín hiệu tuyển sinh / sẵn sàng sau gọi (0–100). */
    signalScores: Record<string, number>
    /** Điểm từ nhãn boost sau gọi. */
    boostScores: Record<PriorityTag, number>
    /** Chuẩn hóa tổng điểm tín hiệu TVV trên hồ sơ về 0–100 */
    tvvSignalsCap: number
  }
  thresholds: {
    hotMinScore: number
    warmMinScore: number
  }
}

export type LeadClassificationBreakdown = {
  profilePart: number
  engagementPart: number
  compositeScore: number
  priorityTag: PriorityTag
  profileDetail: { rulesNorm: number; infoNorm: number }
  engagementDetail: {
    callBehavior: number
    callSignal: number
    aiSentiment: number
    tvvSignals: number
    priorityBoost: number
  }
}

/** Mục tiêu KPI theo tháng (mặc định chung hoặc ghi đè từng TVV). */
export type KpiMetricTargets = {
  validCalls: number
  uniqueLeadsCalled: number
  warmHot: number
  newToInterested: number
  crmActions: number
  depositPaidCount: number
  enrolled: number
  approvedRevenueVnd: number
}

/** Trọng số 4 trụ KPI tổng hợp (tổng = 100). */
export type KpiCompositeWeights = {
  call: number
  conversion: number
  compliance: number
  enrollment: number
}

export type KpiCompositeConfig = {
  weights: KpiCompositeWeights
  /** Xếp hạng thưởng trên scorecard: composite hoặc doanh thu server */
  rankBy: 'composite' | 'revenue'
  call: {
    subWeights: { validCalls: number; uniqueLeads: number; quality: number }
    minValidRatio: number
    minConnectRatio: number
  }
  conversion: {
    subWeights: { warmHot: number; interested: number; crm: number }
  }
  compliance: {
    /** % phần tự động trong trụ tuân thủ (còn lại = thủ công trưởng nhóm) */
    autoWeightPercent: number
    penalizeSpamWarning: number
    penalizeNoDepositWarning: number
    penalizeLowConnectWarning: number
    minNoteRatioPerValidCall: number
  }
  enrollment: {
    subWeights: { deposit: number; enrolled: number; revenue: number }
  }
  globalTargets: KpiMetricTargets
}

/** Điểm tuân thủ thủ công do trưởng nhóm chấm (0–100). */
export type KpiManualScoreRecord = {
  counselorUid: UserId
  month: string
  complianceScore: number
  note?: string
  updatedBy?: UserId
  updatedAt?: Timestamp
}

/** Cấu hình đánh giá KPI Sale — lưu Firestore, đồng bộ Cloud Functions + UI. */
export type KpiEvaluationConfigPersisted = {
  schemaVersion: 1 | 2
  validCall: {
    /** Thời lượng tối thiểu (giây) — bill_sec hoặc answer_sec */
    minBillSeconds: number
    /** Không tính 2 HL cùng TVV + cùng lead trong khoảng này (giờ) */
    dedupWindowHours: number
  }
  warnings: {
    spam: { minTotalCalls: number; minValidRatio: number; label: string }
    noDeposit: { minTotalCalls: number; label: string }
    lowConnect: { minTotalCalls: number; maxConnectRatio: number; label: string }
  }
  monthlyScore: {
    capCalls: number
    capConversion: number
    capDeposit: number
    capRevenue: number
    capInterested: number
    targetValidCalls: number
    pointsPerWarmHot: number
    pointsPerDeposit: number
    revenueDenominatorVnd: number
    pointsPerInterested: number
  }
  bonusTiers: {
    /** Phần trăm xếp hạng tích lũy tối đa để vào hạng (0–1) */
    goldMaxPercentile: number
    silverMaxPercentile: number
    bronzeMaxPercentile: number
    labelGold: string
    labelSilver: string
    labelBronze: string
    labelNone: string
  }
  finance: {
    approvalStatus: string
    fullNeStatus: string
  }
  /** KPI tổng hợp 40/30/10/20 — schema v2 */
  composite?: KpiCompositeConfig
}

/** Đích gọi — gắn vào `userData` cuộc gọi & log tương tác. */
export type OmicallCallTarget = 'student' | 'parent' | 'father' | 'mother'

export type OmicallCallOutcome = 'CONNECTED' | 'NO_ANSWER' | 'OTHER'

export interface OmicallCallRecord {
  id: DocumentId
  transactionId: string
  callUuid?: string
  direction: 'outbound' | 'inbound' | 'local' | string
  phoneNumber: string
  displayNumber?: string
  hotline?: string
  sipUser?: string
  leadId?: DocumentId | null
  counselorUid?: UserId | null
  teamLeadUid?: UserId | null
  startedAt?: Timestamp
  answeredAt?: Timestamp
  endedAt?: Timestamp
  createdAt?: Timestamp
  answerSeconds: number
  billSeconds: number
  durationSeconds: number
  recordSeconds: number
  recordingFileUrl?: string
  hangupCause?: string
  endByName?: string
  provider?: string
  outcome: OmicallCallOutcome
  state?: string
  isFinal?: boolean
  syncSource?: 'webhook' | 'history_sync'
  syncedAt?: Timestamp
  interactionId?: string
  kpiAppliedAt?: Timestamp
  /** Giai đoạn 2: ≥45s + có leadId + không trùng 4h */
  isValidCall?: boolean
  invalidReason?: string
  aiAnalysisId?: string
  aiAnalysisSyncedAt?: Timestamp
  aiAnalysisStatusCode?: number | null
  disposition?: string
  agentId?: string
  agentName?: string
  customerName?: string
  callNote?: string
  isAutoCall?: boolean
  evaluationScore?: number
  aiAnalysisSummary?: string
}

export interface OmicallCallAnalysisRecord {
  id: DocumentId
  transactionId: string
  tenantId?: string | null
  direction?: string | null
  recordingFile?: string | null
  sipNumber?: string | null
  phoneNumber?: string | null
  timeStartToAnswer?: Timestamp | null
  durationSeconds: number
  billSeconds: number
  resultSpeechAnalytics?: Record<string, unknown>
  resultNlpAnalytics?: Record<string, unknown>
  analystResults?: Record<string, unknown>
  qualityEvaluationResult?: Record<string, unknown>
  nlAnalyzeResult?: Record<string, unknown>
  staffWordAlignmentCount?: number
  customerWordAlignmentCount?: number
  statusCode?: number | null
  instanceVersion?: string | null
  syncedAt?: Timestamp
  updatedAt?: Timestamp
}

/** Vai trò dùng trong ma trận KPI (PDF). */
export type KpiStaffRole = 'ctv' | 'counselor' | 'team_lead'

export type KpiSourceBucket = 'off' | 'mkt' | 'all'

export type KpiDailyMetricKey =
  | 'outboundCalls'
  | 'connectedCalls'
  | 'leadCham'
  | 'validCalls'
  | 'uniqueLeadsCalled'
  | 'newToInterested'
  | 'warmHot'
  | 'lpxtCount'
  | 'depositPaidCount'
  | 'toEnrolled'

export type KpiRoleDailyTargets = Partial<Record<KpiDailyMetricKey, number>>

export type KpiMonthlyScoreWeights = {
  validCalls: number
  leadCham: number
  warm: number
  deposit: number
  enrolled?: number
}

export type KpiV2ConfigPersisted = {
  schemaVersion: 1
  enabled: boolean
  /** YYYY-MM-DD — chỉ áp dụng metric mới từ ngày này (không backfill). */
  goLiveDate: string
  lpxtMinVnd: number
  leadChamMinSeconds: number
  leadChamMaxSecondsExclusive: number
  /** Map nhãn nguồn (source1) → OFF / MKT */
  sourceBucketByLabel: Record<string, KpiSourceBucket>
  /** Chỉ tiêu ngày theo vai trò × bucket nguồn */
  dailyTargets: Record<KpiStaffRole, Record<KpiSourceBucket, KpiRoleDailyTargets>>
  /** Chỉ tiêu gọi nghe máy/tháng theo vai trò (PDF) */
  monthlyCallTargets: Record<KpiStaffRole, { perDay: number; perMonth: number }>
  monthlyScoreWeights: Record<KpiStaffRole, KpiMonthlyScoreWeights>
  /** Ngày lễ YYYY-MM-DD (trừ khỏi ngày hành chính) */
  businessHolidays: string[]
  rankByKpiScoreOnly: boolean
  updatedAt?: Timestamp
}

export interface CounselorDailyKpi {
  id: string
  date: string
  counselorUid?: UserId
  teamLeadUid?: UserId | null
  totalCalls: number
  outboundCalls: number
  inboundCalls: number
  connectedCalls: number
  missedCalls: number
  talkSeconds: number
  ringSeconds: number
  recordings: number
  crmActions?: number
  notesAdded?: number
  statusChanges?: number
  reassignments?: number
  aiRuns?: number
  depositPaidCount?: number
  tuitionPaidCount?: number
  paidCount?: number
  depositRevenueVnd?: number
  tuitionRevenueVnd?: number
  approvedRevenueVnd?: number
  fullNeCount?: number
  /** Cuộc gọi hợp lệ (chống gian lận) — nghe máy ≥ ngưỡng HL */
  validCalls?: number
  validTalkSeconds?: number
  /** Bắt máy nhưng 1s ≤ duration < 30s */
  leadCham?: number
  /** LPXT: khoản duyệt ≥ ngưỡng (không phải cọc) */
  lpxtCount?: number
  uniqueLeadsCalled?: number
  warmNew?: number
  hotNew?: number
  newToInterested?: number
  toDeposit?: number
  toEnrolled?: number
  updatedAt?: Timestamp
}

/** Payload JSON trong `makeCall` → `userData` (OMICall). */
export interface OmicallCallUserData {
  leadId: string
  target: OmicallCallTarget
  phone: string
  /** UID TVV khởi tạo cuộc gọi — giúp map KPI khi webhook thiếu sip_user/agent_id. */
  counselorUid?: string
}

/** Lưu Firestore — `scoringAux/omicallIntegration` */
export type OmicallIntegrationConfig = {
  schemaVersion: 1
  /** Bật nút gọi & đăng ký SDK */
  enabled: boolean
  /** CDN Web SDK, vd. 3.0.41 */
  sdkVersion: string
  /** Domain tổng đài (sipRealm) */
  sipRealm: string
  /** Số nội bộ dùng chung khi TVV chưa có số riêng */
  defaultSipUser?: string
  defaultSipPassword?: string
  /** Khóa API REST (tuỳ chọn — đồng bộ log server sau) */
  apiKey?: string
  /** Base URL OMICall REST API cho Cloud Functions (vd. https://public-v1.omicall.com). */
  apiBaseUrl?: string
  /** Mã bí mật kèm webhook URL để xác thực request từ OMICall. */
  webhookSecret?: string
  /** Ẩn bàn phím quay số mặc định của SDK */
  hideDialPad?: boolean
  /** Tự ghi `interactions` khi cuộc gọi kết thúc */
  autoLogCalls?: boolean
  /**
   * Định dạng quay số gửi OMICall: `intl84` = +84912345678,
   * `local` = 0912345678.
   */
  dialFormat?: 'intl84' | 'local'
  /** Đầu số gọi ra (hotline) — nếu extension có nhiều đầu số, điền số OMICall cấp. */
  defaultOutboundNumber?: string
  /**
   * `browser` — nghe qua micro trình duyệt (`makeCall`).
   * `deskPhone` — gọi qua API click-to-call (đổ chuông máy bàn / app điện thoại trước).
   */
  callMode?: 'browser' | 'deskPhone'
  /** Bật gọi qua REST `/api/click2call` (mặc định bật khi có API key trên server). */
  click2callEnabled?: boolean
  /** Phiên bản REST API lịch sử: v3 (khuyến nghị) hoặc v2. */
  historyApiVersion?: 'v3' | 'v2'
  /** Bật job đồng bộ lịch sử (Cloud Functions 15 phút). */
  historySyncEnabled?: boolean
  /** Số phút lùi khi quét API (max 4320 = 3 tháng theo OMICall). */
  historyLookbackMinutes?: number
  /** Số trang tối đa mỗi lần sync (50 cuộc/trang). */
  historyMaxPages?: number
  /** URL webhook đã đăng ký trên OMICall (tự cập nhật sau đăng ký). */
  webhookRegisteredUrl?: string
  /** ISO — lần đăng ký webhook gần nhất. */
  webhookRegisteredAt?: string
  /** ISO — lần đồng bộ số nội bộ toàn hệ thống gần nhất. */
  lastInternalPhonesSyncAt?: string
}

/** Lưu Firestore — `scoringAux/publicRegistrationConfig` */
export type PublicRegistrationConfig = {
  schemaVersion: 1
  /** Bật cổng `/dang-ky` và cho phép gửi form công khai. */
  enabled: boolean
  portalTitle: string
  introText: string
  /** Hiển thị sau khi đăng ký thành công (phương án A — không đăng nhập SV). */
  successMessage: string
  /** Gán vào `source1` khi sinh viên gửi form — dùng cho KPI OFF/MKT. */
  defaultSource1: string
  /** Tự gán TVV theo tải hồ sơ (counselor active). */
  autoAssignCounselor: boolean
  /** Gửi webhook n8n sau khi tạo hồ sơ (email SV + TVV do workflow n8n xử lý). */
  n8nEnabled: boolean
  n8nWebhookUrl: string
  /** URL cổng công khai (tuỳ chọn — đưa vào payload n8n). */
  portalPublicUrl?: string
  updatedAt?: string
  updatedBy?: string
}

export function defaultPublicRegistrationConfig(): PublicRegistrationConfig {
  return {
    schemaVersion: 1,
    enabled: false,
    portalTitle: 'Đăng ký tuyển sinh — Cao đẳng Việt Mỹ',
    introText:
      'Điền thông tin bên dưới. Sau khi gửi, bạn nhận mã hồ sơ — tư vấn viên sẽ liên hệ qua số điện thoại hoặc email đã khai báo.',
    successMessage:
      'Cảm ơn bạn đã đăng ký. Vui lòng ghi nhớ mã hồ sơ bên dưới — tư vấn viên sẽ liên hệ trong thời gian sớm nhất.',
    defaultSource1: 'Web đăng ký',
    autoAssignCounselor: true,
    n8nEnabled: true,
    n8nWebhookUrl: '',
    portalPublicUrl: '',
  }
}

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
  'ethnicity',
  'permanentAddress',
  'currentResidence',
  'assignedTo',
  'otherAttentionNotes',
  'educationLevel',
  'studyIntention',
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
