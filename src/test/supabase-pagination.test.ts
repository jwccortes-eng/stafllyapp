import { describe, it, expect } from "vitest";
import { fetchAllPaginated } from "@/lib/supabase-pagination";

/**
 * Simulates a Supabase PostgrestBuilder result for a given dataset.
 * The "query" is just (from, to) -> slice + page metadata.
 */
function makeFakeQuery<T>(rows: T[], opts: { failAtPage?: number } = {}) {
  let calls = 0;
  return (from: number, to: number) => {
    calls += 1;
    if (opts.failAtPage && calls === opts.failAtPage) {
      return Promise.resolve({ data: null, error: { message: "boom" } });
    }
    return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
  };
}

describe("fetchAllPaginated", () => {
  it("returns all rows when total fits in a single page", async () => {
    const rows = Array.from({ length: 42 }, (_, i) => ({ id: i }));
    const result = await fetchAllPaginated(makeFakeQuery(rows), { pageSize: 500 });
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(42);
    expect(result.pages).toBe(1);
    expect(result.truncated).toBe(false);
  });

  it("paginates beyond the 1,000-row implicit Supabase cap", async () => {
    // 1,300 rows = the exact class of bug we are eliminating.
    const rows = Array.from({ length: 1_300 }, (_, i) => ({ id: i }));
    const result = await fetchAllPaginated(makeFakeQuery(rows), { pageSize: 500 });
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1_300);
    expect(result.pages).toBe(3); // 500 + 500 + 300
    // Sanity: ids preserved end-to-end.
    expect((result.data[0] as any).id).toBe(0);
    expect((result.data[1_299] as any).id).toBe(1_299);
  });

  it("stops at hardLimit and reports truncated=true", async () => {
    const rows = Array.from({ length: 5_000 }, (_, i) => ({ id: i }));
    const result = await fetchAllPaginated(makeFakeQuery(rows), { pageSize: 500, hardLimit: 1_000 });
    expect(result.truncated).toBe(true);
    expect(result.data.length).toBeGreaterThanOrEqual(1_000);
  });

  it("returns the error and partial data without throwing", async () => {
    const rows = Array.from({ length: 1_500 }, (_, i) => ({ id: i }));
    const result = await fetchAllPaginated(makeFakeQuery(rows, { failAtPage: 2 }), { pageSize: 500 });
    expect(result.error?.message).toBe("boom");
    expect(result.data).toHaveLength(500); // first page survived
  });

  it("returns empty array (not undefined) when there are no rows", async () => {
    const result = await fetchAllPaginated(makeFakeQuery([]), { pageSize: 500 });
    expect(result.error).toBeNull();
    expect(result.data).toEqual([]);
    expect(result.pages).toBe(1);
  });
});
