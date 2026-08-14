import { useRef, useState, type ChangeEvent } from 'react'
import { Download, FileSpreadsheet, Upload } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useOrg } from '../contexts/OrgProvider'
import {
  downloadStaffIntakeTemplate,
  parseStaffWorkbook,
  type ExcelStaffRow,
} from '../utils/excelStaffMapper'
import { USER_ROLE_LABELS, type UserRole } from '../types'

/** Nhập Excel tư vấn viên — làm trước khi import Sheet hồ sơ (map theo Tên hiển thị). */
export function StaffExcelImportPanel() {
  const { can, createStaffAccount, users } = useAuth()
  const { effectiveOrgId } = useOrg()
  const canCreate = can('config:users')
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<ExcelStaffRow[] | null>(null)
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')

  if (!canCreate) return null

  const existingEmails = new Set(users.map((u) => u.email.toLowerCase().trim()))

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setMsg(null)
    setErr(null)
    setFileName(file.name)
    try {
      const buf = await file.arrayBuffer()
      const { rows, errors } = parseStaffWorkbook(buf)
      setParseErrors(errors)
      setPreview(rows)
      if (!rows.length) setErr(errors[0] || 'Không đọc được dòng nhân sự nào.')
    } catch (ex) {
      setPreview(null)
      setErr(ex instanceof Error ? ex.message : 'Không đọc được file.')
    }
  }

  const commit = async () => {
    if (!preview?.length) return
    setBusy(true)
    setMsg(null)
    setErr(null)
    let ok = 0
    let skip = 0
    const fail: string[] = []
    for (const row of preview) {
      if (existingEmails.has(row.email)) {
        skip += 1
        continue
      }
      try {
        await createStaffAccount({
          email: row.email,
          password: row.password,
          displayName: row.displayName,
          role: row.role,
          orgId: row.role === 'super_admin' ? null : effectiveOrgId,
          ...(row.omicallSipUser ? { omicallSipUser: row.omicallSipUser } : {}),
        })
        existingEmails.add(row.email)
        ok += 1
      } catch (ex) {
        fail.push(`${row.email}: ${ex instanceof Error ? ex.message : 'lỗi'}`)
      }
    }
    setBusy(false)
    setMsg(
      `Đã tạo ${ok} tài khoản` +
        (skip ? `; bỏ qua ${skip} email đã có` : '') +
        (fail.length ? `; lỗi ${fail.length}` : '') +
        '. Kiểm tra cột «Tên hiển thị» khớp tên TVV trên Sheet trước khi nhập hồ sơ.',
    )
    if (fail.length) setErr(fail.slice(0, 5).join(' · '))
    setPreview(null)
  }

  return (
    <section className="rounded-2xl border border-violet-200 bg-violet-50/40 p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-extrabold text-violet-950">
            <FileSpreadsheet className="h-4 w-4" aria-hidden />
            Nhập Excel tư vấn viên
          </h3>
          <p className="mt-1 text-xs text-violet-900/80">
            Làm bước này trước khi import Sheet sinh viên. Cột <strong>Tên hiển thị</strong> phải khớp tên TVV trên
            Sheet cũ để gán hồ sơ đúng người.
          </p>
        </div>
        <button
          type="button"
          onClick={() => downloadStaffIntakeTemplate()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-xs font-bold text-violet-900"
        >
          <Download className="h-3.5 w-3.5" aria-hidden />
          Tải mẫu
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => void onFile(e)} />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-xl bg-violet-800 px-4 py-2 text-sm font-bold text-white hover:bg-violet-900"
        >
          <Upload className="h-4 w-4" aria-hidden />
          Chọn file Excel
        </button>
      </div>

      {fileName ? <p className="mt-2 text-xs text-slate-600">File: {fileName}</p> : null}
      {parseErrors.length ? (
        <ul className="mt-2 list-disc pl-5 text-xs text-amber-900">
          {parseErrors.slice(0, 8).map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}

      {preview && preview.length > 0 ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-semibold text-slate-700">{preview.length} dòng sẽ tạo (bỏ email đã có khi Lưu)</p>
          <div className="max-h-48 overflow-auto rounded-xl border border-violet-100 bg-white">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-violet-100 text-violet-950">
                <tr>
                  <th className="px-2 py-1.5">Tên hiển thị</th>
                  <th className="px-2 py-1.5">Email</th>
                  <th className="px-2 py-1.5">Vai trò</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 40).map((r) => (
                  <tr key={r.email} className="border-t border-slate-100">
                    <td className="px-2 py-1 font-semibold text-slate-900">{r.displayName}</td>
                    <td className="px-2 py-1 font-mono text-slate-700">{r.email}</td>
                    <td className="px-2 py-1">{USER_ROLE_LABELS[r.role as UserRole] ?? r.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void commit()}
            className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? 'Đang tạo…' : `Tạo ${preview.length} tài khoản`}
          </button>
        </div>
      ) : null}

      {msg ? <p className="mt-2 text-sm font-medium text-emerald-800">{msg}</p> : null}
      {err ? <p className="mt-2 text-sm text-rose-700">{err}</p> : null}
    </section>
  )
}
