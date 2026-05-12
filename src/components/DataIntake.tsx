import { useCallback, useMemo, useState, type DragEvent } from 'react'
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
  type ExcelLeadRow,
} from '../utils/excelLeadMapper'
import { evaluateLead } from '../utils/scoring'
import { countAssignments, pickCounselorByLowestLoad } from '../utils/routing'
import { computeLeadUniqueHash } from '../utils/leadIdentity'
import { FS_COLLECTIONS } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { pickProfileForImport, useScoringProfiles } from '../hooks/useScoringProfiles'
import { useMasterData } from '../hooks/useMasterData'
import { useCounselorDirectory } from '../hooks/useCounselorDirectory'
import { useAuth } from '../hooks/useAuth'

/** Giới hạn Firestore mỗi batch commit. */
const BATCH_SIZE = 500
/** Mẫu lead gần đây để cân bằng tải TVV khi import (tránh phụ thuộc listener paginated). */
const ROUTING_ASSIGNMENT_SAMPLE = 500
const IN_QUERY_CHUNK = 25

type ImportStrategy = 'skip_dupes' | 'update_dupes'

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
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const uniq = [...new Set(hashes)].filter(Boolean)
  for (const part of chunkArray(uniq, IN_QUERY_CHUNK)) {
    const q = query(collection(db, FS_COLLECTIONS.leads), where('uniqueHash', 'in', part))
    const snap = await getDocs(q)
    snap.forEach((d) => {
      const h = d.data().uniqueHash
      if (h && !map.has(String(h))) map.set(String(h), d.id)
    })
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
      data.assignedCounselorId === null || data.assignedCounselorId === undefined
        ? null
        : String(data.assignedCounselorId)
    minimal.push({ assignedCounselorId: id })
  })
  return countAssignments(minimal)
}

export function DataIntake() {
  const db = getFirestoreDb()
  const configured = isFirebaseConfigured()
  const { profile, can } = useAuth()
  const { profiles } = useScoringProfiles()
  const { regionLabels, highSchoolLabels, majorLabels } = useMasterData()
  const { counselors } = useCounselorDirectory()

  const [dragOver, setDragOver] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [strategy, setStrategy] = useState<ImportStrategy>('skip_dupes')

  const masterBuckets = useMemo(
    () => ({ regionLabels, highSchoolLabels, majorLabels }),
    [regionLabels, highSchoolLabels, majorLabels],
  )

  const canIntake = can('data:intake')

  const previewStats = useMemo(() => {
    if (!preview) return null
    const { prepared } = preview
    const total = prepared.length
    const inFileDup = prepared.filter((p) => p.inFileDuplicate).length
    const withDbHit = prepared.filter((p) => p.existingId && !p.inFileDuplicate).length
    const fresh = prepared.filter((p) => !p.inFileDuplicate && !p.existingId).length
    const dupTotal = total - fresh
    return { total, fresh, dupTotal, inFileDup, withDbHit }
  }, [preview])

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
      setBanner('Đang đọc file và kiểm tra trùng lặp…')
      setPreview(null)
      try {
        const buf = await file.arrayBuffer()
        const rows = parseWorkbookToRows(buf)
        if (!rows.length) {
          setBanner('Không tìm thấy dữ liệu trong sheet đầu tiên.')
          setBusy(false)
          return
        }

        const importProfile = pickProfileForImport(profiles)
        if (!importProfile) {
          setBanner('Chưa có Scoring Profile — tạo trong Cấu hình dữ liệu trước khi nhập Excel.')
          setBusy(false)
          return
        }

        const uploadBatchId = crypto.randomUUID()
        const uploadedBy = profile.id
        const uploaderName = profile.displayName?.trim() || profile.email || uploadedBy

        const hashRows = await Promise.all(
          rows.map(async (row, index) => ({
            index,
            row,
            hash: await computeLeadUniqueHash(row),
          })),
        )

        const firstIndexByHash = new Map<string, number>()
        const prepared: PreparedRow[] = hashRows.map(({ index, row, hash }) => {
          const first = firstIndexByHash.get(hash)
          const inFileDuplicate = first !== undefined && first !== index
          if (first === undefined) firstIndexByHash.set(hash, index)
          return { index, row, hash, inFileDuplicate }
        })

        const hashesForQuery = prepared.filter((p) => !p.inFileDuplicate).map((p) => p.hash)
        const existingByHash = await fetchExistingIdsByHash(db, hashesForQuery)
        for (const p of prepared) {
          if (!p.inFileDuplicate) {
            const id = existingByHash.get(p.hash)
            if (id) p.existingId = id
          }
        }

        setPreview({ fileName: file.name, prepared, uploadBatchId, uploadedBy, uploaderName })
        setStrategy('skip_dupes')
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

      const toCreate: { ref: ReturnType<typeof doc>; data: Record<string, unknown> }[] = []
      const toUpdate: { id: string; patch: Record<string, unknown> }[] = []

      for (const pr of prepared) {
        if (pr.inFileDuplicate) continue

        const record = {
          ...pr.row,
          region: pr.row.region,
          majorInterest: pr.row.majorInterest,
          highSchoolName: pr.row.highSchoolName,
          academicLevel: pr.row.academicLevel,
        } as Record<string, unknown>
        const { calculatedScore, priorityTag } = evaluateLead(record, importProfile, masterBuckets)
        const counselorId = pickCounselorByLowestLoad(counselors, counts)
        if (counselorId) {
          counts.set(counselorId, (counts.get(counselorId) ?? 0) + 1)
        }

        const base = buildLeadFirestorePayload(pr.row, calculatedScore, priorityTag, counselorId, ownership, {
          uniqueHash: pr.hash,
        })
        const now = Timestamp.now()

        if (pr.existingId) {
          if (strategy !== 'update_dupes') continue
          const { status, nextFollowUpDate, pipelineStatus, ...mergeRest } = base
          void status
          void nextFollowUpDate
          void pipelineStatus
          toUpdate.push({
            id: pr.existingId,
            patch: omitUndefined({
              ...mergeRest,
              uniqueHash: pr.hash,
              updatedAt: now,
              lastTouchedAt: now,
            } as Record<string, unknown>),
          })
        } else {
          const ref = doc(collection(db, FS_COLLECTIONS.leads))
          toCreate.push({
            ref,
            data: omitUndefined({
              ...base,
              importedAt: now,
              createdAt: now,
              updatedAt: now,
              lastTouchedAt: now,
            } as Record<string, unknown>) as Record<string, unknown>,
          })
        }
      }

      for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
        const batch = writeBatch(db)
        for (const item of toCreate.slice(i, i + BATCH_SIZE)) {
          batch.set(item.ref, omitUndefined(item.data as Record<string, unknown>))
        }
        await batch.commit()
      }

      for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
        const batch = writeBatch(db)
        for (const u of toUpdate.slice(i, i + BATCH_SIZE)) {
          batch.update(doc(db, FS_COLLECTIONS.leads, u.id), u.patch)
        }
        await batch.commit()
      }

      const msg = `Hoàn tất: ${toCreate.length} hồ sơ mới, ${toUpdate.length} bản ghi cập nhật (mã lô ${uploadBatchId.slice(0, 8)}…).`
      setBanner(msg)
      setPreview(null)
    } catch (e) {
      console.error(e)
      setBanner('Lỗi khi ghi Firestore. Kiểm tra quyền ghi hoặc giới hạn batch.')
    } finally {
      setBusy(false)
    }
  }, [preview, db, profile, profiles, masterBuckets, counselors, strategy])

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

  return (
    <div className="w-full max-w-none space-y-8">
      <header>
        <h1 className="text-2xl font-semibold uppercase tracking-wide text-slate-900 md:text-3xl">
          Nhập liệu thông minh
        </h1>
        <p className="mt-1 text-base text-slate-600">
          Tải mẫu chuẩn → điền dữ liệu → kéo thả .xlsx. Hệ thống phát hiện trùng theo SĐT (hoặc Họ tên + Ngày
          sinh/Tuổi) trước khi ghi Firestore.
        </p>
      </header>

      {!canIntake ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-base text-amber-950 shadow-sm backdrop-blur-xl">
          Chỉ tài khoản có quyền <code className="rounded bg-amber-100 px-1 text-amber-900">data:intake</code> (thường là Admin) mới nhập được
          dữ liệu.
        </div>
      ) : null}

      {!configured || !db ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-base text-amber-950 shadow-sm backdrop-blur-xl">
          Cấu hình Firebase trong .env trước khi tải dữ liệu.
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onDownloadTemplate}
          disabled={!canIntake}
          className="inline-flex items-center gap-2 rounded-2xl border border-amber-400 bg-gradient-to-r from-amber-50/95 to-stone-50/90 px-5 py-3 text-base font-semibold text-amber-900 shadow-md backdrop-blur-xl transition hover:border-amber-500 hover:shadow-lg disabled:opacity-40"
        >
          <Download className="h-4 w-4" aria-hidden />
          Tải mẫu Excel chuẩn
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
          'app-card-glass relative flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed px-6 py-12 text-center transition-all duration-300',
          dragOver
            ? 'border-emerald-400 bg-emerald-50/90 shadow-lg shadow-emerald-500/15'
            : 'border-slate-300/90 hover:border-amber-300 hover:bg-amber-50/30',
          !canIntake ? 'pointer-events-none opacity-50' : '',
        ].join(' ')}
      >
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="absolute inset-0 cursor-pointer opacity-0"
          disabled={!db || busy || !canIntake}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void runParseAndPreview(f)
            e.target.value = ''
          }}
        />
        <FileSpreadsheet className="mb-3 h-10 w-10 text-amber-600" strokeWidth={1.25} />
        <p className="text-base font-semibold text-slate-900">Thả file .xlsx vào đây</p>
        <p className="mt-2 max-w-md text-sm text-slate-600">
          Dùng sheet «Hồ sơ» trong mẫu; gộp trùng theo SĐT học sinh / phụ huynh, hoặc fingerprint khi thiếu SĐT.
        </p>
        {busy && !preview ? <p className="mt-4 text-sm text-emerald-700">Đang xử lý — vui lòng chờ…</p> : null}
      </div>

      {preview && previewStats ? (
        <div className="app-card-glass space-y-5 p-6 shadow-lg md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Xác nhận nhập</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">{preview.fileName}</h2>
              <p className="mt-2 text-base text-slate-600">
                Tìm thấy <span className="font-semibold text-slate-900">{previewStats.total}</span> dòng.{' '}
                <span className="font-medium text-emerald-700">{previewStats.fresh} mới</span>
                {previewStats.dupTotal > 0 ? (
                  <>
                    . <span className="font-medium text-amber-800">{previewStats.dupTotal} trùng / đã tồn tại</span>
                  </>
                ) : null}
                .
              </p>
              {previewStats.inFileDup > 0 ? (
                <p className="mt-1 text-xs text-slate-500">
                  {previewStats.inFileDup} dòng trùng trong file — chỉ giữ bản đầu tiên cho mỗi fingerprint.
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={cancelPreview}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              Hủy
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center shadow-sm">
              <p className="text-2xl font-bold text-emerald-800">{previewStats.fresh}</p>
              <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-700">Lead mới</p>
            </div>
            <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-center shadow-sm">
              <p className="text-2xl font-bold text-violet-800">{previewStats.withDbHit}</p>
              <p className="text-[11px] font-medium uppercase tracking-wide text-violet-700">Đã có trên DB</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center shadow-sm">
              <p className="text-2xl font-bold text-slate-800">{previewStats.inFileDup}</p>
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-600">Trùng trong file</p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/90 bg-white/80 p-4 shadow-inner">
            <p className="text-sm font-medium text-slate-600">Trùng với dữ liệu hiện có</p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-base text-slate-800 shadow-sm transition hover:border-amber-300">
                <input
                  type="radio"
                  name="dedupe-strat"
                  checked={strategy === 'skip_dupes'}
                  onChange={() => setStrategy('skip_dupes')}
                  className="accent-amber-400"
                />
                Bỏ qua bản trùng (chỉ tạo hồ sơ mới)
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-base text-slate-800 shadow-sm transition hover:border-violet-300">
                <input
                  type="radio"
                  name="dedupe-strat"
                  checked={strategy === 'update_dupes'}
                  onChange={() => setStrategy('update_dupes')}
                  className="accent-violet-400"
                />
                Cập nhật bản ghi đã có (giữ trạng thái CRM &amp; lịch follow-up)
              </label>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void commitImport()}
              className="inline-flex items-center gap-2 rounded-2xl border border-amber-500 bg-gradient-to-r from-amber-600 to-emerald-600 px-6 py-3 text-base font-semibold text-white shadow-lg transition hover:brightness-105 disabled:opacity-40"
            >
              <Upload className="h-4 w-4" />
              Xác nhận nhập
            </button>
          </div>
        </div>
      ) : null}

      {banner ? (
        <div className="rounded-2xl border border-slate-200/90 bg-white/90 px-4 py-3 text-base text-slate-800 shadow-md backdrop-blur-xl">
          {banner}
        </div>
      ) : null}
    </div>
  )
}
