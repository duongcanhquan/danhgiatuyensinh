export const ACTIVE_ORG_STORAGE_KEY = 'vietmy.activeOrgId.v1'

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export function readStoredActiveOrgId(storage: StorageLike | null | undefined = globalThis.localStorage): string | null {
  if (!storage) return null
  try {
    const v = storage.getItem(ACTIVE_ORG_STORAGE_KEY)?.trim()
    return v || null
  } catch {
    return null
  }
}

export function writeStoredActiveOrgId(
  orgId: string,
  storage: StorageLike | null | undefined = globalThis.localStorage,
): void {
  if (!storage) return
  try {
    const v = orgId.trim()
    if (!v) storage.removeItem(ACTIVE_ORG_STORAGE_KEY)
    else storage.setItem(ACTIVE_ORG_STORAGE_KEY, v)
  } catch {
    /* private mode */
  }
}
