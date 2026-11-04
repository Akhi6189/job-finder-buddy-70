import { describe, it, expect } from "vitest";
import {
  querySearchApiForCanonicalUrl,
  updateCompanyWithCanonicalUrl,
  autoUpdateCompaniesWithGenericUrls,
} from "@/lib/canonical-career-search.server";
import { isGenericSearchUrl, isJobAggregatorUrl } from "@/lib/validate-career-url.server";

describe("Canonical Career Search Backend Service", () => {
  describe("querySearchApiForCanonicalUrl", () => {
    it("returns verified official canonical URL for directory companies", async () => {
      const res = await querySearchApiForCanonicalUrl("Scopely");
      expect(res.status).toBe("verified_canonical");
      expect(res.canonicalUrl).toBe("https://job-boards.greenhouse.io/scopely");
      expect(res.source).toBe("directory");
      expect(isGenericSearchUrl(res.canonicalUrl!)).toBe(false);
    });

    it("returns verified canonical URL for Atlassian", async () => {
      const res = await querySearchApiForCanonicalUrl("Atlassian");
      expect(res.status).toBe("verified_canonical");
      expect(res.canonicalUrl).toBe(
        "https://www.atlassian.com/company/careers/all-jobs?location=India",
      );
      expect(isGenericSearchUrl(res.canonicalUrl!)).toBe(false);
    });

    it("returns verified canonical URL for Postman", async () => {
      const res = await querySearchApiForCanonicalUrl("Postman");
      expect(res.status).toBe("verified_canonical");
      expect(res.canonicalUrl).toBe("https://www.postman.com/company/careers/open-positions/");
      expect(isGenericSearchUrl(res.canonicalUrl!)).toBe(false);
    });

    it("never returns a generic search URL or aggregator", async () => {
      const res = await querySearchApiForCanonicalUrl("Veeam");
      if (res.canonicalUrl) {
        expect(isGenericSearchUrl(res.canonicalUrl)).toBe(false);
        expect(isJobAggregatorUrl(res.canonicalUrl)).toBe(false);
        expect(res.canonicalUrl).toMatch(/^https?:\/\//i);
      }
    });

    it("returns verified canonical URL for National Instruments (NI)", async () => {
      const res = await querySearchApiForCanonicalUrl("National Instruments (NI)");
      expect(res.status).toBe("verified_canonical");
      expect(res.canonicalUrl).toBe("https://www.ni.com/en/about-ni/careers.html");
      expect(isGenericSearchUrl(res.canonicalUrl!)).toBe(false);
    });

    it("returns verified canonical URL for Tata Consultancy Services (TCS)", async () => {
      const res = await querySearchApiForCanonicalUrl("Tata Consultancy Services (TCS)");
      expect(res.status).toBe("verified_canonical");
      expect(res.canonicalUrl).toBe("https://www.tcs.com/careers");
      expect(isGenericSearchUrl(res.canonicalUrl!)).toBe(false);
    });

    it("returns verified canonical URL for AMD", async () => {
      const res = await querySearchApiForCanonicalUrl("AMD");
      expect(res.status).toBe("verified_canonical");
      expect(res.canonicalUrl).toBe("https://careers.amd.com/");
      expect(isGenericSearchUrl(res.canonicalUrl!)).toBe(false);
    });

    it("handles empty or whitespace company names gracefully", async () => {
      const res = await querySearchApiForCanonicalUrl("   ");
      expect(res.status).toBe("not_found");
      expect(res.canonicalUrl).toBeNull();
    });
  });

  describe("updateCompanyWithCanonicalUrl and autoUpdateCompaniesWithGenericUrls", () => {
    // Mock Supabase client
    const createMockDb = (
      initialCompanies: Array<{ id: string; name: string; careers_url: string | null }>,
    ) => {
      const dbCompanies = [...initialCompanies];
      const trackedErrors: Record<string, string | null> = {};

      return {
        from: (table: string) => {
          if (table === "companies") {
            return {
              select: () => ({
                eq: (col: string, val: string) => ({
                  single: async () => {
                    const found = dbCompanies.find((c) => c.id === val);
                    return { data: found || null, error: found ? null : new Error("Not found") };
                  },
                }),
                in: (col: string, vals: string[]) => ({
                  data: dbCompanies.filter((c) => vals.includes(c.id)),
                  error: null,
                }),
                // For select all
                data: dbCompanies,
                error: null,
              }),
              update: (fields: Partial<{ careers_url: string | null }>) => ({
                eq: async (col: string, val: string) => {
                  const idx = dbCompanies.findIndex((c) => c.id === val);
                  if (idx >= 0) {
                    dbCompanies[idx] = { ...dbCompanies[idx]!, ...fields };
                  }
                  return { error: null };
                },
              }),
            };
          }
          if (table === "tracked_companies") {
            return {
              update: (fields: { last_error: string | null }) => ({
                eq: async (col: string, val: string) => {
                  trackedErrors[val] = fields.last_error;
                  return { error: null };
                },
              }),
            };
          }
          throw new Error(`Unhandled table: ${table}`);
        },
        _getCompanies: () => dbCompanies,
      };
    };

    it("replaces a generic Google search URL with the verified canonical URL in the database", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockDb: any = createMockDb([
        {
          id: "comp-1",
          name: "Scopely",
          careers_url: "https://www.google.com/search?q=scopely+careers",
        },
      ]);

      const result = await updateCompanyWithCanonicalUrl(mockDb, "comp-1", "Scopely");
      expect(result.updated).toBe(true);
      expect(result.wasGenericSearch).toBe(true);
      expect(result.oldUrl).toBe("https://www.google.com/search?q=scopely+careers");
      expect(result.newUrl).toBe("https://job-boards.greenhouse.io/scopely");

      // Verify the record in the database was updated
      const updatedList = mockDb._getCompanies();
      expect(updatedList[0].careers_url).toBe("https://job-boards.greenhouse.io/scopely");
    });

    it("clears a corrupted Google search URL if no canonical URL is found", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockDb: any = createMockDb([
        {
          id: "comp-2",
          name: "TotallyFakeCompany123NonExistent",
          careers_url: "https://www.google.com/search?q=fake+company+jobs",
        },
      ]);

      const result = await updateCompanyWithCanonicalUrl(
        mockDb,
        "comp-2",
        "TotallyFakeCompany123NonExistent",
      );
      expect(result.updated).toBe(true);
      expect(result.wasGenericSearch).toBe(true);
      expect(result.newUrl).toBeNull();

      // Corrupted search query was removed from DB
      const updatedList = mockDb._getCompanies();
      expect(updatedList[0].careers_url).toBeNull();
    });

    it("batch updates all companies with generic search URLs", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockDb: any = createMockDb([
        {
          id: "comp-10",
          name: "Atlassian",
          careers_url: "https://www.google.com/search?q=atlassian+careers",
        },
        {
          id: "comp-20",
          name: "Postman",
          careers_url: "https://bing.com/search?q=postman+jobs",
        },
        {
          id: "comp-30",
          name: "Swiggy",
          careers_url: "https://careers.swiggy.com/", // already valid direct portal
        },
        {
          id: "comp-40",
          name: "AMD",
          careers_url: "https://jobs.amd.com/", // outdated dead host
        },
      ]);

      const summary = await autoUpdateCompaniesWithGenericUrls(mockDb);
      expect(summary.totalProcessed).toBe(4);
      expect(summary.updatedCount).toBe(3);

      const dbComps = mockDb._getCompanies();
      // Atlassian updated
      expect(
        dbComps.find(
          (c: { id: string; name: string; careers_url: string | null }) => c.name === "Atlassian",
        )?.careers_url,
      ).toBe("https://www.atlassian.com/company/careers/all-jobs?location=India");
      // Postman updated
      expect(
        dbComps.find(
          (c: { id: string; name: string; careers_url: string | null }) => c.name === "Postman",
        )?.careers_url,
      ).toBe("https://www.postman.com/company/careers/open-positions/");
      // Swiggy left intact as it was already valid
      expect(
        dbComps.find(
          (c: { id: string; name: string; careers_url: string | null }) => c.name === "Swiggy",
        )?.careers_url,
      ).toBe("https://careers.swiggy.com/");
      // AMD updated from dead jobs.amd.com to verified careers.amd.com
      expect(
        dbComps.find(
          (c: { id: string; name: string; careers_url: string | null }) => c.name === "AMD",
        )?.careers_url,
      ).toBe("https://careers.amd.com/");
    });
  });
});
