import { describe, it, expect } from "vitest";
import { analyzeLinkedInProfile, searchLinkedInJobs } from "@/lib/linkedin.server";
import { DEFAULT_SDET_RESUME } from "@/lib/ats-score";

describe("LinkedIn Profile & Openings Matcher Test Suite", () => {
  it("analyzes LinkedIn profile and resume to extract verified skills and target roles", async () => {
    const profile = await analyzeLinkedInProfile({
      profileUrl: "https://www.linkedin.com/in/akhil-bhadran/",
      profileText: `
        Akhil Bhadran
        Senior SDET / QA Automation Engineer | Bengaluru, India
        Experienced in Java, Python, Selenium, Playwright, Cypress, RestAssured, Postman, CI/CD, Docker.
      `,
      existingResume: DEFAULT_SDET_RESUME,
    });

    expect(profile.name).toBe("Akhil Bhadran");
    expect(profile.headline).toContain("Senior SDET");
    expect(profile.location).toContain("Bengaluru");
    expect(profile.topSkills).toContain("Selenium");
    expect(profile.targetRoles.some((r) => r.includes("SDET"))).toBe(true);
    expect(profile.roleFitInsights.length).toBeGreaterThanOrEqual(1);

    const sdetFit = profile.roleFitInsights.find((r) => r.role.includes("SDET"));
    expect(sdetFit).toBeDefined();
    expect(sdetFit?.matchScore).toBeGreaterThanOrEqual(80);
    expect(sdetFit?.strengths.length).toBeGreaterThan(0);
  }, 25000);

  it("searches LinkedIn openings and computes ATS compatibility scores for each role", async () => {
    // Test live public guest search or fallback handling
    const result = await searchLinkedInJobs(DEFAULT_SDET_RESUME, {
      roleQuery: "SDET",
      location: "Bengaluru, Karnataka, India",
      limit: 10,
    });

    expect(result.roleQuery).toBe("SDET");
    expect(result.location).toContain("Bengaluru");
    expect(result.directSearchUrl).toContain("linkedin.com/jobs/search");
    expect(result.directSearchUrl).toContain("SDET");

    // If live LinkedIn guest endpoint is reachable in test environment, verify job properties
    if (result.jobs.length > 0) {
      const topJob = result.jobs[0];
      expect(typeof topJob.title).toBe("string");
      expect(topJob.title.length).toBeGreaterThan(0);
      expect(typeof topJob.company).toBe("string");
      expect(topJob.url).toMatch(/^https?:\/\//);
      expect(topJob.score).toBeGreaterThanOrEqual(0);
      expect(topJob.score).toBeLessThanOrEqual(100);
      expect(Array.isArray(topJob.matchedSkills)).toBe(true);
      expect(Array.isArray(topJob.missingSkills)).toBe(true);

      // Verify descending sort by ATS score
      for (let i = 1; i < result.jobs.length; i++) {
        expect(result.jobs[i - 1].score).toBeGreaterThanOrEqual(result.jobs[i].score);
      }
    }
  });
});
