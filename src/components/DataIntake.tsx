import { useCallback, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { Download, FileSpreadsheet, Upload } from 'lucide-react'
import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
  where,
  writeBatch,
} from 'firebase/firestore'
import {
  buildLeadFirestorePayload,
  downloadStandardIntakeTemplate,
  parseWorkbookToRows,
  resolveAssignedCounselorUid,
  type ExcelLeadRow,
} from '../utils/excelLeadMapper'
import { evaluateLead } from '../utils/scoring'
import { countAssignments, pickCounselorByLowestLoad, pickPrimaryAdminUid } from '../utils/routing'
import { computeLeadUniqueHash } from '../utils/leadIdentity'
import { FS_COLLECTIONS, type VietMyUserProfile } from '../types'
import { isAdminLikeRole } from '../auth/roleUtils'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { pickProfileForImport, useScoringProfiles } from '../hooks/useScoringProfiles'
import { useMasterData } from '../hooks/useMasterData'
import { useCounselorDirectory } from '../hooks/useCounselorDirectory'
import { useAuth } from '../hooks/useAuth'
import { VietMyAccentHeading } from './VietMyAccentHeading'

/** Giới hạn Firestore mỗi batch commit. */
const BATCH_SIZE = 500
/** Mẫu lead gần đây để cân bằng tải TVV khi import (tránh phụ thuộc listener paginated). */
const ROUTING_ASSIGNMENT_SAMPLE = 500
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
  existingId?: string
  inFileDuplicate: boolean
}

type ImportPreview = {
  fileName: string
  prepared: PreparedRow[]
  uploadBatchId: string
  uploadedBy: string
  uploaderName: string
}

function activeStaffForExcelAssignMatch(users: VietMyUserProfile[]) {
  return users.filter((u) => u.isActive && (u.role === 'counselor' || isAdminLikeRole(u.role)))
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
  onWaveDone?: (waveIndex: number, waveCount: number) => void,
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
        getDocs(query(collection(db, FS_COLLECTIONS.leads), where('uniqueHash', 'in', part))),
      ),
    )
    for (const snap of snaps) {
      snap.forEach((d) => {
        const h = d.data().uniqueHash
        if (h && !map.has(String(h))) map.set(String(h), d.id)
      })
    }
    waveIndex += 1
    onWaveDone?.(waveIndex, waveCount)
    if (waveIndex % 4 === 0) await yieldToMain()
  }
  return map
}

async function fetchAssignmentCountsForImport(
  db: NonNullable<ReturnType<typeof getFirestoreDb>>,
): Promise<Map<string, number>> {
  const q = query(
    collection(db, FS_COLLECTIONS.leads),
    orderBy('updatedAt', 'desc'),
    limit(ROUTING_ASSIGNMENT_SAMPLE),
  )
  const snap = await getDocs(q)
  const minimal: { assignedCounselorId: string | null }[] = []
  snap.forEach((d) => {
    const data = d.data()
    const id =
      data.assignedTo === null || data.assignedTo === undefined || data.assignedTo === ''
        ? data.assignedCounselorId === null || data.assignedCounselorId === undefined
          ? null
          : String(data.assignedCounselorId)
        : String(data.assignedTo)
    minimal.push({ assignedCounselorId: id }) // legacy field name; mirror of assignedTo
  })
  return countAssignments(minimal)
}

export function DataIntake() {
  const db = getFirestoreDb()
  const configured = isFirebaseConfigured()
  const { profile, can } = useAuth()
  const { profiles } = useScoringProfiles()
  const { regionLabels, highSchoolLabels, majorLabels, byKind, academicPerformanceLabels, catalogs } = useMasterData()
  const { counselors, users: directoryUsers } = useCounselorDirectory()

  const matchStaffForImport = useMemo(
    () => activeStaffForExcelAssignMatch(directoryUsers),
    [directoryUsers],
  )

  const [dragOver, setDragOver] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    for (const p of prepared) {
      if (p.inFileDuplicate || p.existingId) continue
      const raw = (p.row.assignedToRaw ?? '').trim()
      const from = raw ? resolveAssignedCounselorUid(raw, matchStaffForImport) : null
      if (from) assignMatched += 1
      else if (raw) assignUnresolvedRaw += 1
      else assignEmptyRouted += 1
    }
    return {
      total,
      acceptedNew,
      rejectedInFile,
      rejectedOnDb,
      rejectedTotal,
      assignMatched,
      assignUnresolvedRaw,
      assignEmptyRouted,
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
        const rows = parseWorkbookToRows(buf)
        if (!rows.length) {
          setBanner('Không tìm thấy dữ liệu trong sheet «Hồ sơ» / «Leads» hoặc sheet đầu tiên.')
          setBusy(false)
          return
        }

        const importProfile = pickProfileForImport(profiles)
        if (!importProfile) {
          setBanner('Chưa có Scoring Profile — tạo trong Cài đặt (tab Chấm điểm) trước khi nhập Excel.')
          setBusy(false)
          return
        }

        const uploadBatchId = crypto.randomUUID()
        const uploadedBy = profile.id
        const uploaderName = profile.displayName?.trim() || profile.email || uploadedBy

        setBanner(`Đang tính mã từng dòng (${rows.length.toLocaleString('vi-VN')} dòng)…`)

        const hashRows: { index: number; row: Partial<ExcelLeadRow>; hash: string }[] = []
        for (let i = 0; i < rows.length; i += HASH_COMPUTE_CHUNK) {
          const end = Math.min(i + HASH_COMPUTE_CHUNK, rows.length)
          for (let j = i; j < end; j++) {
            const row = rows[j]
            hashRows.push({ index: j, row, hash: computeLeadUniqueHash(row) })
          }
          if (end < rows.length) {
            setBanner(
              `Đang tính mã… ${end.toLocaleString('vi-VN')} / ${rows.length.toLocaleString('vi-VN')} dòng`,
            )
            await yieldToMain()
          }
        }

        const firstIndexByHash = new Map<string, number>()
        const prepared: PreparedRow[] = hashRows.map(({ index, row, hash }) => {
          const first = firstIndexByHash.get(hash)
          const inFileDuplicate = first !== undefined && first !== index
          if (first === undefined) firstIndexByHash.set(hash, index)
          return { index, row, hash, inFileDuplicate }
        })

        const hashesForQuery = prepared.filter((p) => !p.inFileDuplicate).map((p) => p.hash)
        const uniqQueryCount = new Set(hashesForQuery).size
        const queryParts = Math.max(1, Math.ceil(uniqQueryCount / IN_QUERY_CHUNK))
        const waveTotal = Math.max(1, Math.ceil(queryParts / EXISTING_HASH_QUERY_CONCURRENCY))
        setBanner(
          `Đang kiểm tra trùng trên hệ thống (${uniqQueryCount.toLocaleString('vi-VN')} mã, ~${waveTotal} nhóm truy vấn)…`,
        )

        const existingByHash = await fetchExistingIdsByHash(db, hashesForQuery, (wave, waves) => {
          setBanner(
            `Đang kiểm tra trùng: nhóm ${wave}/${waves} (${uniqQueryCount.toLocaleString('vi-VN')} mã)…`,
          )
        })
        for (const p of prepared) {
          if (!p.inFileDuplicate) {
            const id = existingByHash.get(p.hash)
            if (id) p.existingId = id
          }
        }

        setPreview({ fileName: file.name, prepared, uploadBatchId, uploadedBy, uploaderName })
        setBanner(null)
      } catch (e) {
        console.error(e)
        setBanner('Lỗi khi đọc file hoặc truy vấn Firestore. Kiểm tra quyền đọc collection `leads`.')
      } finally {
        setBusy(false)
      }
    },
    [db, profiles, canIntake, profile],
  )

  const cancelPreview = () => {
    setPreview(null)
    setBanner(null)
  }

  const commitImport = useCallback(async () => {
    if (!preview || !db || !profile) return
    const importProfile = pickProfileForImport(profiles)
    if (!importProfile) {
      setBanner('Chưa có Scoring Profile.')
      return
    }
    setBusy(true)
    setBanner('Đang ghi dữ liệu…')
    try {
      const counts = await fetchAssignmentCountsForImport(db)
      const { prepared, uploadBatchId, uploadedBy, uploaderName } = preview
      const ownership = { uploadedBy, uploaderName, uploadBatchId }
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

        let counselorId: string | null = null
        if (fromExcel) {
          counselorId = fromExcel
        } else if (rawAssign) {
          importAssignUnresolved += 1
          counselorId = adminPoolUid ?? pickCounselorByLowestLoad(counselors, counts)
        } else {
          counselorId = pickCounselorByLowestLoad(counselors, counts)
        }

        if (counselorId) {
          counts.set(counselorId, (counts.get(counselorId) ?? 0) + 1)
        }

        const record = {
          customerId: pr.row.customerId,
          fullName: pr.row.fullName,
          phone: pr.row.phone,
          parentPhone: pr.row.parentPhone,
          source: pr.row.source,
          educationLevel: pr.row.educationLevel,
          ...(pr.row.majorInterest?.trim() ? { majorInterest: pr.row.majorInterest.trim() } : {}),
          ...(pr.row.academicPerformance?.trim()
            ? { academicPerformance: pr.row.academicPerformance.trim() }
            : {}),
          ...(pr.row.schoolType?.trim() ? { schoolType: pr.row.schoolType.trim() } : {}),
          ...(pr.row.studyIntention?.trim() ? { studyIntention: pr.row.studyIntention.trim() } : {}),
          province: pr.row.province,
          highSchool: pr.row.highSchool,
          gradeClass: pr.row.gradeClass,
          address: pr.row.address,
          description: pr.row.description,
        } as Record<string, unknown>
        const { calculatedScore, priorityTag } = evaluateLead(record, importProfile, masterBuckets)

        const base = buildLeadFirestorePayload(pr.row, calculatedScore, priorityTag, counselorId, ownership, {
          uniqueHash: pr.hash,
        })
        const now = Timestamp.now()

        const ref = doc(collection(db, FS_COLLECTIONS.leads))
        toCreate.push({
          ref,
          data: omitUndefined({
            ...base,
            uploadedAt: now,
            importedAt: now,
            createdAt: now,
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
          ? `Đã nhập ${toCreate.length} hồ sơ mới (lô ${uploadBatchId.slice(0, 8)}…). Từ chối: ${rejectedInFile} trùng trong file, ${rejectedOnDb} đã có trên hệ thống.${
              importAssignUnresolved > 0
                ? ` Trong đó ${importAssignUnresolved} dòng có «Người phụ trách» không khớp danh bạ — đã gán Admin chờ điều phối (hoặc TVV theo tải nếu chưa có Admin).`
                : ''
            }`
          : `Không nhập dòng nào — toàn bộ ${rejectedInFile + rejectedOnDb} dòng bị lọc (${rejectedInFile} trùng trong file, ${rejectedOnDb} đã có trên hệ thống).`
      setBanner(msg)
      setPreview(null)
    } catch (e) {
      console.error(e)
      setBanner('Lỗi khi ghi Firestore. Kiểm tra quyền ghi hoặc giới hạn batch.')
    } finally {
      setBusy(false)
    }
  }, [preview, db, profile, profiles, masterBuckets, counselors, directoryUsers, matchStaffForImport])

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) void runParseAndPreview(f)
  }

  const onDownloadTemplate = () => {
    try {
      downloadStandardIntakeTemplate()
      setBanner('Đã tải mẫu VietMy_Mau_nhap_ho_so.xlsx — điền sheet «Hồ sơ» rồi tải lên lại tại đây.')
    } catch (e) {
      console.error(e)
      setBanner('Không tạo được file mẫu.')
    }
  }

  const onPickFile = () => {
    if (!db || busy || !canIntake) return
    fileInputRef.current?.click()
  }

  const onFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) void runParseAndPreview(f)
    e.target.value = ''
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-8 md:py-12">
      <div className="mx-auto w-full space-y-5 text-center">
        <header>
          <VietMyAccentHeading as="h1" tone="onLight" size="lg" className="block text-center">
            Nhập liệu
          </VietMyAccentHeading>
        </header>

        {!canIntake ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-left text-sm text-amber-950 shadow-sm">
            Cần quyền <code className="rounded bg-amber-100 px-1 text-xs text-amber-900">data:intake</code> (thường là
            Admin).
          </div>
        ) : null}

        {!configured || !db ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-left text-sm text-amber-950 shadow-sm">
            Cấu hình Firebase trong .env trước khi nhập.
          </div>
        ) : null}

        <div className="app-card-glass rounded-2xl border border-slate-200/90 bg-white/95 p-5 shadow-lg shadow-slate-900/5 md:p-6">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            disabled={!db || busy || !canIntake}
            aria-hidden
            onChange={onFileInputChange}
          />

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center sm:gap-3">
            <button
              type="button"
              onClick={onDownloadTemplate}
              disabled={!canIntake}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-amber-400 bg-gradient-to-r from-amber-50 to-stone-50 px-4 py-2.5 text-sm font-semibold text-amber-900 shadow-sm transition hover:border-amber-500 hover:shadow disabled:opacity-40"
            >
              <Download className="h-4 w-4 shrink-0" aria-hidden />
              Tải mẫu Excel
            </button>
            <button
              type="button"
              onClick={onPickFile}
              disabled={!db || busy || !canIntake}
              aria-label="Chọn file Excel .xlsx để tải lên"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-500 bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-40"
            >
              <Upload className="h-4 w-4 shrink-0" aria-hidden />
              Tải lên file .xlsx
            </button>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={[
              'mt-4 flex min-h-[120px] cursor-default flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 text-center transition',
              dragOver
                ? 'border-emerald-400 bg-emerald-50/90'
                : 'border-slate-200 bg-slate-50/50 hover:border-amber-300/80 hover:bg-amber-50/40',
              !canIntake ? 'pointer-events-none opacity-50' : '',
            ].join(' ')}
          >
            <FileSpreadsheet className="mb-2 h-8 w-8 text-amber-600" strokeWidth={1.25} aria-hidden />
            <p className="text-sm font-medium text-slate-800">Hoặc kéo thả file vào đây</p>
            <p className="mt-1 max-w-xs text-xs text-slate-500">
              Sheet «Hồ sơ». Trùng trong file / đã có trên hệ thống → không nhập.
            </p>
            {busy && !preview ? (
              <p className="mt-2 text-xs font-medium text-emerald-700">Đang xử lý…</p>
            ) : null}
          </div>
        </div>

        {preview && previewStats ? (
          <div className="app-card-glass space-y-4 rounded-2xl border border-slate-200/90 bg-white/95 p-5 text-left shadow-md md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="app-page-kicker text-xs">Xác nhận nhập</p>
                <h2 className="font-display mt-0.5 truncate text-base font-semibold text-slate-900 md:text-lg">
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
                  <p className="mt-1 text-xs text-slate-500">Trùng file: giữ bản đầu tiên cùng fingerprint.</p>
                ) : null}
                {previewStats.acceptedNew > 0 ? (
                  <p className="mt-2 text-xs leading-relaxed text-slate-600">
                    <span className="font-semibold text-slate-800">Phân công:</span> {previewStats.assignMatched} khớp
                    cột «Người phụ trách»; {previewStats.assignUnresolvedRaw} không khớp → Admin (hoặc theo tải);{' '}
                    {previewStats.assignEmptyRouted} để trống → chia tải TVV.
                  </p>
                ) : null}
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
                <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Mới</p>
              </div>
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-2 py-2.5 text-center">
                <p className="text-lg font-bold text-rose-800">{previewStats.rejectedOnDb}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-700">Trùng DB</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2.5 text-center">
                <p className="text-lg font-bold text-slate-800">{previewStats.rejectedInFile}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">Trùng file</p>
              </div>
            </div>

            <div className="rounded-xl border border-amber-200/90 bg-amber-50/90 px-3 py-2.5 text-xs leading-relaxed text-amber-950">
              Chỉ ghi dòng mới, không ghi đè. «Người phụ trách»: khớp → gán đúng; không khớp → Admin / ghi chú — điều
              chuyển sau tại «Hồ sơ».
            </div>

            <div className="flex justify-center pt-1">
              <button
                type="button"
                disabled={busy || previewStats.acceptedNew === 0}
                onClick={() => void commitImport()}
                title={previewStats.acceptedNew === 0 ? 'Không có dòng mới để nhập' : undefined}
                className="inline-flex min-h-11 w-full max-w-xs items-center justify-center gap-2 rounded-xl border border-amber-500 bg-gradient-to-r from-amber-600 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:brightness-105 disabled:opacity-40 sm:w-auto"
              >
                <Upload className="h-4 w-4 shrink-0" aria-hidden />
                Xác nhận nhập ({previewStats.acceptedNew})
              </button>
            </div>
          </div>
        ) : null}

        {banner ? (
          <div className="rounded-xl border border-slate-200/90 bg-white/95 px-3 py-2.5 text-left text-sm text-slate-800 shadow-sm">
            {banner}
          </div>
        ) : null}
      </div>
    </div>
  )
}
