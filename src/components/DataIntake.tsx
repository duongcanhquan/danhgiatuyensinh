import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { Download, FileSpreadsheet, Upload } from 'lucide-react'
import {
  collection,
  doc,
  getDocs,
  query,
  Timestamp,
  where,
  writeBatch,
} from 'firebase/firestore'
import {
  buildLeadFirestorePayload,
  parseWorkbookToRows,
  resolveAssignedCounselorUid,
  type ExcelLeadRow,
  type ParseWorkbookDiag,
} from '../utils/excelLeadMapper'
import {
  downloadLeadIntakeTemplate,
  getLeadIntakeTemplate,
  LEAD_INTAKE_TEMPLATES,
  type LeadIntakeTemplateId,
} from '../utils/leadIntakeTemplates'
import { parseAppsScriptWorkbook } from '../utils/appsScriptWorkbookParse'
import {
  parseAppsScriptCreatedAtMs,
  mapAppsScriptToCounselorStatus,
  type AppsScriptStudentExtras,
} from '../utils/appsScriptStudentMapper'
import {
  loadRecentIntakePrograms,
  normalizeIntakeProgramLabel,
  rememberIntakeProgram,
} from '../utils/intakeProgramRecent'
import { evaluateLead, evaluationRecordFromLeadLike } from '../utils/scoring'
import { evaluateLeadWithClassification, classificationFirestorePatch } from '../utils/leadClassificationScore'
import { partialLeadFromExcelRow } from '../utils/scoringLeadInput'
import { resolveImportAssigneeUid } from '../utils/importAssignee'
import { pickPrimaryAdminUid } from '../utils/routing'
import {
  computeLeadUniqueHash,
  leadDedupeStrength,
  nationalIdHashFromInput,
  normalizePhoneKey,
  shouldQueryExistingByUniqueHash,
} from '../utils/leadIdentity'
import { FS_COLLECTIONS, type Lead, type PriorityTag, type VietMyUserProfile } from '../types'
import { isAdminLikeRole } from '../auth/roleUtils'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { leadBelongsToOrg, shouldUseLegacyMissingOrgIdRead } from '../tenancy/orgQuery'
import { pickProfileForImport, useScoringProfiles } from '../hooks/useScoringProfiles'
import { useSchoolTvvSignalDefinitions } from '../hooks/useSchoolTvvSignalDefinitions'
import { useMasterData } from '../hooks/useMasterData'
import { useCounselorDirectory } from '../hooks/useCounselorDirectory'
import { useAuth } from '../hooks/useAuth'
import { useOrg } from '../hooks/useOrg'
import { useInfoScoreRules } from '../contexts/InfoScoreRulesContext'
import { useLeadClassificationRules } from '../contexts/LeadClassificationRulesContext'
import { useLeadSources } from '../hooks/useLeadSources'
import { resolveWorkModeForLeadIntake } from '../utils/leadWorkMode'
/** Giới hạn Firestore mỗi batch commit. */
const BATCH_SIZE = 500
/** Mẫu lead gần đây để cân bằng tải TVV khi import (tránh phụ thuộc listener paginated). */
/** Firestore `in` tối đa 30 giá trị; chunk lớn hơn = ít round-trip hơn. */
const IN_QUERY_CHUNK = 30
/** Số truy vấn `in` chạy song song (Firestore cho tối đa 30 giá trị/`in`). */
const EXISTING_HASH_QUERY_CONCURRENCY = 24
/** Tính SHA theo lô — tránh khóa UI vài giây với file hàng nghìn dòng. */
const HASH_COMPUTE_CHUNK = 2500

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve())
    else setTimeout(resolve, 0)
  })
}

type PreparedRow = {
  index: number
  row: Partial<ExcelLeadRow>
  hash: string
  /** Hash CCCD — trống nếu không có / CHƯA CÓ */
  nationalIdHash: string
  existingId?: string
  inFileDuplicate: boolean
  /** phone | identity | weak — weak không so trùng DB / không gom trùng file theo mã trống */
  strength: 'phone' | 'identity' | 'weak'
  /** Chỉ mẫu Sheet Apps Script 71 cột */
  appsScriptExtras?: AppsScriptStudentExtras
}

type ImportPreview = {
  fileName: string
  prepared: PreparedRow[]
  uploadBatchId: string
  uploadedBy: string
  uploaderName: string
}

function activeStaffForExcelAssignMatch(users: VietMyUserProfile[]) {
  return users.filter(
    (u) =>
      u.isActive &&
      (u.role === 'counselor' || u.role === 'ctv' || u.role === 'team_lead' || isAdminLikeRole(u.role)),
  )
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function omitUndefined<T extends Record<string, unknown>>(o: T): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) {
    if (v !== undefined) out[k] = v
  }
  return out
}

async function fetchExistingIdsByHash(
  db: NonNullable<ReturnType<typeof getFirestoreDb>>,
  hashes: string[],
  orgId: string,
  onWaveDone?: (waveIndex: number, waveCount: number) => void,
  /** Chỉ Siêu quản trị: quét uniqueHash không lọc org (Rules isPlatform). Quản lý trường không được. */
  allowLegacyUnscoped = false,
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const uniq = [...new Set(hashes)].filter(Boolean)
  const parts = chunkArray(uniq, IN_QUERY_CHUNK)
  const waveCount = Math.max(1, Math.ceil(parts.length / EXISTING_HASH_QUERY_CONCURRENCY))
  let waveIndex = 0
  for (let i = 0; i < parts.length; i += EXISTING_HASH_QUERY_CONCURRENCY) {
    const group = parts.slice(i, i + EXISTING_HASH_QUERY_CONCURRENCY)
    const snaps = await Promise.all(
      group.map((part) =>
        getDocs(
          query(
            collection(db, FS_COLLECTIONS.leads),
            where('orgId', '==', orgId),
            where('uniqueHash', 'in', part),
          ),
        ),
      ),
    )
    for (const snap of snaps) {
      snap.forEach((d) => {
        const h = d.data().uniqueHash
        if (h && !map.has(String(h))) map.set(String(h), d.id)
      })
    }
    if (allowLegacyUnscoped && shouldUseLegacyMissingOrgIdRead(orgId)) {
      const legacySnaps = await Promise.all(
        group.map((part) =>
          getDocs(query(collection(db, FS_COLLECTIONS.leads), where('uniqueHash', 'in', part))),
        ),
      )
      for (const snap of legacySnaps) {
        snap.forEach((d) => {
          const data = d.data() as { uniqueHash?: string; orgId?: string | null }
          if (!leadBelongsToOrg(data, orgId)) return
          const h = data.uniqueHash
          if (h && !map.has(String(h))) map.set(String(h), d.id)
        })
      }
    }
    waveIndex += 1
    onWaveDone?.(waveIndex, waveCount)
    if (waveIndex % 4 === 0) await yieldToMain()
  }
  return map
}

/** Chống trùng CCCD khi nhập Excel — parity Apps Script. */
async function fetchExistingIdsByNationalIdHash(
  db: NonNullable<ReturnType<typeof getFirestoreDb>>,
  hashes: string[],
  orgId: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const uniq = [...new Set(hashes)].filter(Boolean)
  const parts = chunkArray(uniq, IN_QUERY_CHUNK)
  for (const part of parts) {
    const snap = await getDocs(
      query(
        collection(db, FS_COLLECTIONS.leads),
        where('orgId', '==', orgId),
        where('nationalIdHash', 'in', part),
      ),
    )
    snap.forEach((d) => {
      const h = d.data().nationalIdHash
      if (h && !map.has(String(h))) map.set(String(h), d.id)
    })
  }
  return map
}

export function DataIntake() {
  const db = getFirestoreDb()
  const configured = isFirebaseConfigured()
  const { profile, can } = useAuth()
  const { effectiveOrgId, isPlatformSuperAdmin } = useOrg()
  const { profiles } = useScoringProfiles()
  const { items: schoolTvvSignalDefs } = useSchoolTvvSignalDefinitions()
  const { regionLabels, highSchoolLabels, majorLabels, byKind, academicPerformanceLabels, catalogs } = useMasterData()
  const { users: directoryUsers } = useCounselorDirectory()
  const { runtime: infoScoreRuntime } = useInfoScoreRules()
  const { runtime: classificationRuntime } = useLeadClassificationRules()
  const { items: leadSources } = useLeadSources()

  const matchStaffForImport = useMemo(
    () => activeStaffForExcelAssignMatch(directoryUsers),
    [directoryUsers],
  )

  const [dragOver, setDragOver] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [templateId, setTemplateId] = useState<LeadIntakeTemplateId>('standard_v1')
  const [intakeProgram, setIntakeProgram] = useState('')
  const [recentPrograms, setRecentPrograms] = useState<string[]>(() =>
    typeof localStorage !== 'undefined' ? loadRecentIntakePrograms() : [],
  )
  const fileInputRef = useRef<HTMLInputElement>(null)
  const statusRef = useRef<HTMLDivElement>(null)
  const selectedTemplate = useMemo(() => getLeadIntakeTemplate(templateId), [templateId])

  /** Banner / preview từng nằm dưới cột danh sách — kéo lên view khi có phản hồi. */
  useEffect(() => {
    if (!banner && !preview) return
    statusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [banner, preview])

  const masterBuckets = useMemo(
    () => ({
      regionLabels,
      highSchoolLabels,
      majorLabels,
      academicPerformanceLabels,
      regionEntries: byKind.regions,
      majorEntries: byKind.majors,
      catalogs,
      entriesByCatalogId: byKind,
    }),
    [regionLabels, highSchoolLabels, majorLabels, academicPerformanceLabels, byKind, catalogs],
  )

  const canIntake = can('data:intake')

  const previewStats = useMemo(() => {
    if (!preview) return null
    const { prepared } = preview
    const total = prepared.length
    /** Dòng sau bản đầu tiên cùng fingerprint trong file — không nhập. */
    const rejectedInFile = prepared.filter((p) => p.inFileDuplicate).length
    /** Đã tồn tại trên Firestore (cùng fingerprint) — không nhập, không ghi đè. */
    const rejectedOnDb = prepared.filter((p) => p.existingId && !p.inFileDuplicate).length
    const acceptedNew = prepared.filter((p) => !p.inFileDuplicate && !p.existingId).length
    const rejectedTotal = rejectedInFile + rejectedOnDb
    let assignMatched = 0
    let assignUnresolvedRaw = 0
    let assignEmptyRouted = 0
    let missingPhone = 0
    let withName = 0
    let withPhone = 0
    let weakRows = 0
    const dbDupPhones: string[] = []
    for (const p of prepared) {
      const phoneKey = normalizePhoneKey(p.row.phone ?? '', p.row.parentPhone)
      if (!phoneKey) missingPhone += 1
      else withPhone += 1
      if ((p.row.fullName ?? '').trim()) withName += 1
      if (p.strength === 'weak') weakRows += 1
      if (p.inFileDuplicate || p.existingId) {
        if (p.existingId && !p.inFileDuplicate && phoneKey && dbDupPhones.length < 5) {
          dbDupPhones.push(phoneKey)
        }
        continue
      }
      const raw = (p.row.assignedToRaw ?? '').trim()
      const from = raw ? resolveAssignedCounselorUid(raw, matchStaffForImport) : null
      if (from) assignMatched += 1
      else if (raw) assignUnresolvedRaw += 1
      else assignEmptyRouted += 1
    }
    // Nghi ngờ map cột: hầu như chỉ còn họ tên, thiếu SĐT / trường / email (lỗi Mẫu 2 cũ).
    const mappingSuspect =
      total > 0 &&
      ((withPhone === 0 && withName >= Math.max(1, Math.floor(total * 0.5))) ||
        (withPhone === 0 && withName < Math.max(1, Math.floor(total * 0.2))))
    return {
      total,
      acceptedNew,
      rejectedInFile,
      rejectedOnDb,
      rejectedTotal,
      assignMatched,
      assignUnresolvedRaw,
      assignEmptyRouted,
      missingPhone,
      withPhone,
      withName,
      weakRows,
      dbDupPhones,
      mappingSuspect,
    }
  }, [preview, matchStaffForImport])

  const runParseAndPreview = useCallback(
    async (file: File) => {
      if (!canIntake) {
        setBanner('Bạn không có quyền nhập liệu (cần vai trò Quản trị).')
        return
      }
      if (!db) {
        setBanner('Chưa kết nối Firebase — không thể tải lên.')
        return
      }
      if (!profile) {
        setBanner('Chưa đăng nhập — không gắn được metadata upload.')
        return
      }
      if (!file.name.toLowerCase().endsWith('.xlsx')) {
        setBanner('Chỉ hỗ trợ định dạng .xlsx')
        return
      }
      setBusy(true)
      setBanner('Đang đọc file Excel…')
      setPreview(null)
      try {
        const buf = await file.arrayBuffer()
        await yieldToMain()
        const tpl = getLeadIntakeTemplate(templateId)
        let rows: Partial<ExcelLeadRow>[] = []
        let appsExtrasByIndex = new Map<number, AppsScriptStudentExtras>()

        if (tpl.positionalAppsScript) {
          const parsed = parseAppsScriptWorkbook(buf)
          if (!parsed.length) {
            setBanner(
              `Không tìm thấy dữ liệu Sheet Apps Script. File cần data từ dòng 3 (xuất DU_LIEU_SINH_VIEN), đủ cột Họ tên/SĐT/Mã SV.`,
            )
            setBusy(false)
            return
          }
          rows = parsed.map((p) => p.row)
          parsed.forEach((p, idx) => appsExtrasByIndex.set(idx, p.extras))
        } else {
          const parseDiagHolder: { diag: ParseWorkbookDiag | null } = { diag: null }
          rows = parseWorkbookToRows(buf, {
            headerRowIndex: tpl.headerRowIndex,
            fallbackOrderedHeaders: tpl.columns.map((c) => c.header),
            onDiag: (d) => {
              parseDiagHolder.diag = d
            },
          })
          if (!rows.length) {
            const diag = parseDiagHolder.diag
            const sheets =
              diag && diag.sheetNames.length > 0 ? `Sheet trong file: ${diag.sheetNames.join(', ')}.` : ''
            const hdrs =
              diag && diag.sampleHeaders && diag.sampleHeaders.length > 0
                ? ` Tiêu đề đọc được (hàng ${diag.pickedHeaderRow ?? 1}): ${diag.sampleHeaders.join(' | ')}.`
                : ' Không đọc được hàng tiêu đề.'
            setBanner(
              `Không tìm thấy dữ liệu (${tpl.label}). ${sheets}${hdrs} Cần sheet dữ liệu (không dùng «Hướng dẫn»), hàng tiêu đề khớp mẫu (Họ tên, điện thoại…), dữ liệu từ hàng dưới. Tải lại file mẫu trong app rồi copy dữ liệu vào sheet «${tpl.sheetName}».`,
            )
            setBusy(false)
            return
          }
        }

        const importProfile = pickProfileForImport(profiles)
        if (!importProfile) {
          setBanner('Chưa có bộ chấm điểm — tạo trong Cài đặt (tab Cài đặt Profile) trước khi nhập Excel.')
          setBusy(false)
          return
        }

        const uploadBatchId = crypto.randomUUID()
        const uploadedBy = profile.id
        const uploaderName = profile.displayName?.trim() || profile.email || uploadedBy

        setBanner(`Đang tính mã từng dòng (${rows.length.toLocaleString('vi-VN')} dòng)…`)

        const hashRows: {
          index: number
          row: Partial<ExcelLeadRow>
          hash: string
          nationalIdHash: string
          strength: PreparedRow['strength']
        }[] = []
        for (let i = 0; i < rows.length; i += HASH_COMPUTE_CHUNK) {
          const end = Math.min(i + HASH_COMPUTE_CHUNK, rows.length)
          for (let j = i; j < end; j++) {
            const row = rows[j]!
            const strength = leadDedupeStrength(row)
            // Salt theo dòng + batch — hàng yếu không còn dùng chung một mã trống.
            hashRows.push({
              index: j,
              row,
              strength,
              hash: computeLeadUniqueHash(row, `${uploadBatchId}:${j}`),
              nationalIdHash: nationalIdHashFromInput(row.nationalId) ?? '',
            })
          }
          if (end < rows.length) {
            setBanner(
              `Đang tính mã… ${end.toLocaleString('vi-VN')} / ${rows.length.toLocaleString('vi-VN')} dòng`,
            )
            await yieldToMain()
          }
        }

        const firstIndexByHash = new Map<string, number>()
        const firstIndexByNationalId = new Map<string, number>()
        const prepared: PreparedRow[] = hashRows.map(({ index, row, hash, strength, nationalIdHash }) => {
          // Chỉ gom trùng trong file khi có SĐT hoặc họ tên đủ rõ — tránh «trùng toàn bộ» vì cột không đọc được.
          let inFileDuplicate = false
          if (strength !== 'weak') {
            const first = firstIndexByHash.get(hash)
            inFileDuplicate = first !== undefined && first !== index
            if (first === undefined) firstIndexByHash.set(hash, index)
          }
          if (!inFileDuplicate && nationalIdHash) {
            const firstN = firstIndexByNationalId.get(nationalIdHash)
            inFileDuplicate = firstN !== undefined && firstN !== index
            if (firstN === undefined) firstIndexByNationalId.set(nationalIdHash, index)
          }
          return {
            index,
            row,
            hash,
            nationalIdHash,
            strength,
            inFileDuplicate,
            ...(appsExtrasByIndex.has(index) ? { appsScriptExtras: appsExtrasByIndex.get(index) } : {}),
          }
        })

        const hashesForQuery = prepared
          .filter((p) => !p.inFileDuplicate && shouldQueryExistingByUniqueHash(p.row))
          .map((p) => p.hash)
        const nationalHashesForQuery = prepared
          .filter((p) => !p.inFileDuplicate && p.nationalIdHash)
          .map((p) => p.nationalIdHash)
        const uniqQueryCount = new Set(hashesForQuery).size
        const uniqNationalCount = new Set(nationalHashesForQuery).size
        if (uniqQueryCount > 0 || uniqNationalCount > 0) {
          setBanner(
            `Đang kiểm tra trùng trên hệ thống (${uniqQueryCount.toLocaleString('vi-VN')} SĐT` +
              (uniqNationalCount ? `, ${uniqNationalCount.toLocaleString('vi-VN')} CCCD` : '') +
              `)…`,
          )
        }

        const existingByHash =
          uniqQueryCount > 0
            ? await fetchExistingIdsByHash(
                db,
                hashesForQuery,
                effectiveOrgId,
                (wave, waves) => {
                  setBanner(`Đang kiểm tra trùng SĐT: nhóm ${wave}/${waves}…`)
                },
                isPlatformSuperAdmin,
              )
            : new Map<string, string>()
        const existingByNational =
          uniqNationalCount > 0
            ? await fetchExistingIdsByNationalIdHash(db, nationalHashesForQuery, effectiveOrgId)
            : new Map<string, string>()
        for (const p of prepared) {
          if (p.inFileDuplicate) continue
          if (shouldQueryExistingByUniqueHash(p.row)) {
            const id = existingByHash.get(p.hash)
            if (id) p.existingId = id
          }
          if (!p.existingId && p.nationalIdHash) {
            const id = existingByNational.get(p.nationalIdHash)
            if (id) p.existingId = id
          }
        }

        const withPhone = prepared.filter(
          (p) => normalizePhoneKey(p.row.phone ?? '', p.row.parentPhone).length >= 9,
        ).length
        const withName = prepared.filter((p) => (p.row.fullName ?? '').trim().length >= 2).length
        setPreview({ fileName: file.name, prepared, uploadBatchId, uploadedBy, uploaderName })
        if (withPhone === 0 && withName < Math.max(1, Math.floor(prepared.length * 0.2))) {
          setBanner(
            `Đã đọc ${prepared.length} dòng nhưng hầu như không thấy SĐT / họ tên — kiểm tra đúng mẫu Excel (hàng 1 đúng tên cột) và sheet có dữ liệu. Hệ thống sẽ không báo trùng giả vì mã trống.`,
          )
        } else {
          setBanner(
            `Đã nhận «${file.name}» — ${prepared.length.toLocaleString('vi-VN')} dòng. Xem bảng xác nhận bên dưới rồi bấm «Xác nhận nhập».`,
          )
        }
      } catch (e) {
        console.error(e)
        setBanner('Lỗi khi đọc file hoặc truy vấn Firestore. Kiểm tra quyền đọc collection `leads`.')
      } finally {
        setBusy(false)
      }
    },
    [db, profiles, canIntake, profile, effectiveOrgId, templateId],
  )

  const cancelPreview = () => {
    setPreview(null)
    setBanner(null)
  }

  const commitImport = useCallback(async () => {
    if (!preview || !db || !profile) return
    const programLabel = normalizeIntakeProgramLabel(intakeProgram)
    if (!programLabel) {
      setBanner('Nhập tên chương trình / đợt trước khi xác nhận nhập (vd. «Đợt 9/2026 — OFF»).')
      return
    }
    const importProfile = pickProfileForImport(profiles)
    if (!importProfile) {
      setBanner('Chưa có Scoring Profile.')
      return
    }
    setBusy(true)
    setBanner('Đang ghi dữ liệu…')
    try {
      const { prepared, uploadBatchId, uploadedBy, uploaderName } = preview
      const ownership = {
        uploadedBy,
        uploaderName,
        uploadBatchId,
        intakeProgram: programLabel,
      }
      const adminPoolUid = pickPrimaryAdminUid(directoryUsers) ?? (isAdminLikeRole(profile.role) ? profile.id : null)

      const toCreate: { ref: ReturnType<typeof doc>; data: Record<string, unknown> }[] = []
      let rejectedInFile = 0
      let rejectedOnDb = 0
      let importAssignUnresolved = 0

      for (const pr of prepared) {
        if (pr.inFileDuplicate) {
          rejectedInFile += 1
          continue
        }
        if (pr.existingId) {
          rejectedOnDb += 1
          continue
        }

        const rawAssign = (pr.row.assignedToRaw ?? '').trim()
        const fromExcel = rawAssign
          ? resolveAssignedCounselorUid(rawAssign, matchStaffForImport)
          : null

        if (rawAssign && !fromExcel) importAssignUnresolved += 1
        const counselorId = resolveImportAssigneeUid({
          rawAssign,
          matchedCounselorUid: fromExcel,
          adminPoolUid,
        })

        const record = evaluationRecordFromLeadLike(partialLeadFromExcelRow(pr.row))
        const now = Timestamp.now()
        const extras = pr.appsScriptExtras
        const counselorStatus = extras
          ? mapAppsScriptToCounselorStatus(
              pr.row.statusRaw ?? '',
              extras.finance.enrollmentStatus ?? '',
            )
          : undefined

        const base = buildLeadFirestorePayload(pr.row, 0, 'COLD', counselorId, ownership, {
          uniqueHash: pr.hash,
          ...(pr.nationalIdHash ? { nationalIdHash: pr.nationalIdHash } : {}),
          ...(counselorStatus ? { counselorStatus } : {}),
        })

        const cls = classificationRuntime.enabled ? classificationRuntime : null
        let calculatedScore: number
        let priorityTag: PriorityTag
        let pillarPatch: Partial<Lead> = {}
        if (cls) {
          const provisionalLead = {
            id: '',
            ...base,
            createdAt: now,
            updatedAt: now,
            uploadedAt: now,
          } as Lead
          const r = evaluateLeadWithClassification(
            provisionalLead,
            importProfile,
            cls,
            masterBuckets,
            schoolTvvSignalDefs,
            { infoScoreRuntime },
          )
          calculatedScore = r.calculatedScore
          priorityTag = r.priorityTag
          pillarPatch = classificationFirestorePatch(r)
        } else {
          const ev = evaluateLead(record, importProfile, masterBuckets, schoolTvvSignalDefs, {
            infoScoreRuntime,
            includeAuxScores: true,
          })
          calculatedScore = ev.calculatedScore
          priorityTag = ev.priorityTag
        }

        const ref = doc(collection(db, FS_COLLECTIONS.leads))
        const source1 = (pr.row.source ?? '').trim()
        const workMode = resolveWorkModeForLeadIntake({
          source1,
          sources: leadSources,
        })
        const createdMs = extras ? parseAppsScriptCreatedAtMs(extras.createdAtRaw) : null
        const createdAt =
          createdMs != null ? Timestamp.fromMillis(createdMs) : now
        toCreate.push({
          ref,
          data: omitUndefined({
            ...base,
            orgId: effectiveOrgId,
            calculatedScore,
            priorityTag,
            ...pillarPatch,
            ...(workMode ? { workMode } : {}),
            ...(extras?.systemCode ? { systemCode: extras.systemCode } : {}),
            ...(extras?.finance ? { finance: extras.finance } : {}),
            ...(extras?.inviteFolderUrl ? { inviteFolderUrl: extras.inviteFolderUrl } : {}),
            ...(extras?.source2 ? { source2: extras.source2 } : {}),
            ...(source1 ? { source1 } : {}),
            ...(extras?.placeOfBirth ? { placeOfBirth: extras.placeOfBirth } : {}),
            ...(extras?.ethnicity ? { ethnicity: extras.ethnicity } : {}),
            ...(extras?.permanentAddress ? { permanentAddress: extras.permanentAddress } : {}),
            ...(extras?.currentResidence ? { currentResidence: extras.currentResidence } : {}),
            ...(extras?.fatherName ? { fatherName: extras.fatherName } : {}),
            ...(extras?.fatherPhone ? { fatherPhone: extras.fatherPhone } : {}),
            ...(extras?.motherName ? { motherName: extras.motherName } : {}),
            ...(extras?.motherPhone ? { motherPhone: extras.motherPhone } : {}),
            ...(extras?.guardian ? { guardian: extras.guardian } : {}),
            ...(extras?.nationalIdNotAvailable ? { nationalIdNotAvailable: true } : {}),
            uploadedAt: createdAt,
            importedAt: now,
            createdAt,
            updatedAt: now,
            lastTouchedAt: now,
          } as Record<string, unknown>) as Record<string, unknown>,
        })
      }

      for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
        const batch = writeBatch(db)
        for (const item of toCreate.slice(i, i + BATCH_SIZE)) {
          batch.set(item.ref, omitUndefined(item.data as Record<string, unknown>))
        }
        await batch.commit()
      }

      const msg =
        toCreate.length > 0
          ? `Đã nhập ${toCreate.length} hồ sơ mới · chương trình «${programLabel}» (lô ${uploadBatchId.slice(0, 8)}…). Từ chối: ${rejectedInFile} trùng trong file, ${rejectedOnDb} đã có trên hệ thống.${
              importAssignUnresolved > 0
                ? ` Trong đó ${importAssignUnresolved} dòng có «Tư vấn viên» không khớp danh bạ — đã gán Admin chờ điều phối.`
                : ' Hồ sơ chưa ghi TVV trên Excel → gán Admin chờ điều phối (không tự chia tải).'
            }`
          : `Không nhập dòng nào — toàn bộ ${rejectedInFile + rejectedOnDb} dòng bị lọc (${rejectedInFile} trùng trong file, ${rejectedOnDb} đã có trên hệ thống).`
      setBanner(msg)
      setRecentPrograms(rememberIntakeProgram(programLabel))
      setPreview(null)
    } catch (e) {
      console.error(e)
      setBanner('Lỗi khi ghi Firestore. Kiểm tra quyền ghi hoặc giới hạn batch.')
    } finally {
      setBusy(false)
    }
  }, [
    preview,
    db,
    profile,
    profiles,
    masterBuckets,
    directoryUsers,
    matchStaffForImport,
    schoolTvvSignalDefs,
    infoScoreRuntime,
    classificationRuntime,
    effectiveOrgId,
    intakeProgram,
    leadSources,
  ])

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    if (!db || busy || !canIntake) {
      if (!canIntake) setBanner('Bạn không có quyền nhập liệu (cần vai trò Quản trị).')
      else if (!db) setBanner('Chưa kết nối Firebase — không thể tải lên.')
      else if (busy) setBanner('Đang xử lý file trước — đợi xong rồi thử lại.')
      return
    }
    const f = e.dataTransfer.files?.[0]
    if (!f) {
      setBanner('Không nhận được file — hãy thả file .xlsx vào khung hoặc bấm «Tải lên».')
      return
    }
    void runParseAndPreview(f)
  }

  const onDownloadTemplate = () => {
    try {
      downloadLeadIntakeTemplate(templateId)
      const tpl = getLeadIntakeTemplate(templateId)
      setBanner(
        tpl.positionalAppsScript
          ? `Đã tải ${tpl.downloadFileName} — xuất DU_LIEU_SINH_VIEN giữ thứ tự ${tpl.columns.length} cột, data từ dòng 3; hoặc dùng sheet tiêu đề trong file mẫu.`
          : `Đã tải ${tpl.downloadFileName} — điền sheet «${tpl.sheetName}» (hàng 1 tiêu đề, dữ liệu từ hàng 2) rồi tải lên lại.`,
      )
    } catch (e) {
      console.error(e)
      setBanner('Không tạo được file mẫu.')
    }
  }

  const onPickFile = () => {
    if (!canIntake) {
      setBanner('Bạn không có quyền nhập liệu (cần vai trò Quản trị).')
      return
    }
    if (!db) {
      setBanner('Chưa kết nối Firebase — không thể tải lên.')
      return
    }
    if (busy) {
      setBanner('Đang xử lý file trước — đợi xong rồi thử lại.')
      return
    }
    const input = fileInputRef.current
    if (!input) {
      setBanner('Không mở được hộp chọn file — tải lại trang rồi thử.')
      return
    }
    input.click()
  }

  const onFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) void runParseAndPreview(f)
    else setBanner('Chưa chọn được file — thử lại hoặc kéo thả .xlsx vào khung.')
    e.target.value = ''
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-3 py-6 sm:px-4 md:py-8 lg:px-6">
      <div className="w-full space-y-5">
        <header className="text-left">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Nhập liệu</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Chọn mẫu Excel → xem cột bên phải → đặt tên đợt → tải file. Mỗi lần nhập gắn một chương trình / đợt để
            sau lọc riêng trên màn Hồ sơ.
          </p>
        </header>

        {!canIntake ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-950 shadow-sm">
            Cần quyền nhập liệu (thường là Admin). Liên hệ quản lý nếu không thấy nút tải lên.
          </div>
        ) : null}

        {!configured || !db ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-950 shadow-sm">
            Cấu hình Firebase trong .env trước khi nhập.
          </div>
        ) : null}

        <div ref={statusRef} className="space-y-3">
          {banner ? (
            <div
              role="status"
              aria-live="polite"
              className="rounded-xl border border-emerald-300/80 bg-emerald-50 px-3 py-2.5 text-left text-sm font-medium text-emerald-950 shadow-sm"
            >
              {banner}
            </div>
          ) : null}
          {busy && !preview ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-950 shadow-sm">
              Đang xử lý file… không đóng tab.
            </div>
          ) : null}

          {preview && previewStats ? (
          <div className="app-surface-elevated space-y-4 border border-emerald-200/80 p-5 text-left shadow-md md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Đã nhận file — xác nhận nhập</p>
                <h2 className="mt-0.5 truncate text-lg font-semibold tracking-tight text-slate-900 md:text-xl">
                  {preview.fileName}
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  <span className="font-semibold text-slate-900">{previewStats.total}</span> dòng —{' '}
                  <span className="font-medium text-emerald-700">{previewStats.acceptedNew} nhập mới</span>
                  {previewStats.rejectedTotal > 0 ? (
                    <>
                      {' '}
                      · <span className="font-medium text-rose-800">{previewStats.rejectedTotal} từ chối</span> (
                      {previewStats.rejectedInFile} trùng file, {previewStats.rejectedOnDb} đã có DB)
                    </>
                  ) : null}
                </p>
                {previewStats.rejectedInFile > 0 ? (
                  <p className="mt-1 text-xs text-slate-500">
                    Trùng trong file: cùng số điện thoại (hoặc cùng họ tên khi thiếu SĐT) — chỉ giữ dòng đầu.
                  </p>
                ) : null}
                {previewStats.rejectedOnDb > 0 ? (
                  <p className="mt-1 text-xs leading-relaxed text-rose-800">
                    Trùng trên hệ thống theo <strong>số điện thoại</strong> (sinh viên hoặc người liên hệ) đã có hồ sơ
                    trước đó — không phải trùng tên file.
                    {previewStats.dbDupPhones.length > 0 ? (
                      <>
                        {' '}
                        Ví dụ SĐT đã có: {previewStats.dbDupPhones.join(', ')}
                        {previewStats.rejectedOnDb > previewStats.dbDupPhones.length ? '…' : ''}
                      </>
                    ) : null}
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-slate-600">
                  Đã đọc được: <strong>{previewStats.withName}</strong> dòng có họ tên ·{' '}
                  <strong>{previewStats.withPhone}</strong> dòng có SĐT
                  {previewStats.weakRows > 0 ? (
                    <> · {previewStats.weakRows} dòng thiếu cả hai (không dùng để báo trùng DB)</>
                  ) : null}
                  .
                </p>
                {previewStats.mappingSuspect ? (
                  <p className="mt-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs leading-relaxed text-amber-950">
                    Cột Excel có thể <strong>không khớp mẫu</strong> (sai tên hàng 1 hoặc sai sheet). Hãy «Tải mẫu đang
                    chọn», copy dữ liệu vào đúng cột, rồi tải lại — tránh báo trùng oan.
                  </p>
                ) : null}
                {previewStats.missingPhone > 0 && !previewStats.mappingSuspect ? (
                  <p className="mt-1 text-xs text-amber-800">
                    {previewStats.missingPhone} dòng thiếu SĐT — trùng theo họ tên nếu trùng tên. Kiểm tra cột «Điện
                    thoại» / «ĐT Người liên hệ».
                  </p>
                ) : null}
                {previewStats.acceptedNew > 0 ? (
                  <p className="mt-2 text-xs leading-relaxed text-slate-600">
                    <span className="font-semibold text-slate-800">Phân công:</span> {previewStats.assignMatched} khớp
                    cột «Tư vấn viên»; {previewStats.assignUnresolvedRaw} không khớp → Admin;{' '}
                    {previewStats.assignEmptyRouted} để trống → gán Admin (chờ điều phối), không tự chia TVV.
                  </p>
                ) : null}
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-950">
                  <span className="font-semibold">Đợt sẽ gắn:</span>{' '}
                  {normalizeIntakeProgramLabel(intakeProgram) || (
                    <span className="text-rose-700">chưa nhập — điền ô «Chương trình / đợt» bên dưới trước khi xác nhận</span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={cancelPreview}
                className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Hủy
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-2 py-2.5 text-center">
                <p className="text-lg font-bold text-emerald-800">{previewStats.acceptedNew}</p>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Mới</p>
              </div>
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-2 py-2.5 text-center">
                <p className="text-lg font-bold text-rose-800">{previewStats.rejectedOnDb}</p>
                <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">Trùng DB</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2.5 text-center">
                <p className="text-lg font-bold text-slate-800">{previewStats.rejectedInFile}</p>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Trùng file</p>
              </div>
            </div>

            <div className="rounded-xl border border-amber-200/90 bg-amber-50/90 px-3 py-2.5 text-xs leading-relaxed text-amber-950">
              Chỉ ghi dòng mới, không ghi đè. Mỗi hồ sơ mới mang tên đợt ở dưới — sau này lọc trên màn Hồ sơ.
              «Người phụ trách»: khớp → gán đúng; không khớp → Admin — điều chuyển sau tại «Hồ sơ».
            </div>

            <div className="flex flex-col items-center gap-1.5 pt-1">
              <button
                type="button"
                disabled={
                  busy || previewStats.acceptedNew === 0 || !normalizeIntakeProgramLabel(intakeProgram)
                }
                onClick={() => void commitImport()}
                title={
                  previewStats.acceptedNew === 0
                    ? 'Không có dòng mới để nhập'
                    : !normalizeIntakeProgramLabel(intakeProgram)
                      ? 'Nhập tên chương trình / đợt trước'
                      : undefined
                }
                className="inline-flex min-h-11 w-full max-w-xs items-center justify-center gap-2 rounded-xl border border-amber-500 bg-gradient-to-r from-amber-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:brightness-105 disabled:opacity-40 sm:w-auto"
              >
                <Upload className="h-4 w-4 shrink-0" aria-hidden />
                Xác nhận nhập ({previewStats.acceptedNew})
              </button>
              {previewStats.acceptedNew === 0 ? (
                <p className="text-center text-xs text-slate-600">Không có dòng mới để nhập.</p>
              ) : !normalizeIntakeProgramLabel(intakeProgram) ? (
                <p className="text-center text-xs font-medium text-rose-700">
                  Điền «Chương trình / đợt» bên dưới rồi mới xác nhận được.
                </p>
              ) : null}
            </div>
          </div>
          ) : null}
        </div>

        <div className="grid gap-4 lg:grid-cols-12 lg:items-start lg:gap-5">
          {/* Trái — chọn mẫu + tải lên */}
          <div className="app-surface-elevated rounded-2xl p-4 sm:p-5 lg:col-span-5 lg:p-6">
            <fieldset className="mb-4 text-left">
              <legend className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                Chọn mẫu Excel
              </legend>
              <div className="mt-2 space-y-2">
                {LEAD_INTAKE_TEMPLATES.map((tpl) => {
                  const active = templateId === tpl.id
                  return (
                    <label
                      key={tpl.id}
                      className={`flex cursor-pointer gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                        active
                          ? 'border-amber-400 bg-amber-50/90 ring-1 ring-amber-300/70'
                          : 'border-slate-200 bg-white hover:border-amber-300/80'
                      }`}
                    >
                      <input
                        type="radio"
                        name="intake-template"
                        className="mt-1 accent-amber-600"
                        checked={active}
                        disabled={busy}
                        onChange={() => {
                          setTemplateId(tpl.id)
                          setPreview(null)
                          setBanner(null)
                        }}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-900">{tpl.label}</span>
                        <span className="mt-0.5 block text-xs leading-snug text-slate-600">
                          {tpl.description}
                        </span>
                        <span className="mt-1 block text-[11px] font-medium text-slate-500">
                          {tpl.positionalAppsScript
                            ? `${tpl.columns.length} cột (index 0–${tpl.columns.length - 1}) · data từ dòng 3`
                            : `${tpl.columns.length} cột · sheet «${tpl.sheetName}»`}
                        </span>
                      </span>
                    </label>
                  )
                })}
              </div>
              {selectedTemplate.positionalAppsScript ? (
                <p className="mt-3 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs leading-relaxed text-violet-950">
                  <strong>Trước khi nhập:</strong> Cài đặt → Dữ liệu → <strong>Nhập tư vấn viên</strong> (cột{' '}
                  <strong>Tên hiển thị</strong> = tên TVV trên Sheet, cột index 18). Rồi xuất{' '}
                  <code className="rounded bg-white px-1">DU_LIEU_SINH_VIEN</code> .xlsx — không đổi thứ tự cột.
                </p>
              ) : null}
            </fieldset>

            <label className="mb-4 block text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
              Chương trình / đợt nhập <span className="text-rose-600">*</span>
              <input
                list="intake-program-suggestions"
                value={intakeProgram}
                onChange={(e) => setIntakeProgram(e.target.value)}
                disabled={busy || !canIntake}
                placeholder="Vd. Đợt 9/2026 — Offline Hà Nội"
                className="mt-1 w-full rounded-lg border border-amber-300/90 bg-white px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 disabled:opacity-50"
              />
              <datalist id="intake-program-suggestions">
                {recentPrograms.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
              <span className="mt-1.5 block text-[11px] font-normal normal-case leading-snug tracking-normal text-slate-500">
                Điền trước khi chọn file. Tên này gắn vào mọi hồ sơ nhập lần này.
              </span>
            </label>

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="fixed left-0 top-0 h-px w-px opacity-0"
              tabIndex={-1}
              disabled={!db || busy || !canIntake}
              onChange={onFileInputChange}
            />

            <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                onClick={onDownloadTemplate}
                disabled={!canIntake}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-amber-400 bg-gradient-to-r from-amber-50 to-stone-50 px-4 py-2.5 text-sm font-semibold text-amber-900 shadow-sm transition hover:border-amber-500 hover:shadow disabled:opacity-40"
              >
                <Download className="h-4 w-4 shrink-0" aria-hidden />
                Tải mẫu đang chọn
              </button>
              <button
                type="button"
                onClick={onPickFile}
                disabled={!db || busy || !canIntake}
                aria-label="Chọn file Excel .xlsx để tải lên"
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-emerald-500 bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-40"
              >
                <Upload className="h-4 w-4 shrink-0" aria-hidden />
                {busy ? 'Đang xử lý…' : 'Tải lên file .xlsx'}
              </button>
            </div>

            <div
              role="button"
              tabIndex={canIntake && !busy ? 0 : -1}
              onClick={() => {
                if (!busy) onPickFile()
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  if (!busy) onPickFile()
                }
              }}
              onDragOver={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (canIntake && !busy) setDragOver(true)
              }}
              onDragLeave={(e) => {
                e.preventDefault()
                setDragOver(false)
              }}
              onDrop={onDrop}
              className={[
                'mt-4 flex min-h-[140px] flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 text-center transition',
                canIntake && !busy ? 'cursor-pointer' : 'cursor-not-allowed',
                dragOver
                  ? 'border-emerald-400 bg-emerald-50/90'
                  : 'border-slate-200 bg-slate-50/50 hover:border-amber-300/80 hover:bg-amber-50/40',
                !canIntake ? 'opacity-50' : '',
              ].join(' ')}
            >
              <FileSpreadsheet className="mb-2 h-8 w-8 text-amber-600" strokeWidth={1.25} aria-hidden />
              <p className="text-sm font-medium text-slate-800">
                {busy ? 'Đang xử lý file…' : 'Bấm hoặc kéo thả file .xlsx vào đây'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {selectedTemplate.positionalAppsScript ? (
                  <>
                    Đang dùng: <strong>{selectedTemplate.label}</strong>. Đọc theo <strong>vị trí cột</strong>, dữ liệu từ{' '}
                    <strong>dòng 3</strong>. Trùng → không nhập.
                  </>
                ) : (
                  <>
                    Đang dùng: <strong>{selectedTemplate.label}</strong>. Hàng 1 tiêu đề, dữ liệu từ hàng 2. Trùng →
                    không nhập.
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Phải — danh sách cột mẫu đang chọn */}
          <aside className="app-surface-elevated flex min-h-0 flex-col rounded-2xl p-4 sm:p-5 lg:col-span-7 lg:sticky lg:top-3 lg:max-h-[min(80vh,52rem)] lg:p-6">
            <div className="shrink-0 border-b border-slate-100 pb-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                Cột Excel của mẫu đang chọn
              </p>
              <h2 className="mt-0.5 text-base font-semibold tracking-tight text-slate-900">
                {selectedTemplate.label}
              </h2>
              <p className="mt-1 text-xs leading-snug text-slate-600">
                {selectedTemplate.positionalAppsScript ? (
                  <>
                    Đủ {selectedTemplate.columns.length} cột Sheet cũ (index 0–{selectedTemplate.columns.length - 1}).
                    Import theo <strong>thứ tự cột</strong>, không theo tên header. Sheet «{selectedTemplate.sheetName}»
                    · data từ dòng 3.
                  </>
                ) : (
                  <>
                    Giữ đúng tên cột hàng 1 như danh sách dưới (thứ tự cột trên file có thể khác). Sheet «
                    {selectedTemplate.sheetName}» · {selectedTemplate.columns.length} trường.
                  </>
                )}
              </p>
            </div>
            <ol className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pr-1 text-left sm:columns-2 sm:gap-x-3 lg:columns-1 xl:columns-2">
              {selectedTemplate.columns.map((col, idx) => {
                const displayIdx =
                  col.appsScriptIndex != null ? col.appsScriptIndex : idx + 1
                const rowKey =
                  col.key ??
                  (col.appsScriptIndex != null
                    ? `appscript-${col.appsScriptIndex}`
                    : `${selectedTemplate.id}-${idx}`)
                return (
                  <li key={rowKey} className="mb-1.5 break-inside-avoid">
                    <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-2">
                      <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md bg-white px-1 text-[11px] font-bold tabular-nums text-amber-800 ring-1 ring-amber-200/80">
                        {displayIdx}
                      </span>
                      <span className="min-w-0 text-sm font-semibold leading-snug text-slate-900">
                        {col.header}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ol>
            <p className="mt-3 shrink-0 text-[11px] leading-snug text-slate-500">
              {selectedTemplate.positionalAppsScript
                ? 'Bấm «Tải mẫu đang chọn» để lấy file hướng dẫn + đủ 71 tiêu đề cột + sheet «Danh sách cột».'
                : 'Bấm «Tải mẫu đang chọn» để lấy file trống đúng các cột này, điền rồi tải lên bên trái.'}
            </p>
          </aside>
        </div>
      </div>
    </div>
  )
}
