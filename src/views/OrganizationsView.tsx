import { useCallback, useEffect, useMemo, useState } from 'react'
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore'
import { Building2, Download, Loader2, Plus } from 'lucide-react'
import { AppPageHeader } from '../components/AppPageHeader'
import { BentoCell, BentoGrid, BentoStat } from '../components/bento'
import { useAuth } from '../hooks/useAuth'
import { useOrg } from '../hooks/useOrg'
import { FS_COLLECTIONS, type Organization } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { provisionOrganization, setOrganizationStatus } from '../services/createOrganization'
import { exportOrgSettingsBackup } from '../services/orgSettingsExport'
import { fetchOrgLeadHealth7d, type OrgLeadHealth } from '../services/orgHealth'
import { normalizeOrgSlug } from '../tenancy/orgConstants'
import { isPlatformSuperAdminRole } from '../tenancy/orgId'
import {
  platformAuditActionLabel,
  type PlatformAuditAction,
} from '../tenancy/platformOps'

type OrgRow = Organization & { id: string }

type AuditRow = {
  id: string
  action: PlatformAuditAction
  orgId: string
  orgName: string
  performedByName: string
  detail: string
  atMs: number
}

export function OrganizationsView() {
  const { profile, firebaseUser } = useAuth()
  const { setActiveOrgId, effectiveOrgId } = useOrg()
  const isPlatform = isPlatformSuperAdminRole(profile?.role, profile?.orgId ?? null)

  const [rows, setRows] = useState<OrgRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [healthByOrg, setHealthByOrg] = useState<Record<string, OrgLeadHealth>>({})
  const [audits, setAudits] = useState<AuditRow[]>([])

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [adminDisplayName, setAdminDisplayName] = useState('')

  useEffect(() => {
    if (!isPlatform || !isFirebaseConfigured()) {
      setLoading(false)
      return
    }
    const db = getFirestoreDb()
    if (!db) {
      setLoading(false)
      return
    }
    setLoading(true)
    const qy = collection(db, FS_COLLECTIONS.organizations)
    const unsub = onSnapshot(
      qy,
      (snap) => {
        const list = snap.docs.map((d) => {
          const data = d.data() as Partial<Organization>
          return {
            id: d.id,
            name: String(data.name ?? d.id),
            slug: String(data.slug ?? d.id),
            status: data.status === 'suspended' ? 'suspended' : 'active',
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
            createdBy: data.createdBy,
          } satisfies OrgRow
        })
        list.sort((a, b) => a.name.localeCompare(b.name, 'vi'))
        setRows(list)
        setLoading(false)
        setError(null)
      },
      (e) => {
        console.error(e)
        setError('Không đọc được danh sách trường (cần quyền Siêu quản trị).')
        setLoading(false)
      },
    )
    return () => unsub()
  }, [isPlatform])

  useEffect(() => {
    if (!isPlatform || !isFirebaseConfigured()) return
    const db = getFirestoreDb()
    if (!db) return
    const qy = query(
      collection(db, FS_COLLECTIONS.platformAuditLogs),
      orderBy('timestamp', 'desc'),
      limit(20),
    )
    const unsub = onSnapshot(
      qy,
      (snap) => {
        setAudits(
          snap.docs.map((d) => {
            const data = d.data() as {
              action?: string
              orgId?: string
              orgName?: string
              performedByName?: string
              detail?: string
              timestamp?: { toMillis?: () => number }
            }
            const action = (data.action ?? 'ORG_CREATED') as PlatformAuditAction
            return {
              id: d.id,
              action,
              orgId: String(data.orgId ?? ''),
              orgName: String(data.orgName ?? data.orgId ?? ''),
              performedByName: String(data.performedByName ?? ''),
              detail: String(data.detail ?? ''),
              atMs: data.timestamp?.toMillis?.() ?? 0,
            }
          }),
        )
      },
      () => setAudits([]),
    )
    return () => unsub()
  }, [isPlatform])

  useEffect(() => {
    if (!isPlatform || rows.length === 0) return
    const db = getFirestoreDb()
    if (!db) return
    let cancelled = false
    void (async () => {
      const next: Record<string, OrgLeadHealth> = {}
      for (const org of rows) {
        next[org.id] = await fetchOrgLeadHealth7d(db, org.id)
        if (cancelled) return
      }
      if (!cancelled) setHealthByOrg(next)
    })()
    return () => {
      cancelled = true
    }
  }, [isPlatform, rows])

  const activeCount = useMemo(() => rows.filter((r) => r.status === 'active').length, [rows])
  const suspendedCount = useMemo(() => rows.filter((r) => r.status === 'suspended').length, [rows])

  const onSlugFromName = () => {
    if (!slug.trim() && name.trim()) setSlug(normalizeOrgSlug(name))
  }

  const actor = useMemo(
    () => ({
      uid: firebaseUser?.uid ?? '',
      displayName: profile?.displayName,
      isPlatformSuperAdmin: true as const,
    }),
    [firebaseUser?.uid, profile?.displayName],
  )

  const onCreate = useCallback(async () => {
    const db = getFirestoreDb()
    if (!db || !firebaseUser) return
    setBusy(true)
    setBanner(null)
    setError(null)
    try {
      const result = await provisionOrganization(
        db,
        actor,
        {
          name,
          slug,
          adminEmail,
          adminPassword,
          adminDisplayName,
        },
      )
      setBanner(
        `Đã tạo trường «${result.orgId}». Admin: ${result.adminEmail}. Đã copy ${result.copiedSettings} cấu hình mẫu.`,
      )
      setName('')
      setSlug('')
      setAdminEmail('')
      setAdminPassword('')
      setAdminDisplayName('')
      setActiveOrgId(result.orgId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tạo được trường.')
    } finally {
      setBusy(false)
    }
  }, [firebaseUser, actor, name, slug, adminEmail, adminPassword, adminDisplayName, setActiveOrgId])

  const onToggleStatus = async (org: OrgRow) => {
    const db = getFirestoreDb()
    if (!db) return
    const next = org.status === 'active' ? 'suspended' : 'active'
    setBusy(true)
    setError(null)
    try {
      await setOrganizationStatus(db, actor, org.id, next, org.name)
      setBanner(next === 'suspended' ? `Đã tạm ngưng ${org.name}.` : `Đã mở lại ${org.name}.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không đổi được trạng thái.')
    } finally {
      setBusy(false)
    }
  }

  const onExport = async (org: OrgRow) => {
    const db = getFirestoreDb()
    if (!db) return
    setBusy(true)
    setError(null)
    try {
      const result = await exportOrgSettingsBackup(db, {
        orgId: org.id,
        orgName: org.name,
        actor,
      })
      setBanner(`Đã tải ${result.docCount} mục cấu hình của «${org.name}» (${result.filename}).`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được cấu hình.')
    } finally {
      setBusy(false)
    }
  }

  if (!isPlatform) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-950">
        Chỉ Siêu quản trị nền tảng mới vào được màn quản lý trường.
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <AppPageHeader
        title="Quản lý trường"
        meta="Tạo trường · sức khỏe · nhật ký · tải cấu hình"
      />

      <BentoGrid className="sm:!grid-cols-3 lg:!grid-cols-3">
        <BentoStat label="Đang hoạt động" value={loading ? '…' : String(activeCount)} tone="accent" />
        <BentoStat label="Tạm ngưng" value={loading ? '…' : String(suspendedCount)} tone="ink" />
        <BentoStat label="Đang chọn" value={effectiveOrgId} hint="Trong CRM" />
      </BentoGrid>

      {banner ? (
        <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-950">{banner}</div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</div>
      ) : null}

      <BentoCell colSpan={4} className="!p-4 sm:!p-5">
        <div className="flex items-center gap-2">
          <Plus className="h-4 w-4 text-teal-700" aria-hidden />
          <h2 className="text-sm font-semibold text-slate-900">Tạo trường mới</h2>
        </div>
        <p className="mt-1 text-xs text-slate-600">
          Hệ thống tạo không gian riêng, copy cấu hình mẫu từ VietMy (đã gỡ khóa API), và tài khoản Quản lý đầu tiên.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-semibold text-slate-600">
            Tên trường
            <input
              className="vm-input mt-1 w-full"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={onSlugFromName}
              placeholder="Cao đẳng Demo"
            />
          </label>
          <label className="block text-xs font-semibold text-slate-600">
            Slug (URL cổng đăng ký)
            <input
              className="vm-input mt-1 w-full font-mono text-sm"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="cao-dang-demo"
            />
            <span className="mt-1 block font-normal text-slate-500">/dang-ky/{normalizeOrgSlug(slug) || '…'}</span>
          </label>
          <label className="block text-xs font-semibold text-slate-600">
            Email admin trường
            <input
              type="email"
              className="vm-input mt-1 w-full"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              placeholder="quanly@demo.edu.vn"
            />
          </label>
          <label className="block text-xs font-semibold text-slate-600">
            Mật khẩu tạm
            <input
              type="password"
              className="vm-input mt-1 w-full"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              placeholder="Tối thiểu 6 ký tự"
            />
          </label>
          <label className="block text-xs font-semibold text-slate-600 sm:col-span-2">
            Tên hiển thị admin (tuỳ chọn)
            <input
              className="vm-input mt-1 w-full"
              value={adminDisplayName}
              onChange={(e) => setAdminDisplayName(e.target.value)}
            />
          </label>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onCreate()}
          className="vm-btn vm-btn-primary mt-4 inline-flex items-center gap-2"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Building2 className="h-4 w-4" aria-hidden />}
          Tạo trường + admin
        </button>
      </BentoCell>

      <BentoCell colSpan={4} className="!p-0 overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Danh sách trường</h2>
          <p className="mt-0.5 text-xs text-slate-500">Sức khỏe = số hồ sơ cập nhật trong 7 ngày gần đây.</p>
        </div>
        {loading ? (
          <p className="px-4 py-6 text-sm text-slate-600">Đang tải…</p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-600">
            Chưa có trường nào trong danh sách — tạo trường đầu tiên bên trên, hoặc nhờ kỹ thuật chạy đồng bộ dữ liệu Phase 0.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((org) => {
              const health = healthByOrg[org.id]
              return (
                <li key={org.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{org.name}</p>
                    <p className="truncate text-xs text-slate-500">
                      {org.id} · /dang-ky/{org.slug} ·{' '}
                      <span className={org.status === 'active' ? 'text-teal-700' : 'text-amber-700'}>
                        {org.status === 'active' ? 'Đang hoạt động' : 'Tạm ngưng'}
                      </span>
                      {health ? (
                        <>
                          {' '}
                          · {health.bandLabel} ({health.leadCount7d} hồ sơ/7 ngày)
                        </>
                      ) : (
                        ' · Đang đo…'
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="vm-btn vm-btn-secondary text-xs"
                    disabled={busy || org.status !== 'active'}
                    onClick={() => setActiveOrgId(org.id)}
                  >
                    Làm việc tại đây
                  </button>
                  <button
                    type="button"
                    className="vm-btn vm-btn-secondary text-xs inline-flex items-center gap-1"
                    disabled={busy}
                    onClick={() => void onExport(org)}
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden />
                    Tải cấu hình
                  </button>
                  <button
                    type="button"
                    className="vm-btn vm-btn-secondary text-xs"
                    disabled={busy}
                    onClick={() => void onToggleStatus(org)}
                  >
                    {org.status === 'active' ? 'Tạm ngưng' : 'Mở lại'}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </BentoCell>

      <BentoCell colSpan={4} className="!p-0 overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Nhật ký nền tảng</h2>
          <p className="mt-0.5 text-xs text-slate-500">20 thao tác gần nhất: tạo trường, tạm ngưng, tải cấu hình.</p>
        </div>
        {audits.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-600">Chưa có nhật ký — thao tác tạo/tạm ngưng sẽ hiện ở đây.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {audits.map((a) => (
              <li key={a.id} className="px-4 py-3 text-sm">
                <p className="font-medium text-slate-900">
                  {platformAuditActionLabel(a.action)} · {a.orgName || a.orgId}
                </p>
                <p className="text-xs text-slate-500">
                  {a.performedByName}
                  {a.detail ? ` · ${a.detail}` : ''}
                  {a.atMs ? ` · ${new Date(a.atMs).toLocaleString('vi-VN')}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </BentoCell>
    </div>
  )
}
