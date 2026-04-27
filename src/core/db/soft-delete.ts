/**
 * Type-safe soft-delete escape hatch.
 *
 * The Prisma middleware in `./index.ts` automatically filters
 * `deleted_at IS NULL` for soft-delete models on read queries. To opt
 * out of that filter (e.g. for Trash perspectives or hard-delete flows),
 * wrap the where clause with `withDeleted()` — the middleware strips the
 * marker before forwarding the query to Prisma.
 *
 * Returning the original generic type keeps callers fully type-safe; the
 * runtime marker is added via a single localized cast so call sites do
 * not need ad-hoc `as any` annotations.
 */

export const INCLUDE_DELETED_KEY = "includeDeleted";

export function withDeleted<T extends object>(where: T): T {
  // The marker is a runtime-only field that the soft-delete middleware
  // strips before the query reaches Prisma. The cast is intentional and
  // confined to this single helper.
  return Object.assign({}, where, { [INCLUDE_DELETED_KEY]: true }) as T;
}
