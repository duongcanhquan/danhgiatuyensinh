import { where, type QueryFilterConstraint } from 'firebase/firestore'

/** Equality constraint for school isolation on flat collections. */
export function orgIdEqualityConstraint(orgId: string): QueryFilterConstraint {
  return where('orgId', '==', orgId)
}
