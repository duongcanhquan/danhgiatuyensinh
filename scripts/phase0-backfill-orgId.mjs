#!/usr/bin/env node
/**
 * Phase 0 backfill — gắn orgId=vietmy và copy scoringAux → orgSettings/vietmy/settings/*
 *
 * Dry-run mặc định (không ghi). Để ghi thật:
 *   APPLY=1 GOOGLE_APPLICATION_CREDENTIALS=./secrets/serviceAccount.json node scripts/phase0-backfill-orgId.mjs
 *
 * Tuỳ chọn:
 *   FIRESTORE_DATABASE_ID=warmlist
 *   ORG_ID=vietmy
 *   COLLECTIONS=leads,users   (mặc định: leads,users)
 */
import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

function loadAdmin() {
  try {
    return require('firebase-admin')
  } catch {
    console.error('Cần firebase-admin (devDependency). Chạy npm ci trước.')
    process.exit(1)
  }
}

const apply = process.env.APPLY === '1'
const orgId = (process.env.ORG_ID || 'vietmy').trim()
const databaseId = (process.env.FIRESTORE_DATABASE_ID || 'warmlist').trim()
const collections = (process.env.COLLECTIONS || 'leads,users')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const scoringAuxDocs = [
  'kpiV2Config',
  'kpiEvaluationConfig',
  'omicallIntegration',
  'publicRegistrationConfig',
  'infoScoreConfig',
  'leadClassificationConfig',
  'callSessionChips',
  'tvvSignalDefinitions',
  'orgAiIntegration',
  'systemLeadCodeCounters',
  'studentCodeCounters',
]

async function main() {
  const admin = loadAdmin()
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (!credPath || !existsSync(credPath)) {
    console.log('[phase0] Thiếu GOOGLE_APPLICATION_CREDENTIALS — chỉ in kế hoạch (dry).')
    console.log(JSON.stringify({ apply, orgId, databaseId, collections, scoringAuxDocs, mode: 'plan-only' }, null, 2))
    console.log('[phase0] Khi có service account: APPLY=1 GOOGLE_APPLICATION_CREDENTIALS=... node scripts/phase0-backfill-orgId.mjs')
    return
  }

  const sa = JSON.parse(readFileSync(credPath, 'utf8'))
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(sa) })
  }
  const db = admin.firestore()
  db.settings({ databaseId })

  console.log(`[phase0] apply=${apply} orgId=${orgId} db=${databaseId}`)

  // organizations doc
  const orgRef = db.collection('organizations').doc(orgId)
  if (apply) {
    await orgRef.set(
      {
        id: orgId,
        name: orgId === 'vietmy' ? 'Cao đẳng Việt Mỹ' : orgId,
        slug: orgId,
        status: 'active',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    )
    console.log('[phase0] upsert organizations/' + orgId)
  } else {
    console.log('[phase0] would upsert organizations/' + orgId)
  }

  // copy scoringAux → orgSettings/{orgId}/settings/{docId}
  for (const docId of scoringAuxDocs) {
    const legacy = await db.collection('scoringAux').doc(docId).get()
    if (!legacy.exists) {
      console.log(`[phase0] skip missing scoringAux/${docId}`)
      continue
    }
    const target = db.collection('orgSettings').doc(orgId).collection('settings').doc(docId)
    if (apply) {
      await target.set({ ...legacy.data(), orgId }, { merge: true })
      console.log(`[phase0] copied scoringAux/${docId} → orgSettings/${orgId}/settings/${docId}`)
    } else {
      console.log(`[phase0] would copy scoringAux/${docId}`)
    }
  }

  // backfill orgId on collections
  for (const col of collections) {
    const snap = await db.collection(col).get()
    let would = 0
    let updated = 0
    const batchSize = 400
    let batch = db.batch()
    let ops = 0
    for (const doc of snap.docs) {
      const data = doc.data() || {}
      if (data.orgId) continue
      would++
      if (!apply) continue
      batch.update(doc.ref, { orgId })
      ops++
      updated++
      if (ops >= batchSize) {
        await batch.commit()
        batch = db.batch()
        ops = 0
      }
    }
    if (apply && ops) await batch.commit()
    console.log(`[phase0] ${col}: missing orgId=${would}${apply ? `, updated=${updated}` : ' (dry-run)'}`)
  }

  console.log(apply ? '[phase0] DONE (applied)' : '[phase0] DONE (dry-run — set APPLY=1 to write)')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
