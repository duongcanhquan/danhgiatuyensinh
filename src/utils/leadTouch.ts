import { Timestamp } from 'firebase/firestore'

/** Patch to merge on lead updates after a meaningful user/counselor action. */
export function leadTouchPatch(): { lastTouchedAt: Timestamp; updatedAt: Timestamp } {
  const t = Timestamp.now()
  return { lastTouchedAt: t, updatedAt: t }
}
