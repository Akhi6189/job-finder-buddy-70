import { describe, it, expect } from "vitest";
import { getCareerUrlStatus } from "@/lib/career-url-helper";

describe("Career URL Helper & Indicator Classification", () => {
  it("identifies verified canonical ATS portals", () => {
    const greenhouse = getCareerUrlStatus("https://job-boards.greenhouse.io/scopely");
    expect(greenhouse.isCanonical).toBe(true);
    expect(greenhouse.isSearch).toBe(false);
    expect(greenhouse.kind).toBe("canonical_ats");
    expect(greenhouse.detectedAts).toBe("Greenhouse");
    expect(greenhouse.badgeLabel).toBe("Greenhouse · Canonical");

    const lever = getCareerUrlStatus("https://jobs.lever.co/paytm");
    expect(lever.isCanonical).toBe(true);
    expect(lever.detectedAts).toBe("Lever");

    const workday = getCareerUrlStatus(
      "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite",
    );
    expect(workday.isCanonical).toBe(true);
    expect(workday.detectedAts).toBe("Workday");

    const ashby = getCareerUrlStatus("https://jobs.ashbyhq.com/company");
    expect(ashby.isCanonical).toBe(true);
    expect(ashby.detectedAts).toBe("Ashby");
  });

  it("identifies verified direct company career portals", () => {
    const portal = getCareerUrlStatus(
      "https://www.atlassian.com/company/careers/all-jobs?location=India",
    );
    expect(portal.isCanonical).toBe(true);
    expect(portal.isSearch).toBe(false);
    expect(portal.kind).toBe("canonical_portal");
    expect(portal.badgeLabel).toBe("Verified Canonical");
  });

  it("identifies generic Google search result query URLs", () => {
    const googleSearch = getCareerUrlStatus("https://www.google.com/search?q=scopely+careers");
    expect(googleSearch.isCanonical).toBe(false);
    expect(googleSearch.isSearch).toBe(true);
    expect(googleSearch.kind).toBe("generic_search");
    expect(googleSearch.badgeLabel).toBe("Generic Search Link");

    const googleRedirect = getCareerUrlStatus(
      "https://www.google.com/url?sa=t&rct=j&q=&esrc=s&source=web&cd=&url=https%3A%2F%2Fcareers.veeam.com%2F",
    );
    expect(googleRedirect.isSearch).toBe(true);
  });

  it("identifies Bing and Yahoo search query URLs", () => {
    const bing = getCareerUrlStatus("https://www.bing.com/search?q=postman+jobs");
    expect(bing.isSearch).toBe(true);
    expect(bing.isCanonical).toBe(false);

    const yahoo = getCareerUrlStatus("https://search.yahoo.com/search?p=swiggy+careers");
    expect(yahoo.isSearch).toBe(true);
    expect(yahoo.isCanonical).toBe(false);
  });

  it("identifies generic aggregator queries (Indeed, Glassdoor)", () => {
    const indeed = getCareerUrlStatus("https://www.indeed.com/jobs?q=sdet&l=remote");
    expect(indeed.isAggregator).toBe(true);
    expect(indeed.isCanonical).toBe(false);
    expect(indeed.badgeLabel).toBe("Aggregator Query");

    const glassdoor = getCareerUrlStatus(
      "https://www.glassdoor.com/Job/jobs.htm?keyword=qa+engineer",
    );
    expect(glassdoor.isAggregator).toBe(true);
  });

  it("handles missing or empty URLs", () => {
    const empty = getCareerUrlStatus("");
    expect(empty.isMissing).toBe(true);
    expect(empty.isCanonical).toBe(false);
    expect(empty.badgeLabel).toBe("No URL");

    const nil = getCareerUrlStatus(null);
    expect(nil.isMissing).toBe(true);
  });
});
