/**
 * Xóa nhanh dữ liệu nghiệp vụ trên Firestore (Admin SDK).
 *
 * ⚠️ NGUY HIỂM — mặc định KHÔNG xóa `users` / `organizations`.
 *
 * Tốc độ: dùng `recursiveDelete(collection)` + BulkWriter (song song),
 * KHÔNG xóa từng doc tuần tự (cách cũ rất chậm với hàng chục nghìn hồ sơ).
 *
 * Chuẩn bị:
 *   GOOGLE_APPLICATION_CREDENTIALS=./secrets/serviceAccount.json
 *   FIRESTORE_DATABASE_ID=warmlist
 *
 * Chế độ (WIPE_MODE):
 *   leads    — chỉ collection `leads` (+ subcollection dưới từng hồ sơ)
 *   ops      — hồ sơ + OMICall, KPI, audit… (mặc định)
 *   catalog  — ops + nguồn/học bổng/scoring…
 *   all_data — catalog + orgSettings (vẫn giữ users + organizations)
 *
 * Dry-run:
 *   WIPE_DRY_RUN=1 WIPE_MODE=leads node scripts/wipe-firestore-data.mjs
 *
 * Xóa thật:
 *   WIPE_CONFIRM=XOA_HET_DU_LIEU WIPE_MODE=leads node scripts/wipe-firestore-data.mjs
 *
 * Chỉ một trường:
 *   WIPE_ORG_ID=vietmy ...
 */
import { FieldPath } from 'firebase-admin/firestore'
import { initFirestoreAdmin, readDotenvValue } from './lib/firestoreAdminFromEnv.mjs'

const PAGE = 450
/** Số lead xóa song song khi lọc theo orgId (recursiveDelete từng doc). */
const ORG_CONCURRENCY = Math.min(40, Math.max(8, Number(process.env.WIPE_CONCURRENCY) || 24))

const MODE_OPS = [
  'leads',
  'auditLogs',
  'omicallCalls',
  'omicallCallAnalyses',
  'omicallSyncRuns',
  'leadEvents',
  'financeReports',
  'kpiDaily',
  'kpiMonthly',
  'kpiTargets',
  'kpiManualScores',
]

const MODE_CATALOG_EXTRA = [
  'leadSources',
  'scholarships',
  'consultingPlaybooks',
  'scriptSnippets',
  'knowledgeDocuments',
  'scoringProfiles',
  'scoringRuleTemplates',
  'scoringRuleSets',
  'scoringAux',
  'masterData',
  'ai_tasks',
  'routingPolicies',
]

const MODE_ALL_EXTRA = ['orgSettings', 'platformAuditLogs']

function truthy(v) {
  return /^(1|true|yes)$/i.test(String(v || '').trim())
}

function resolveCollections(mode) {
  const m = String(mode || 'ops').trim().toLowerCase()
  if (m === 'leads' || m === 'lead') return ['leads']
  if (m === 'ops') return [...MODE_OPS]
  if (m === 'catalog') return [...MODE_OPS, ...MODE_CATALOG_EXTRA]
  if (m === 'all_data' || m === 'all') return [...MODE_OPS, ...MODE_CATALOG_EXTRA, ...MODE_ALL_EXTRA]
  throw new Error(`WIPE_MODE không hợp lệ: ${mode} (dùng leads | ops | catalog | all_data)`)
}

function createFastBulkWriter(db) {
  const writer = db.bulkWriter({
    throttling: {
      initialOpsPerSecond: 500,
      maxOpsPerSecond: 1000,
    },
  })
  writer.onWriteError((err) => {
    if (err.failedAttempts < 8) return true
    console.warn('[wipe] write lỗi sau retry:', err.documentRef?.path, err.message)
    return false
  })
  return writer
}

async function countCollection(db, name, orgId) {
  let q = db.collection(name)
  if (orgId) q = q.where('orgId', '==', orgId)
  try {
    const agg = await q.count().get()
    return agg.data().count
  } catch {
    return null
  }
}

/**
 * Xóa cả collection (+ mọi subcollection) một phát — nhanh nhất khi không lọc orgId.
 */
async function wipeWholeCollection(db, colRef, { dryRun, label }) {
  if (dryRun) {
    const n = await countCollection(db, colRef.id, undefined)
    return { scanned: n ?? 0, deleted: n ?? 0 }
  }
  console.log(`[${label}] recursiveDelete cả collection (BulkWriter)…`)
  const t0 = Date.now()
  let ops = 0
  const writer = createFastBulkWriter(db)
  writer.onWriteResult(() => {
    ops += 1
    if (ops % 200 === 0) {
      process.stdout.write(`\r[${label}] ~${ops.toLocaleString('vi-VN')} thao tác xóa…`)
    }
  })
  await db.recursiveDelete(colRef, writer)
  process.stdout.write('\n')
  console.log(`[${label}] xong trong ${((Date.now() - t0) / 1000).toFixed(1)}s (~${ops.toLocaleString('vi-VN')} ops)`)
  return { scanned: ops, deleted: ops }
}

/**
 * Lọc orgId: vẫn phải chọn doc rồi recursiveDelete — chạy song song theo lô.
 */
async function wipeCollectionByOrg(db, colRef, { orgId, dryRun, label }) {
  let deleted = 0
  let scanned = 0
  let last = null
  let clientOrgFilter = false

  for (;;) {
    let snap
    try {
      let q = !clientOrgFilter
        ? colRef.where('orgId', '==', orgId).orderBy(FieldPath.documentId()).limit(PAGE)
        : colRef.orderBy(FieldPath.documentId()).limit(PAGE)
      if (last) q = q.startAfter(last)
      snap = await q.get()
    } catch (e) {
      if (!clientOrgFilter) {
        console.warn(`[${label}] query orgId lỗi → quét rộng:`, e.message || e)
        clientOrgFilter = true
        last = null
        continue
      }
      throw e
    }

    if (snap.empty) break
    const docs = clientOrgFilter
      ? snap.docs.filter((d) => String(d.get('orgId') || '') === orgId)
      : snap.docs
    scanned += snap.docs.length
    last = snap.docs[snap.docs.length - 1]

    if (!docs.length) {
      if (snap.size < PAGE) break
      continue
    }

    if (dryRun) {
      deleted += docs.length
    } else {
      for (let i = 0; i < docs.length; i += ORG_CONCURRENCY) {
        const chunk = docs.slice(i, i + ORG_CONCURRENCY)
        await Promise.all(chunk.map((d) => db.recursiveDelete(d.ref)))
        deleted += chunk.length
        process.stdout.write(`\r[${label}] đã xóa ${deleted.toLocaleString('vi-VN')}…`)
      }
    }

    if (snap.size < PAGE) break
  }

  if (!dryRun && deleted) process.stdout.write('\n')
  return { scanned, deleted }
}

async function deleteQueryInPages(db, colRef, { orgId, dryRun, label }) {
  if (!orgId) return wipeWholeCollection(db, colRef, { dryRun, label })
  return wipeCollectionByOrg(db, colRef, { orgId, dryRun, label })
}

async function wipeCollectionGroupOrphans(db, groupId, { dryRun, label }) {
  let deleted = 0
  let last = null
  const writer = dryRun ? null : createFastBulkWriter(db)
  for (;;) {
    let q = db.collectionGroup(groupId).orderBy(FieldPath.documentId()).limit(PAGE)
    if (last) q = q.startAfter(last)
    let snap
    try {
      snap = await q.get()
    } catch {
      console.warn(`[${label}] bỏ qua collectionGroup ${groupId} (có thể cần index).`)
      return deleted
    }
    if (snap.empty) break
    last = snap.docs[snap.docs.length - 1]
    if (dryRun) {
      deleted += snap.size
    } else {
      for (const d of snap.docs) {
        writer.delete(d.ref)
        deleted += 1
      }
      await writer.flush()
      process.stdout.write(`\r[group/${groupId}] dọn ${deleted.toLocaleString('vi-VN')}…`)
    }
    if (snap.size < PAGE) break
  }
  if (!dryRun && writer) await writer.close()
  if (!dryRun && deleted) process.stdout.write('\n')
  return deleted
}

async function main() {
  const dryRun = truthy(process.env.WIPE_DRY_RUN)
  const mode = process.env.WIPE_MODE || 'ops'
  const orgId = (process.env.WIPE_ORG_ID || '').trim()
  const includeUsers = truthy(process.env.WIPE_INCLUDE_USERS)
  const confirm = (process.env.WIPE_CONFIRM || '').trim()

  const collections = resolveCollections(mode)
  if (includeUsers) collections.push('users')

  const { db, firestoreDbId } = initFirestoreAdmin()
  const projectHint =
    process.env.GCLOUD_PROJECT ||
    readDotenvValue('VITE_FIREBASE_PROJECT_ID') ||
    '(xem service account)'

  console.log('=== WIPE FIRESTORE (nhanh) ===')
  console.log('project/db :', projectHint, '/', firestoreDbId)
  console.log('mode       :', mode)
  console.log('orgId      :', orgId || '(tất cả org → xóa cả collection)')
  console.log('collections:', collections.join(', '))
  console.log('dry_run    :', dryRun ? 'YES — chỉ đếm/ước lượng' : 'NO — XÓA THẬT')
  console.log('include_users:', includeUsers ? 'YES' : 'no')
  if (!orgId) {
    console.log('chiến lược : recursiveDelete(collection) + BulkWriter 500–1000 ops/s')
  } else {
    console.log(`chiến lược : recursiveDelete song song ×${ORG_CONCURRENCY} (lọc orgId)`)
  }

  if (!dryRun && confirm !== 'XOA_HET_DU_LIEU') {
    console.error(`
Chặn an toàn: để xóa thật hãy đặt:
  WIPE_CONFIRM=XOA_HET_DU_LIEU
`)
    process.exit(2)
  }

  console.log('\n— Ước lượng (count) —')
  for (const name of collections) {
    const n = await countCollection(db, name, orgId || undefined)
    console.log(`  ${name}: ${n == null ? '?' : n.toLocaleString('vi-VN')}`)
  }

  console.log(dryRun ? '\n— Dry-run —' : '\n— Đang xóa —')
  const tAll = Date.now()

  for (const name of collections) {
    const col = db.collection(name)
    const { scanned, deleted } = await deleteQueryInPages(db, col, {
      orgId: orgId || undefined,
      dryRun,
      label: name,
    })
    console.log(
      `  ${name}: ${dryRun ? 'sẽ xóa ~' : 'đã xóa'} ${deleted.toLocaleString('vi-VN')} (scan/ops ${scanned.toLocaleString('vi-VN')})`,
    )
  }

  if (collections.includes('leads') && !orgId) {
    for (const g of ['interactions', 'aiInsightTasks']) {
      const n = await wipeCollectionGroupOrphans(db, g, { dryRun, label: g })
      if (n) console.log(`  collectionGroup/${g}: ${dryRun ? 'còn ~' : 'dọn'} ${n}`)
    }
  }

  console.log(`\n=== XONG (${((Date.now() - tAll) / 1000).toFixed(1)}s) ===`)
  if (dryRun) {
    console.log('Đây chỉ là dry-run. Chạy lại với WIPE_CONFIRM=XOA_HET_DU_LIEU để xóa thật.')
  } else {
    console.log('Đã xóa. users/organizations giữ nguyên (trừ khi WIPE_INCLUDE_USERS=1).')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
