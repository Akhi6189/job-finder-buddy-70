export const MAX_JOB_LIMIT = 100000;
export const POSTGREST_PAGE_SIZE = 1000;

export interface FetchAllRowsOptions<T> {
  maxLimit?: number;
  pageSize?: number;
  keyExtractor?: (item: T) => string | number | null | undefined;
}

/**
 * Fetches all matching rows in chunks of 1,000 (PostgREST default server-side cap)
 * up to the requested maxLimit (default 100,000).
 *
 * Automatically deduplicates items across chunk boundaries by `id` (or custom key)
 * to guard against non-deterministic row shifts or live changes during chunked paging.
 */
export async function fetchAllRows<T>(
  fetchChunk: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }>,
  maxLimitOrOptions?: number | FetchAllRowsOptions<T>,
  pageSizeParam?: number,
  keyExtractorParam?: (item: T) => string | number | null | undefined,
): Promise<T[]> {
  let maxLimit = MAX_JOB_LIMIT;
  let pageSize = POSTGREST_PAGE_SIZE;
  let customExtractor: ((item: T) => string | number | null | undefined) | undefined =
    keyExtractorParam;

  if (typeof maxLimitOrOptions === "number") {
    maxLimit = maxLimitOrOptions;
    if (pageSizeParam !== undefined) pageSize = pageSizeParam;
  } else if (maxLimitOrOptions && typeof maxLimitOrOptions === "object") {
    if (maxLimitOrOptions.maxLimit !== undefined) maxLimit = maxLimitOrOptions.maxLimit;
    if (maxLimitOrOptions.pageSize !== undefined) pageSize = maxLimitOrOptions.pageSize;
    if (maxLimitOrOptions.keyExtractor !== undefined) {
      customExtractor = maxLimitOrOptions.keyExtractor;
    }
  }

  const getKey = (item: T): string | number | null | undefined => {
    if (customExtractor) return customExtractor(item);
    if (item && typeof item === "object" && "id" in item) {
      return (item as { id: string | number }).id;
    }
    return undefined;
  };

  const all: T[] = [];
  const seenKeys = new Set<string | number>();
  let from = 0;

  while (all.length < maxLimit) {
    const to = Math.min(from + pageSize - 1, maxLimit - 1);
    const { data, error } = await fetchChunk(from, to);
    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const item of data) {
      const key = getKey(item);
      if (key !== undefined && key !== null && key !== "") {
        if (seenKeys.has(key)) {
          continue;
        }
        seenKeys.add(key);
      }
      all.push(item);
      if (all.length >= maxLimit) break;
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return all;
}
