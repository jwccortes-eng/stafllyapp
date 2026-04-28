/**
 * fetchAllPaginated
 * -----------------
 * Generic helper to fetch ALL rows from a Supabase query that would otherwise
 * be silently truncated at the default 1,000-row limit.
 *
 * The caller provides a `buildQuery(from, to)` function that returns a
 * Supabase PostgrestBuilder already filtered/ordered. We page through it
 * using `.range(from, to)` until a short page is returned.
 *
 * IMPORTANT:
 *   - Always include a stable `.order(<col>, { ascending: true })` in the
 *     query you build, otherwise pagination can return duplicates / gaps.
 *   - Default pageSize is 500; increase only if rows are tiny.
 *
 * Returns: { data, error, pages, totalFetched }
 *   - On error, returns whatever was fetched up to that point + the error.
 *   - Never throws.
 */
export interface FetchAllPaginatedResult<T> {
  data: T[];
  error: { message: string } | null;
  pages: number;
  totalFetched: number;
  truncated: boolean; // true if we hit hardLimit before the query was exhausted
}

export interface FetchAllPaginatedOptions {
  pageSize?: number;
  /** Safety cap to avoid runaway loops. Default 50,000 rows. */
  hardLimit?: number;
}

export async function fetchAllPaginated<T = any>(
  buildQuery: (from: number, to: number) => any,
  options: FetchAllPaginatedOptions = {}
): Promise<FetchAllPaginatedResult<T>> {
  const pageSize = options.pageSize ?? 500;
  const hardLimit = options.hardLimit ?? 50_000;

  let from = 0;
  let pages = 0;
  let all: T[] = [];

  while (true) {
    const to = from + pageSize - 1;
    const res = await buildQuery(from, to);

    if (res?.error) {
      return {
        data: all,
        error: { message: res.error.message ?? String(res.error) },
        pages,
        totalFetched: all.length,
        truncated: false,
      };
    }

    const page = (res?.data ?? []) as T[];
    all = all.concat(page);
    pages += 1;

    if (page.length < pageSize) {
      return { data: all, error: null, pages, totalFetched: all.length, truncated: false };
    }

    from += pageSize;

    if (all.length >= hardLimit) {
      // Stop instead of looping forever; signal truncation upstream.
      return { data: all, error: null, pages, totalFetched: all.length, truncated: true };
    }
  }
}
