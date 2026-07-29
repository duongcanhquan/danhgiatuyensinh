import { addDoc, collection, Timestamp, type Firestore } from 'firebase/firestore'
import { FS_COLLECTIONS } from '../types'
import {
  buildPlatformAuditRecord,
  type PlatformAuditAction,
} from '../tenancy/platformOps'

export async function commitPlatformAudit(
  db: Firestore,
  input: {
    action: PlatformAuditAction
    orgId: string
    orgName: string
    performedBy: string
    performedByName?: string
    detail?: string
  },
): Promise<void> {
  const record = buildPlatformAuditRecord(input)
  await addDoc(collection(db, FS_COLLECTIONS.platformAuditLogs), {
    ...record,
    timestamp: Timestamp.now(),
  })
}
