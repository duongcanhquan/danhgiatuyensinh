import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { collection, getDocs, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { Building2, ChevronDown, Download, Loader2, Plus, Settings2, Pencil, UserCog } from 'lucide-react'
import { AppPageHeader } from '../components/AppPageHeader'
import { BentoCell, BentoGrid, BentoStat } from '../components/bento'
import { useAuth } from '../hooks/useAuth'
import { useOrg } from '../hooks/useOrg'
import { FS_COLLECTIONS, type Organization } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import {
  provisionOrganization,
  setOrganizationStatus,
  updateOrganization,
} from '../services/createOrganization'
import { ensureDefaultOrganization } from '../services/ensureDefaultOrganization'
import { exportOrgSettingsBackup } from '../services/orgSettingsExport'
import { fetchOrgLeadHealth7d, type OrgLeadHealth } from '../services/orgHealth'
import { commitPlatformAudit } from '../services/platformAudit'
import { DEFAULT_ORG_ID, normalizeOrgSlug } from '../tenancy/orgConstants'
import { isPlatformSuperAdminRole } from '../tenancy/orgId'
import { leadBelongsToOrg } from '../tenancy/orgQuery'
import {
  platformAuditActionLabel,
  type PlatformAuditAction,
} from '../tenancy/platformOps'
import { normalizeUserRole } from '../auth/roleUtils'
import {
  defaultRoleCapabilities,
  loadRoleCapabilities,
  saveRoleCapabilities,
  SCHOOL_ADMIN_CAPABILITY_MODULES,
  type OrgRoleCapabilities,
} from '../utils/roleCapabilitiesConfig'

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

type AdminRow = {
  id: string
  email: string
  displayName: string
  isActive: boolean
}

export function OrganizationsView() {
  const navigate = useNavigate()
  const { profile, firebaseUser, createStaffAccount, updateStaffProfile, setStaffPassword } = useAuth()
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

  const [detailId, setDetailId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editSlug, setEditSlug] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [admins, setAdmins] = useState<AdminRow[]>([])
  const [adminsLoading, setAdminsLoading] = useState(false)
  const [newAdminEmail, setNewAdminEmail] = useState('')
  const [newAdminPassword, setNewAdminPassword] = useState('')
  const [newAdminName, setNewAdminName] = useState('')
  const [assignEmail, setAssignEmail] = useState('')
  const [nameDraftByUid, setNameDraftByUid] = useState<Record<string, string>>({})
  const [pwdDraftByUid, setPwdDraftByUid] = useState<Record<string, string>>({})
  const [capsDraft, setCapsDraft] = useState<OrgRoleCapabilities>(defaultRoleCapabilities())
  const [capsLoaded, setCapsLoaded] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)

  const detailOrg = useMemo(() => rows.find((r) => r.id === detailId) ?? null, [rows, detailId])

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
    let cancelled = false
    setLoading(true)
    void (async () => {
      try {
        const ensured = await ensureDefaultOrganization(db, { uid: firebaseUser?.uid })
        if (cancelled) return
        if (ensured.created) {
          setBanner(`Đã đăng ký trường mặc định «${ensured.name}» để quản lý dữ liệu cũ.`)
        }
      } catch (e) {
        console.warn('[OrganizationsView] ensureDefaultOrganization', e)
      }
    })()
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
            notes: typeof data.notes === 'string' ? data.notes : '',
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
            createdBy: data.createdBy,
          } satisfies OrgRow
        })
        list.sort((a, b) => {
          if (a.id === DEFAULT_ORG_ID) return -1
          if (b.id === DEFAULT_ORG_ID) return 1
          return a.name.localeCompare(b.name, 'vi')
        })
        setRows(list)
        setLoading(false)
        setError(null)
        setDetailId((prev) => {
          if (prev) return prev
          const vietmy = list.find((r) => r.id === DEFAULT_ORG_ID)
          return vietmy?.id ?? list[0]?.id ?? null
        })
      },
      (e) => {
        console.error(e)
        setError('Không đọc được danh sách trường (cần quyền Siêu quản trị).')
        setLoading(false)
      },
    )
    return () => {
      cancelled = true
      unsub()
    }
  }, [isPlatform, firebaseUser?.uid])

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

  useEffect(() => {
    if (!detailOrg) {
      setEditName('')
      setEditSlug('')
      setEditNotes('')
      setAdmins([])
      return
    }
    setEditName(detailOrg.name)
    setEditSlug(detailOrg.slug)
    setEditNotes(detailOrg.notes ?? '')
  }, [detailOrg])

  useEffect(() => {
    if (!detailId || !isPlatform || !isFirebaseConfigured()) {
      setCapsLoaded(false)
      return
    }
    const db = getFirestoreDb()
    if (!db) return
    setCapsLoaded(false)
    let cancelled = false
    void loadRoleCapabilities(db, detailId).then((caps) => {
      if (cancelled) return
      setCapsDraft(caps)
      setCapsLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [detailId, isPlatform])

  useEffect(() => {
    if (!detailId || !isPlatform || !isFirebaseConfigured()) {
      setAdmins([])
      return
    }
    const db = getFirestoreDb()
    if (!db) return
    setAdminsLoading(true)

    const mapAdminDocs = (
      docs: Array<{ id: string; data: () => Record<string, unknown> }>,
    ): AdminRow[] => {
      const byId = new Map<string, AdminRow>()
      for (const d of docs) {
        const data = d.data() as {
          email?: string
          displayName?: string
          role?: string
          isActive?: boolean
          orgId?: string | null
        }
        if (normalizeUserRole(String(data.role ?? '')) !== 'admin') continue
        if (!leadBelongsToOrg({ orgId: data.orgId }, detailId)) continue
        byId.set(d.id, {
          id: d.id,
          email: String(data.email ?? ''),
          displayName: String(data.displayName ?? data.email ?? d.id),
          isActive: data.isActive !== false,
        })
      }
      return [...byId.values()].sort((a, b) => a.displayName.localeCompare(b.displayName, 'vi'))
    }

    // VietMy: query role=admin để gồm quản lý cũ thiếu orgId. Trường khác: orgId==.
    const qy =
      detailId === DEFAULT_ORG_ID
        ? query(collection(db, FS_COLLECTIONS.users), where('role', '==', 'admin'))
        : query(collection(db, FS_COLLECTIONS.users), where('orgId', '==', detailId))

    const unsub = onSnapshot(
      qy,
      (snap) => {
        setAdmins(
          mapAdminDocs(snap.docs.map((d) => ({ id: d.id, data: () => d.data() as Record<string, unknown> }))),
        )
        setAdminsLoading(false)
      },
      (e) => {
        console.warn('[OrganizationsView] admins query', e)
        setAdmins([])
        setAdminsLoading(false)
      },
    )
    return () => unsub()
  }, [detailId, isPlatform])

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
      const result = await provisionOrganization(db, actor, {
        name,
        slug,
        adminEmail,
        adminPassword,
        adminDisplayName,
      })
      setBanner(
        `Đã tạo trường «${result.orgId}». Quản lý: ${result.adminEmail}. Đã copy ${result.copiedSettings} cấu hình mẫu.`,
      )
      setName('')
      setSlug('')
      setAdminEmail('')
      setAdminPassword('')
      setAdminDisplayName('')
      setActiveOrgId(result.orgId)
      setDetailId(result.orgId)
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

  const onSaveDetail = async () => {
    const db = getFirestoreDb()
    if (!db || !detailOrg) return
    setBusy(true)
    setError(null)
    try {
      const result = await updateOrganization(db, actor, detailOrg.id, {
        name: editName,
        slug: detailOrg.id === DEFAULT_ORG_ID ? detailOrg.slug : editSlug.trim() || detailOrg.slug,
        notes: editNotes,
      })
      setBanner(`Đã lưu thông tin trường «${result.name}».`)
      if (result.slug && result.slug !== detailOrg.slug) {
        setEditSlug(result.slug)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lưu được thông tin trường.')
    } finally {
      setBusy(false)
    }
  }

  const onSaveCaps = async () => {
    const db = getFirestoreDb()
    if (!db || !detailOrg || !actor.uid) return
    setBusy(true)
    setError(null)
    try {
      await saveRoleCapabilities(
        db,
        detailOrg.id,
        capsDraft,
        actor.displayName || actor.uid,
      )
      setBanner(`Đã lưu phân quyền Admin cho «${detailOrg.name}».`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lưu được phân quyền trường.')
    } finally {
      setBusy(false)
    }
  }

  const toggleCapModule = (moduleId: string, on: boolean) => {
    const mod = SCHOOL_ADMIN_CAPABILITY_MODULES.find((m) => m.id === moduleId)
    if (mod?.required) return
    setCapsDraft((prev) => {
      const set = new Set(prev.adminEnabledModuleIds)
      if (on) set.add(moduleId)
      else set.delete(moduleId)
      for (const m of SCHOOL_ADMIN_CAPABILITY_MODULES) {
        if (m.required) set.add(m.id)
      }
      return { ...prev, adminEnabledModuleIds: [...set] }
    })
  }

  const onOpenSettings = (org: OrgRow) => {
    setActiveOrgId(org.id)
    navigate('/settings')
  }

  const onAddAdmin = async () => {
    const db = getFirestoreDb()
    if (!db || !detailOrg || !actor.uid) return
    setBusy(true)
    setError(null)
    try {
      await createStaffAccount({
        email: newAdminEmail,
        password: newAdminPassword,
        displayName: newAdminName.trim() || newAdminEmail.split('@')[0],
        role: 'admin',
        orgId: detailOrg.id,
      })
      try {
        await commitPlatformAudit(db, {
          action: 'ORG_ADMIN_ADDED',
          orgId: detailOrg.id,
          orgName: detailOrg.name,
          performedBy: actor.uid,
          performedByName: actor.displayName,
          detail: newAdminEmail.trim().toLowerCase(),
        })
      } catch {
        /* ignore audit failure */
      }
      setBanner(`Đã thêm quản lý ${newAdminEmail.trim().toLowerCase()} cho «${detailOrg.name}».`)
      setNewAdminEmail('')
      setNewAdminPassword('')
      setNewAdminName('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thêm được quản lý.')
    } finally {
      setBusy(false)
    }
  }

  const onToggleAdminActive = async (admin: AdminRow) => {
    const db = getFirestoreDb()
    if (!db || !detailOrg || !actor.uid) return
    const nextActive = !admin.isActive
    setBusy(true)
    setError(null)
    try {
      await updateStaffProfile({ userId: admin.id, isActive: nextActive })
      try {
        await commitPlatformAudit(db, {
          action: nextActive ? 'ORG_ADMIN_ENABLED' : 'ORG_ADMIN_DISABLED',
          orgId: detailOrg.id,
          orgName: detailOrg.name,
          performedBy: actor.uid,
          performedByName: actor.displayName,
          detail: admin.email || admin.id,
        })
      } catch {
        /* ignore */
      }
      setBanner(
        nextActive
          ? `Đã bật lại đăng nhập cho ${admin.displayName}.`
          : `Đã vô hiệu ${admin.displayName}.`,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không đổi được trạng thái quản lý.')
    } finally {
      setBusy(false)
    }
  }

  const onSetAdminPassword = async (admin: AdminRow) => {
    const pwd = (pwdDraftByUid[admin.id] ?? '').trim()
    if (pwd.length < 6) {
      setError('Mật khẩu mới tối thiểu 6 ký tự.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await setStaffPassword(admin.id, pwd)
      setBanner(`Đã đặt mật khẩu mới cho ${admin.displayName}.`)
      setPwdDraftByUid((prev) => {
        const next = { ...prev }
        delete next[admin.id]
        return next
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không đặt được mật khẩu.')
    } finally {
      setBusy(false)
    }
  }

  const onSaveAdminName = async (admin: AdminRow) => {
    const nameNext = (nameDraftByUid[admin.id] ?? admin.displayName).trim()
    if (!nameNext) {
      setError('Tên hiển thị không được trống.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await updateStaffProfile({ userId: admin.id, displayName: nameNext })
      setBanner(`Đã cập nhật tên quản lý «${nameNext}».`)
      setNameDraftByUid((prev) => {
        const next = { ...prev }
        delete next[admin.id]
        return next
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không sửa được tên quản lý.')
    } finally {
      setBusy(false)
    }
  }

  const onAssignExistingAdmin = async () => {
    const db = getFirestoreDb()
    if (!db || !detailOrg || !actor.uid) return
    const email = assignEmail.trim().toLowerCase()
    if (!email || !email.includes('@')) {
      setError('Nhập email tài khoản đã có để gắn làm quản lý trường.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const snap = await getDocs(
        query(collection(db, FS_COLLECTIONS.users), where('email', '==', email), limit(5)),
      )
      let hit = snap.docs[0]
      if (!hit) {
        const snap2 = await getDocs(
          query(collection(db, FS_COLLECTIONS.users), where('email', '==', assignEmail.trim()), limit(5)),
        )
        hit = snap2.docs[0]
      }
      if (!hit) {
        throw new Error('Không tìm thấy tài khoản với email này. Hãy tạo quản lý mới bên dưới.')
      }
      const data = hit.data() as { role?: string; displayName?: string }
      if (normalizeUserRole(String(data.role ?? '')) === 'super_admin') {
        throw new Error('Không gắn Siêu quản trị vào một trường.')
      }
      await updateStaffProfile({
        userId: hit.id,
        role: 'admin',
        orgId: detailOrg.id,
        isActive: true,
      })
      try {
        await commitPlatformAudit(db, {
          action: 'ORG_ADMIN_ADDED',
          orgId: detailOrg.id,
          orgName: detailOrg.name,
          performedBy: actor.uid,
          performedByName: actor.displayName,
          detail: `assign:${email}`,
        })
      } catch {
        /* ignore */
      }
      setBanner(`Đã gắn ${email} làm quản lý «${detailOrg.name}».`)
      setAssignEmail('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không gắn được quản lý.')
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
        meta="Xem · sửa · quản lý · cài đặt theo từng trường"
      />

      <BentoGrid className="sm:!grid-cols-3 lg:!grid-cols-3">
        <BentoStat label="Đang hoạt động" value={loading ? '…' : String(activeCount)} tone="accent" />
        <BentoStat label="Tạm ngưng" value={loading ? '…' : String(suspendedCount)} tone="ink" />
        <BentoStat label="Đang chọn" value={effectiveOrgId} hint="Trong CRM" />
      </BentoGrid>

      {banner ? (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-950">{banner}</div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</div>
      ) : null}

      <BentoCell colSpan={4} className="!p-0 overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Danh sách trường</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Mở <strong>Chi tiết</strong> để sửa thông tin trường và thêm / sửa quản lý (admin) của trường đó. Trường
            Việt Mỹ (dữ liệu cũ) luôn nằm đầu danh sách.
          </p>
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
              const open = detailId === org.id
              return (
                <li key={org.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {org.name}
                        {org.id === DEFAULT_ORG_ID ? (
                          <span className="ml-2 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-800">
                            Mặc định · dữ liệu cũ
                          </span>
                        ) : null}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {org.id} · /dang-ky/{org.slug} ·{' '}
                        <span className={org.status === 'active' ? 'text-indigo-700' : 'text-amber-700'}>
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
                      className="vm-btn vm-btn-secondary text-xs inline-flex items-center gap-1"
                      disabled={busy}
                      onClick={() => setDetailId(open ? null : org.id)}
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                      {open ? 'Đóng' : 'Chi tiết'}
                    </button>
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
                      disabled={busy || org.status !== 'active'}
                      onClick={() => onOpenSettings(org)}
                    >
                      <Settings2 className="h-3.5 w-3.5" aria-hidden />
                      Cài đặt
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
                  </div>

                  {open && detailOrg?.id === org.id ? (
                    <div className="mt-3 space-y-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">Thông tin trường</h3>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Mã trường ({org.id}) cố định. Đổi đường dẫn cổng đăng ký ảnh hưởng URL công khai.
                        </p>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <label className="block text-xs font-semibold text-slate-600">
                            Tên trường
                            <input
                              className="vm-input mt-1 w-full"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                            />
                          </label>
                          <label className="block text-xs font-semibold text-slate-600">
                            Đường dẫn cổng đăng ký
                            <input
                              className="vm-input mt-1 w-full font-mono text-sm"
                              value={editSlug}
                              onChange={(e) => setEditSlug(e.target.value)}
                              disabled={org.id === DEFAULT_ORG_ID}
                            />
                            <span className="mt-1 block font-normal text-slate-500">
                              /dang-ky/{normalizeOrgSlug(editSlug) || detailOrg.slug}
                              {org.id === DEFAULT_ORG_ID ? ' · trường mặc định giữ nguyên đường dẫn' : ''}
                            </span>
                          </label>
                          <label className="block text-xs font-semibold text-slate-600 sm:col-span-2">
                            Ghi chú nội bộ
                            <textarea
                              className="vm-input mt-1 min-h-[72px] w-full"
                              value={editNotes}
                              onChange={(e) => setEditNotes(e.target.value)}
                              placeholder="Ghi chú cho Siêu quản trị (không hiện nhân sự vận hành)"
                            />
                          </label>
                        </div>
                        <button
                          type="button"
                          className="vm-btn vm-btn-primary mt-3 text-xs"
                          disabled={busy}
                          onClick={() => void onSaveDetail()}
                        >
                          Lưu thông tin trường
                        </button>
                      </div>

                      <div className="border-t border-slate-200 pt-4">
                        <h3 className="text-sm font-semibold text-slate-900">Phân quyền Admin trường</h3>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Siêu quản trị giao module nào Admin trường được dùng. Admin trường sẽ tự phân quyền nhân sự
                          vận hành và setup cài đặt trong phạm vi này.
                        </p>
                        {!capsLoaded ? (
                          <p className="mt-2 text-xs text-slate-600">Đang tải phân quyền…</p>
                        ) : (
                          <ul className="mt-3 space-y-2">
                            {SCHOOL_ADMIN_CAPABILITY_MODULES.map((m) => {
                              const on = capsDraft.adminEnabledModuleIds.includes(m.id)
                              return (
                                <li key={m.id}>
                                  <label className="flex cursor-pointer gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                                    <input
                                      type="checkbox"
                                      className="mt-1"
                                      checked={on}
                                      disabled={busy || m.required}
                                      onChange={(e) => toggleCapModule(m.id, e.target.checked)}
                                    />
                                    <span>
                                      <span className="font-semibold text-slate-900">{m.label}</span>
                                      {m.required ? (
                                        <span className="ml-1 text-[10px] font-bold uppercase text-indigo-700">
                                          Bắt buộc
                                        </span>
                                      ) : null}
                                      <span className="mt-0.5 block text-xs text-slate-500">{m.hint}</span>
                                    </span>
                                  </label>
                                </li>
                              )
                            })}
                          </ul>
                        )}
                        <button
                          type="button"
                          className="vm-btn vm-btn-primary mt-3 text-xs"
                          disabled={busy || !capsLoaded}
                          onClick={() => void onSaveCaps()}
                        >
                          Lưu phân quyền Admin
                        </button>
                      </div>

                      <div className="border-t border-slate-200 pt-4">
                        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                          <UserCog className="h-4 w-4 text-indigo-700" aria-hidden />
                          Quản lý của trường
                        </h3>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Tài khoản vai trò Quản lý gắn với trường này — chịu trách nhiệm cài đặt trong trường.
                          {org.id === DEFAULT_ORG_ID
                            ? ' Việt Mỹ: hiện cả quản lý cũ chưa gắn mã trường.'
                            : ''}
                        </p>
                        {adminsLoading ? (
                          <p className="mt-2 text-xs text-slate-600">Đang tải danh sách quản lý…</p>
                        ) : admins.length === 0 ? (
                          <p className="mt-2 text-xs text-slate-600">Chưa có quản lý — thêm hoặc gắn tài khoản bên dưới.</p>
                        ) : (
                          <ul className="mt-2 space-y-2">
                            {admins.map((a) => (
                              <li
                                key={a.id}
                                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="min-w-0 flex-1">
                                    <p className="font-medium text-slate-900">{a.displayName}</p>
                                    <p className="truncate text-xs text-slate-500">
                                      {a.email} ·{' '}
                                      <span className={a.isActive ? 'text-indigo-700' : 'text-amber-700'}>
                                        {a.isActive ? 'Đang hoạt động' : 'Đã vô hiệu'}
                                      </span>
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    className="vm-btn vm-btn-secondary text-xs"
                                    disabled={busy}
                                    onClick={() => void onToggleAdminActive(a)}
                                  >
                                    {a.isActive ? 'Vô hiệu' : 'Bật lại'}
                                  </button>
                                </div>
                                <div className="mt-2 flex flex-wrap items-end gap-2">
                                  <label className="block min-w-[10rem] flex-1 text-xs font-semibold text-slate-600">
                                    Tên hiển thị
                                    <input
                                      className="vm-input mt-1 w-full"
                                      value={nameDraftByUid[a.id] ?? a.displayName}
                                      onChange={(e) =>
                                        setNameDraftByUid((prev) => ({ ...prev, [a.id]: e.target.value }))
                                      }
                                    />
                                  </label>
                                  <button
                                    type="button"
                                    className="vm-btn vm-btn-secondary text-xs"
                                    disabled={busy}
                                    onClick={() => void onSaveAdminName(a)}
                                  >
                                    Lưu tên
                                  </button>
                                  <label className="block min-w-[10rem] flex-1 text-xs font-semibold text-slate-600">
                                    Mật khẩu mới
                                    <input
                                      type="password"
                                      className="vm-input mt-1 w-full"
                                      value={pwdDraftByUid[a.id] ?? ''}
                                      onChange={(e) =>
                                        setPwdDraftByUid((prev) => ({ ...prev, [a.id]: e.target.value }))
                                      }
                                      placeholder="Tối thiểu 6 ký tự"
                                    />
                                  </label>
                                  <button
                                    type="button"
                                    className="vm-btn vm-btn-secondary text-xs"
                                    disabled={busy}
                                    onClick={() => void onSetAdminPassword(a)}
                                  >
                                    Đặt mật khẩu
                                  </button>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}

                        <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white/70 p-3">
                          <p className="text-xs font-semibold text-slate-800">Gắn tài khoản đã có thành quản lý</p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            Dùng khi người đó đã có tài khoản CRM (TVV / CTV / …) — đổi thành Quản lý của trường này.
                          </p>
                          <div className="mt-2 flex flex-wrap items-end gap-2">
                            <label className="block min-w-[14rem] flex-1 text-xs font-semibold text-slate-600">
                              Email tài khoản
                              <input
                                type="email"
                                className="vm-input mt-1 w-full"
                                value={assignEmail}
                                onChange={(e) => setAssignEmail(e.target.value)}
                                placeholder="nguoi@truong.edu.vn"
                              />
                            </label>
                            <button
                              type="button"
                              className="vm-btn vm-btn-secondary text-xs"
                              disabled={busy}
                              onClick={() => void onAssignExistingAdmin()}
                            >
                              Gắn làm quản lý
                            </button>
                          </div>
                        </div>

                        <div className="mt-3 grid gap-2 sm:grid-cols-3">
                          <label className="block text-xs font-semibold text-slate-600">
                            Email quản lý mới
                            <input
                              type="email"
                              className="vm-input mt-1 w-full"
                              value={newAdminEmail}
                              onChange={(e) => setNewAdminEmail(e.target.value)}
                            />
                          </label>
                          <label className="block text-xs font-semibold text-slate-600">
                            Mật khẩu tạm
                            <input
                              type="password"
                              className="vm-input mt-1 w-full"
                              value={newAdminPassword}
                              onChange={(e) => setNewAdminPassword(e.target.value)}
                            />
                          </label>
                          <label className="block text-xs font-semibold text-slate-600">
                            Tên hiển thị
                            <input
                              className="vm-input mt-1 w-full"
                              value={newAdminName}
                              onChange={(e) => setNewAdminName(e.target.value)}
                            />
                          </label>
                        </div>
                        <button
                          type="button"
                          className="vm-btn vm-btn-primary mt-2 text-xs"
                          disabled={busy}
                          onClick={() => void onAddAdmin()}
                        >
                          Tạo quản lý trường mới
                        </button>
                      </div>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </BentoCell>

      <BentoCell colSpan={4} className="!p-4 sm:!p-5">
        <button
          type="button"
          className="flex w-full items-center gap-2 text-left"
          onClick={() => setShowCreateForm((v) => !v)}
        >
          <Plus className="h-4 w-4 text-indigo-700" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-slate-900">Tạo trường mới</span>
            <span className="block text-xs font-normal text-slate-600">
              Không gian riêng + tài khoản Quản lý đầu tiên (copy cấu hình mẫu từ Việt Mỹ).
            </span>
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-slate-500 transition ${showCreateForm ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </button>
        {showCreateForm ? (
          <>
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
                Đường dẫn cổng đăng ký
                <input
                  className="vm-input mt-1 w-full font-mono text-sm"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="cao-dang-demo"
                />
                <span className="mt-1 block font-normal text-slate-500">
                  /dang-ky/{normalizeOrgSlug(slug) || '…'}
                </span>
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Email quản lý trường
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
                Tên hiển thị quản lý (tuỳ chọn)
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
              Tạo trường + quản lý
            </button>
          </>
        ) : null}
      </BentoCell>

      <BentoCell colSpan={4} className="!p-0 overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Nhật ký nền tảng</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Thao tác gần đây: tạo/sửa trường, tạm ngưng, quản lý, tải cấu hình.
          </p>
        </div>
        {audits.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-600">Chưa có nhật ký — thao tác tạo/sửa sẽ hiện ở đây.</p>
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

      <p className="text-center text-xs text-slate-500">
        Đang cấu hình CRM cho trường đang chọn? Vào{' '}
        <Link to="/settings" className="font-medium text-indigo-800 underline-offset-2 hover:underline">
          Cài đặt
        </Link>
        .
      </p>
    </div>
  )
}
