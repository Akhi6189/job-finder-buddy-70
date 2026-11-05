import { describe, it, expect } from "vitest";
import { fetchAllRows, MAX_JOB_LIMIT, POSTGREST_PAGE_SIZE } from "@/lib/supabase-pagination";

describe("fetchAllRows pagination utility", () => {
  it("has MAX_JOB_LIMIT set to 100000", () => {
    expect(MAX_JOB_LIMIT).toBe(100000);
    expect(POSTGREST_PAGE_SIZE).toBe(1000);
  });

  it("fetches a single page when count is less than page size", async () => {
    const mockData = Array.from({ length: 150 }, (_, i) => ({ id: `job-${i}` }));

    let callCount = 0;
    const fetchChunk = async (from: number, to: number) => {
      callCount++;
      return {
        data: mockData.slice(from, to + 1),
        error: null,
      };
    };

    const results = await fetchAllRows(fetchChunk, 100000, 1000);
    expect(results).toHaveLength(150);
    expect(callCount).toBe(1);
  });

  it("pages through multiple chunks when count exceeds 1000 to overcome PostgREST default limit", async () => {
    // 2,450 total rows
    const mockData = Array.from({ length: 2450 }, (_, i) => ({ id: `job-${i}` }));

    let callCount = 0;
    const ranges: [number, number][] = [];

    const fetchChunk = async (from: number, to: number) => {
      callCount++;
      ranges.push([from, to]);
      return {
        data: mockData.slice(from, to + 1),
        error: null,
      };
    };

    const results = await fetchAllRows(fetchChunk, 100000, 1000);
    expect(results).toHaveLength(2450);
    expect(callCount).toBe(3); // 0-999 (1000), 1000-1999 (1000), 2000-2999 (450)
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("respects maxLimit when data exceeds maxLimit", async () => {
    const mockData = Array.from({ length: 5000 }, (_, i) => ({ id: `job-${i}` }));

    const fetchChunk = async (from: number, to: number) => {
      return {
        data: mockData.slice(from, to + 1),
        error: null,
      };
    };

    const results = await fetchAllRows(fetchChunk, 2500, 1000);
    expect(results).toHaveLength(2500);
  });

  it("handles empty result sets gracefully", async () => {
    const fetchChunk = async () => ({ data: [], error: null });
    const results = await fetchAllRows(fetchChunk, 100000, 1000);
    expect(results).toEqual([]);
  });

  it("propagates errors thrown by fetchChunk", async () => {
    const fetchChunk = async () => ({
      data: null,
      error: new Error("Network failure"),
    });

    await expect(fetchAllRows(fetchChunk, 100000, 1000)).rejects.toThrow("Network failure");
  });

  it("automatically deduplicates rows that overlap across chunk boundaries", async () => {
    // Simulate chunk 1 returning items 0-999, and chunk 2 returning items 995-1200 (5 overlapping items)
    const chunk1 = Array.from({ length: 1000 }, (_, i) => ({ id: `job-${i}` }));
    const chunk2 = Array.from({ length: 200 }, (_, i) => ({ id: `job-${i + 995}` }));

    let callCount = 0;
    const fetchChunk = async (from: number) => {
      callCount++;
      if (from === 0) return { data: chunk1, error: null };
      return { data: chunk2, error: null };
    };

    const results = await fetchAllRows(fetchChunk, 100000, 1000);
    // Should have 1000 + 200 - 5 = 1195 unique items
    expect(results).toHaveLength(1195);
    const ids = new Set(results.map((r) => r.id));
    expect(ids.size).toBe(1195);
  });

  it("supports options object with custom keyExtractor", async () => {
    const chunk1 = [{ uuid: "a" }, { uuid: "b" }];
    const chunk2 = [{ uuid: "b" }, { uuid: "c" }];

    let call = 0;
    const fetchChunk = async () => {
      call++;
      if (call === 1) return { data: chunk1, error: null };
      return { data: chunk2, error: null };
    };

    const results = await fetchAllRows(fetchChunk, {
      maxLimit: 100,
      pageSize: 2,
      keyExtractor: (item) => item.uuid,
    });

    expect(results).toEqual([{ uuid: "a" }, { uuid: "b" }, { uuid: "c" }]);
  });
});
