import { describe, it, expect } from "vitest";
import {
  isGenericSearchUrl,
  isJobAggregatorUrl,
  validateCareerUrl,
  resolveDirectCareerUrl,
  getVerifiedPortalForName,
} from "../lib/validate-career-url.server";

describe("Career URL Validation & Flagging Service", () => {
  describe("isGenericSearchUrl", () => {
    it("flags standard Google search queries", () => {
      expect(isGenericSearchUrl("https://www.google.com/search?q=scopely+careers+jobs")).toBe(true);
      expect(isGenericSearchUrl("https://google.com/search?q=sdet+jobs")).toBe(true);
      expect(isGenericSearchUrl("http://google.co.in/search?q=atlassian+careers")).toBe(true);
      expect(isGenericSearchUrl("https://www.google.co.uk/search?q=test")).toBe(true);
    });

    it("flags Google redirect URLs", () => {
      expect(
        isGenericSearchUrl("https://www.google.com/url?sa=t&url=http%3A%2F%2Fexample.com"),
      ).toBe(true);
    });

    it("flags Bing, Yahoo, DuckDuckGo, and other search engines", () => {
      expect(isGenericSearchUrl("https://www.bing.com/search?q=swiggy+careers")).toBe(true);
      expect(isGenericSearchUrl("https://search.yahoo.com/search?p=cisco+jobs")).toBe(true);
      expect(isGenericSearchUrl("https://duckduckgo.com/?q=razorpay+careers")).toBe(true);
      expect(isGenericSearchUrl("https://www.baidu.com/s?wd=jobs")).toBe(true);
    });

    it("does not flag direct company career sites or ATS portals", () => {
      expect(isGenericSearchUrl("https://job-boards.greenhouse.io/scopely")).toBe(false);
      expect(isGenericSearchUrl("https://jobs.lever.co/paytm")).toBe(false);
      expect(isGenericSearchUrl("https://careers.google.com/jobs/results/")).toBe(false);
      expect(isGenericSearchUrl("https://www.atlassian.com/company/careers")).toBe(false);
      expect(isGenericSearchUrl("https://postman.com/careers")).toBe(false);
    });
  });

  describe("isJobAggregatorUrl", () => {
    it("flags generic aggregator search links", () => {
      expect(isJobAggregatorUrl("https://www.indeed.com/jobs?q=qa+engineer")).toBe(true);
      expect(isJobAggregatorUrl("https://in.indeed.com/jobs?q=sdet")).toBe(true);
      expect(isJobAggregatorUrl("https://www.simplyhired.com/search?q=automation")).toBe(true);
      expect(isJobAggregatorUrl("https://www.ziprecruiter.com/jobs-search?search=qa")).toBe(true);
    });

    it("does not flag authentic company ATS links", () => {
      expect(isJobAggregatorUrl("https://job-boards.greenhouse.io/scopely")).toBe(false);
      expect(isJobAggregatorUrl("https://jobs.lever.co/paytm")).toBe(false);
    });
  });

  describe("validateCareerUrl", () => {
    it("flags Google search URL with detailed reason and suggests verified portal if known", async () => {
      const result = await validateCareerUrl(
        "https://www.google.com/search?q=scopely+careers",
        "Scopely",
      );

      expect(result.isValid).toBe(false);
      expect(result.isGenericSearch).toBe(true);
      expect(result.status).toBe("generic_search");
      expect(result.reason).toContain("Flagged: URL is a generic Google search result");
      expect(result.suggestedUrl).toBe("https://job-boards.greenhouse.io/scopely");
    });

    it("flags generic job aggregator query URLs", async () => {
      const result = await validateCareerUrl("https://www.indeed.com/jobs?q=postman+qa", "Postman");

      expect(result.isValid).toBe(false);
      expect(result.isAggregator).toBe(true);
      expect(result.status).toBe("generic_aggregator");
      expect(result.reason).toContain("third-party job aggregator query");
      expect(result.suggestedUrl).toBe("https://www.postman.com/company/careers/open-positions/");
    });

    it("validates authentic Greenhouse ATS URL", async () => {
      const result = await validateCareerUrl(
        "https://job-boards.greenhouse.io/scopely?utm_source=test",
      );

      expect(result.isValid).toBe(true);
      expect(result.status).toBe("valid_ats");
      expect(result.detectedAts).toBe("Greenhouse");
      expect(result.isGenericSearch).toBe(false);
      // Normalized url strips tracking params
      expect(result.normalizedUrl).toBe("https://job-boards.greenhouse.io/scopely");
    });

    it("validates authentic Lever ATS URL", async () => {
      const result = await validateCareerUrl("https://jobs.lever.co/paytm");

      expect(result.isValid).toBe(true);
      expect(result.status).toBe("valid_ats");
      expect(result.detectedAts).toBe("Lever");
    });

    it("validates authentic company career domain", async () => {
      const result = await validateCareerUrl("https://careers.swiggy.com/");

      expect(result.isValid).toBe(true);
      expect(result.status).toBe("valid_company_portal");
    });

    it("flags invalid protocols or missing URLs", async () => {
      const emptyResult = await validateCareerUrl("");
      expect(emptyResult.isValid).toBe(false);
      expect(emptyResult.status).toBe("empty");

      const noProtocol = await validateCareerUrl("company.com/careers");
      expect(noProtocol.isValid).toBe(false);
      expect(noProtocol.status).toBe("invalid_protocol");
    });
  });

  describe("resolveDirectCareerUrl", () => {
    it("resolves verified portal for companies in directory", async () => {
      const resolved = await resolveDirectCareerUrl("Scopely");
      expect(resolved.isValid).toBe(true);
      expect(resolved.url).toBe("https://job-boards.greenhouse.io/scopely");
      expect(resolved.source).toBe("directory");
    });

    it("resolves verified portal when candidate URL was a Google search URL", async () => {
      const resolved = await resolveDirectCareerUrl(
        "Atlassian",
        "https://www.google.com/search?q=atlassian+careers",
      );
      expect(resolved.isValid).toBe(true);
      expect(resolved.url).toBe(
        "https://www.atlassian.com/company/careers/all-jobs?location=India",
      );
      expect(resolved.source).toBe("directory");
    });

    it("never returns a Google search URL", async () => {
      const resolved = await resolveDirectCareerUrl(
        "Unknown Stealth Startup XYZ 12345",
        "https://www.google.com/search?q=stealth+startup+jobs",
      );
      // Either valid or null, but NEVER a google search URL!
      if (resolved.url) {
        expect(isGenericSearchUrl(resolved.url)).toBe(false);
      } else {
        expect(resolved.isValid).toBe(false);
        expect(resolved.url).toBeNull();
      }
    }, 15000);
  });

  describe("getVerifiedPortalForName", () => {
    it("handles case-insensitivity and punctuation", () => {
      expect(getVerifiedPortalForName("scopely")).toBe("https://job-boards.greenhouse.io/scopely");
      expect(getVerifiedPortalForName("SCOPELY")).toBe("https://job-boards.greenhouse.io/scopely");
      expect(getVerifiedPortalForName("Skillz Inc")).toBe(
        "https://job-boards.greenhouse.io/skillzinc",
      );
      expect(getVerifiedPortalForName("Postman")).toBe(
        "https://www.postman.com/company/careers/open-positions/",
      );
      expect(getVerifiedPortalForName("National Instruments (NI)")).toBe(
        "https://www.ni.com/en/about-ni/careers.html",
      );
      expect(getVerifiedPortalForName("National Instruments")).toBe(
        "https://www.ni.com/en/about-ni/careers.html",
      );
      expect(getVerifiedPortalForName("NI")).toBe("https://www.ni.com/en/about-ni/careers.html");
      expect(getVerifiedPortalForName("Tata Consultancy Services (TCS)")).toBe(
        "https://www.tcs.com/careers",
      );
      expect(getVerifiedPortalForName("AMD")).toBe("https://careers.amd.com/");
      expect(getVerifiedPortalForName("amd")).toBe("https://careers.amd.com/");
      expect(getVerifiedPortalForName("Advanced Micro Devices (AMD)")).toBe(
        "https://careers.amd.com/",
      );
    });
  });
});
