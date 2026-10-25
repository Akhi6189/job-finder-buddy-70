import { describe, it, expect } from "vitest";
import { matchLocation, matchTitleCategory, matchJobSearchQuery } from "@/lib/job-filters";
import type { Job } from "@/lib/data";

describe("job-filters", () => {
  describe("matchLocation", () => {
    it("matches Bangalore and Bengaluru interchangeably", () => {
      expect(matchLocation("Bangalore, India", "bengaluru")).toBe(true);
      expect(matchLocation("Bengaluru, Karnataka", "bengaluru")).toBe(true);
      expect(matchLocation("Bengaluru", "bengaluru")).toBe(true);
      expect(matchLocation("Bangalore Urban", "bengaluru")).toBe(true);
      expect(matchLocation("BLR Office", "bengaluru")).toBe(true);
      expect(matchLocation("London, UK", "bengaluru")).toBe(false);
      expect(matchLocation("Pune, India", "bengaluru")).toBe(false);
    });

    it("matches Delhi NCR, Gurgaon, and Noida aliases", () => {
      expect(matchLocation("Gurgaon, India", "delhi")).toBe(true);
      expect(matchLocation("Gurugram, Haryana", "delhi")).toBe(true);
      expect(matchLocation("Noida, Uttar Pradesh", "delhi")).toBe(true);
      expect(matchLocation("New Delhi", "delhi")).toBe(true);
      expect(matchLocation("Delhi NCR", "delhi")).toBe(true);
      expect(matchLocation("Hyderabad, India", "delhi")).toBe(false);
    });

    it("matches Mumbai, Pune, Hyderabad, and Chennai", () => {
      expect(matchLocation("Navi Mumbai, India", "mumbai")).toBe(true);
      expect(matchLocation("Hyderabad, Telangana", "hyderabad")).toBe(true);
      expect(matchLocation("Secunderabad", "hyderabad")).toBe(true);
      expect(matchLocation("Hinjewadi, Pune", "pune")).toBe(true);
      expect(matchLocation("Chennai, Tamil Nadu", "chennai")).toBe(true);
    });

    it("matches Remote roles", () => {
      expect(matchLocation("Remote, India", "remote")).toBe(true);
      expect(matchLocation("Work from home", "remote")).toBe(true);
      expect(matchLocation("Bengaluru, India", "remote")).toBe(false);
    });
  });

  describe("matchTitleCategory", () => {
    it("all_qa matches all QA, SDET and quality engineering roles", () => {
      expect(matchTitleCategory("Lead QA Engineer", "all_qa")).toBe(true);
      expect(matchTitleCategory("Senior QA Engineer", "all_qa")).toBe(true);
      expect(matchTitleCategory("QA Analyst", "all_qa")).toBe(true);
      expect(matchTitleCategory("Senior Quality Engineer - MONOPOLY GO!", "all_qa")).toBe(true);
      expect(matchTitleCategory("Sr. Development Manager, LiveOps QA", "all_qa")).toBe(true);
      expect(matchTitleCategory("SDET-II", "all_qa")).toBe(true);
      expect(matchTitleCategory("Staff Software Development Engineer in Test", "all_qa")).toBe(
        true,
      );
      expect(matchTitleCategory("Senior Backend Engineer", "all_qa")).toBe(false);
      expect(matchTitleCategory("Director of Product", "all_qa")).toBe(false);
      expect(matchTitleCategory("Lead 3D Artist", "all_qa")).toBe(false);
    });

    it("lead_manager requires BOTH leadership title AND QA/Test domain", () => {
      // Must match QA Leads and QA Managers
      expect(matchTitleCategory("Lead QA Engineer", "lead_manager")).toBe(true);
      expect(matchTitleCategory("QA Manager, Live Operations", "lead_manager")).toBe(true);
      expect(matchTitleCategory("Sr. Development Manager, LiveOps QA", "lead_manager")).toBe(true);
      expect(matchTitleCategory("Principal QA Engineer", "lead_manager")).toBe(true);
      expect(matchTitleCategory("Staff SDET", "lead_manager")).toBe(true);
      expect(matchTitleCategory("Test Lead", "lead_manager")).toBe(true);

      // Must NOT match unrelated directors, managers, or leads!
      expect(
        matchTitleCategory("Director of Product - Star Trek Fleet Command", "lead_manager"),
      ).toBe(false);
      expect(matchTitleCategory("Senior Art Manager", "lead_manager")).toBe(false);
      expect(matchTitleCategory("Production Director", "lead_manager")).toBe(false);
      expect(matchTitleCategory("Lead 3D Artist", "lead_manager")).toBe(false);
      expect(matchTitleCategory("Lead Systems Designer", "lead_manager")).toBe(false);
      expect(matchTitleCategory("Senior Game Producer", "lead_manager")).toBe(false);
      expect(matchTitleCategory("Engineering Manager (Backend)", "lead_manager")).toBe(false);
    });

    it("sdet_qa matches automation roles and SDETs", () => {
      expect(matchTitleCategory("Lead SDET", "sdet_qa")).toBe(true);
      expect(matchTitleCategory("QA Automation Engineer", "sdet_qa")).toBe(true);
      expect(
        matchTitleCategory(
          "Senior Quality Engineer - MONOPOLY GO!",
          "sdet_qa",
          "Test automation with Cypress",
        ),
      ).toBe(true);
      expect(matchTitleCategory("Product Manager", "sdet_qa")).toBe(false);
    });

    it("swe_backend isolates backend roles from QA roles", () => {
      expect(matchTitleCategory("Senior Software Engineer (Backend)", "swe_backend")).toBe(true);
      expect(matchTitleCategory("Lead QA Engineer", "swe_backend")).toBe(false);
      expect(matchTitleCategory("SDET", "swe_backend")).toBe(false);
    });
  });

  describe("matchJobSearchQuery", () => {
    const mockJob = (overrides: Partial<Job>): Job => ({
      id: "j-1",
      company_id: "c-1",
      title: "Lead QA Engineer",
      url: "https://example.com/job/1",
      location: "Bangalore, India",
      experience: null,
      salary: null,
      description: "Drive QA automation across games.",
      first_seen_at: new Date().toISOString(),
      score: 95,
      score_summary: null,
      matched_skills: ["QA Automation", "Cypress", "Selenium"],
      missing_skills: [],
      applied_at: null,
      notes: null,
      status: "new",
      created_at: new Date().toISOString(),
      closed_at: null,
      last_verified_at: new Date().toISOString(),
      companies: { name: "Scopely", careers_url: "https://scopely.com", category: "Gaming" },
      ...overrides,
    });

    it("matches 'QA' accurately without missing jobs or matching unrelated roles", () => {
      expect(matchJobSearchQuery(mockJob({ title: "Lead QA Engineer" }), "QA")).toBe(true);
      expect(
        matchJobSearchQuery(mockJob({ title: "Senior Quality Engineer - MONOPOLY GO!" }), "qa"),
      ).toBe(true);
      expect(matchJobSearchQuery(mockJob({ title: "QA Analyst" }), "qa")).toBe(true);
      expect(
        matchJobSearchQuery(
          mockJob({
            title: "Software Engineer (Backend)",
            description: "Build microservices in Go and Java.",
            matched_skills: ["Go", "Java", "Kubernetes"],
          }),
          "qa",
        ),
      ).toBe(false);
      expect(
        matchJobSearchQuery(
          mockJob({
            title: "Director of Product",
            description: "Lead product roadmap and strategy.",
            matched_skills: ["Product Strategy", "Roadmaps"],
          }),
          "qa",
        ),
      ).toBe(false);
    });

    it("matches multi-word queries like 'scopely qa' and 'lead qa'", () => {
      const job = mockJob({
        title: "Lead QA Engineer",
        companies: { name: "Scopely", careers_url: "", category: "" },
      });
      expect(matchJobSearchQuery(job, "scopely qa")).toBe(true);
      expect(matchJobSearchQuery(job, "lead qa")).toBe(true);
      expect(matchJobSearchQuery(job, "bangalore qa")).toBe(true);

      const otherJob = mockJob({
        title: "Director of Product",
        description: "Lead product roadmap and strategy.",
        matched_skills: ["Product Strategy"],
        companies: { name: "Scopely", careers_url: "", category: "" },
      });
      expect(matchJobSearchQuery(otherJob, "scopely qa")).toBe(false);
    });

    it("matches city search queries like 'bangalore' against Bangalore location", () => {
      const job = mockJob({ location: "Bangalore, India" });
      expect(matchJobSearchQuery(job, "bangalore")).toBe(true);
      expect(matchJobSearchQuery(job, "bengaluru")).toBe(true);
      expect(matchJobSearchQuery(job, "pune")).toBe(false);
    });
  });
});
