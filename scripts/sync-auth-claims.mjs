#!/usr/bin/env node
/**
 * Phase 4 — đồng bộ Firebase Auth custom claims từ users/{uid}
 * (role, orgId, platform).
 *
 * Dry-run mặc định. Ghi thật:
 *   APPLY=1 GOOGLE_APPLICATION_CREDENTIALS=./secrets/serviceAccount.json node scripts/sync-auth-claims.mjs
 *
 * Tuỳ chọn: FIRESTORE_DATABASE_ID=warmlist
 */
import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

function loadAdmin() {
  try {
    return require('firebase-admin')
  } catch {
    console.error('Cần firebase-admin. Chạy npm ci trước.')
    process.exit(1)
  }
}

const DEFAULT_ORG_ID = 'vietmy'
const USER_ROLES = ['super_admin', 'admin', 'team_lead', 'counselor', 'ctv', 'accountant']

function normalizeUserRole(role) {
  if (!role) return 'counselor'
  if (role === 'head_of_profession' || role === 'head_of_department') return 'team_lead'
  if (USER_ROLES.includes(role)) return role
  return 'counselor'
}

function buildAuthCustomClaims(input) {
  const role = normalizeUserRole(String(input.role ?? 'counselor'))
  if (role === 'super_admin') return { role: 'super_admin', orgId: '', platform: true }
  const org = String(input.orgId ?? '').trim()
  return { role, orgId: org || DEFAULT_ORG_ID, platform: false }
}

function needsUpdate(current, desired) {
  if (!current) return true
  return (
    String(current.role ?? '') !== desired.role ||
    String(current.orgId ?? '') !== desired.orgId ||
    Boolean(current.platform) !== desired.platform
  )
}

const apply = process.env.APPLY === '1'
const databaseId = (process.env.FIRESTORE_DATABASE_ID || 'warmlist').trim()

async function main() {
  const admin = loadAdmin()
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (!credPath || !existsSync(credPath)) {
    console.log('[claims] Thiếu GOOGLE_APPLICATION_CREDENTIALS — chỉ in kế hoạch.')
    console.log(JSON.stringify({ apply, databaseId, mode: 'plan-only' }, null, 2))
    return
  }

  const sa = JSON.parse(readFileSync(credPath, 'utf8'))
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(sa) })
  }
  const db = admin.firestore()
  db.settings({ databaseId })
  const auth = admin.auth()

  const snap = await db.collection('users').get()
  let checked = 0
  let wouldUpdate = 0
  let updated = 0
  let missingAuth = 0

  for (const doc of snap.docs) {
    checked += 1
    const data = doc.data() || {}
    const desired = buildAuthCustomClaims({ role: data.role, orgId: data.orgId })
    try {
      const user = await auth.getUser(doc.id)
      const current = user.customClaims || {}
      if (!needsUpdate(current, desired)) continue
      wouldUpdate += 1
      if (apply) {
        await auth.setCustomUserClaims(doc.id, {
          ...current,
          role: desired.role,
          orgId: desired.orgId,
          platform: desired.platform,
        })
        updated += 1
      }
    } catch (e) {
      if (e?.code === 'auth/user-not-found') {
        missingAuth += 1
        continue
      }
      console.warn('[claims] uid', doc.id, e)
    }
  }

  console.log(
    JSON.stringify(
      { apply, databaseId, checked, wouldUpdate, updated, missingAuth },
      null,
      2,
    ),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
