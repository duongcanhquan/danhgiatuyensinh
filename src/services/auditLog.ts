import { addDoc, collection, Timestamp, type Firestore } from 'firebase/firestore'
import type { AuditLogActionType, UserId } from '../types'
import { FS_COLLECTIONS } from '../types'

export type CommitAuditInput = {
  leadId: string
  actionType: AuditLogActionType
  description: string
  performedBy: UserId
  performedByName: string
  timestamp?: Timestamp
}

export async function commitAuditLog(db: Firestore, input: CommitAuditInput): Promise<void> {
  await addDoc(collection(db, FS_COLLECTIONS.auditLogs), {
    leadId: input.leadId,
    actionType: input.actionType,
    description: input.description,
    performedBy: input.performedBy,
    performedByName: input.performedByName.trim() || input.performedBy,
    timestamp: input.timestamp ?? Timestamp.now(),
  })
}
