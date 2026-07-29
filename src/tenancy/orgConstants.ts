/** First production school tenant — Phase 0 backfill target. */
export const DEFAULT_ORG_ID = 'vietmy' as const

/** Public registration slug for default org (`/dang-ky/vietmy`). */
export const DEFAULT_ORG_SLUG = 'vietmy' as const

/**
 * Normalize org slug for URLs: lowercase, trim, allow [a-z0-9_-].
 * Empty → default slug (safe redirect target).
 */
export function normalizeOrgSlug(raw: string | null | undefined): string {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return s || DEFAULT_ORG_SLUG
}
