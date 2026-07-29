import {
  collection,
  getCountFromServer,
  query,
  Timestamp,
  where,
  type Firestore,
} from 'firebase/firestore'
import { FS_COLLECTIONS } from '../types'
import { orgHealthBand, orgHealthBandLabel, type OrgHealthBand } from '../tenancy/platformOps'

const MS_7D = 7 * 24 * 60 * 60 * 1000

export type OrgLeadHealth = {
  orgId: string
  leadCount7d: number
  band: OrgHealthBand
  bandLabel: string
}

export async function fetchOrgLeadHealth7d(db: Firestore, orgId: string): Promise<OrgLeadHealth> {
  const id = orgId.trim()
  const since = Timestamp.fromMillis(Date.now() - MS_7D)
  const qy = query(
    collection(db, FS_COLLECTIONS.leads),
    where('orgId', '==', id),
    where('updatedAt', '>=', since),
  )
  let leadCount7d = 0
  try {
    leadCount7d = (await getCountFromServer(qy)).data().count
  } catch (e) {
    console.warn('[fetchOrgLeadHealth7d]', id, e)
  }
  const band = orgHealthBand(leadCount7d)
  return { orgId: id, leadCount7d, band, bandLabel: orgHealthBandLabel(band) }
}
