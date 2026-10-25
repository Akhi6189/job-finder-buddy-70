import { describe, it, expect } from "vitest";
import { parseJobsFromHtml, makeExactPostingUrl } from "@/lib/scan.server";

describe("parseJobsFromHtml & Nested Job Scraper", () => {
  it("captures nested job listings inside department accordions", () => {
    const html = `
      <div class="careers-wrapper">
        <div class="department-section" data-department="Quality Assurance">
          <h2 class="dept-title">Quality Assurance & Testing</h2>
          <div class="job-list">
            <div class="job-card">
              <a href="/careers/lead-qa-engineer">
                <h3 class="role-title">Lead QA Engineer</h3>
              </a>
              <span class="location">Remote, India</span>
              <p>Drive automated testing, test framework strategy, and mentor QA engineers.</p>
            </div>
            <div class="job-card">
              <a href="/careers/qa-engineer-ii">
                <h3 class="role-title">QA Engineer II</h3>
              </a>
              <span class="location">Bengaluru, Karnataka</span>
              <p>Manual and automation testing for mobile and web systems.</p>
            </div>
          </div>
        </div>
        <div class="department-section" data-department="Engineering">
          <h2 class="dept-title">Backend Engineering</h2>
          <div class="job-card">
            <a href="/careers/backend-lead">
              <h3 class="role-title">Staff Backend Engineer</h3>
            </a>
            <span class="location">Remote</span>
          </div>
        </div>
      </div>
    `;

    const jobs = parseJobsFromHtml(html, "https://company.example.com/careers", "ExampleCorp");

    const titles = jobs.map((j) => j.title);
    expect(titles).toContain("Lead QA Engineer");
    expect(titles).toContain("QA Engineer II");
    expect(titles).toContain("Staff Backend Engineer");

    const leadQa = jobs.find((j) => j.title === "Lead QA Engineer");
    expect(leadQa).toBeDefined();
    expect(leadQa?.url).toBe("https://company.example.com/careers/lead-qa-engineer");
    expect(leadQa?.location).toContain("Remote");
    expect(leadQa?.experience).toBe("Quality Assurance & Testing");
  });

  it("extracts jobs from HTML tables with nested rows", () => {
    const html = `
      <table class="openings-table">
        <thead>
          <tr><th>Role</th><th>Department</th><th>Location</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><a href="/jobs/qa-eng-101">QA Engineer</a></td>
            <td>Quality Engineering</td>
            <td>Bengaluru, India</td>
          </tr>
          <tr>
            <td><a href="/jobs/lead-qa-202">Lead QA</a></td>
            <td>Quality Assurance</td>
            <td>Hyderabad, India</td>
          </tr>
        </tbody>
      </table>
    `;

    const jobs = parseJobsFromHtml(html, "https://example.com/careers", "ExampleCorp");
    expect(jobs.length).toBeGreaterThanOrEqual(2);
    expect(jobs.some((j) => j.title === "QA Engineer")).toBe(true);
    expect(jobs.some((j) => j.title === "Lead QA")).toBe(true);
  });

  it("extracts jobs from Schema.org JSON-LD with nested @graph and itemListElement", () => {
    const html = `
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "JobPosting",
            "title": "Lead QA Engineer",
            "url": "https://example.com/jobs/lead-qa",
            "jobLocation": {
              "address": {
                "addressLocality": "Bengaluru",
                "addressCountry": "India"
              }
            },
            "description": "Lead QA position driving automation quality."
          },
          {
            "@type": "JobPosting",
            "title": "Senior QA Engineer",
            "url": "https://example.com/jobs/senior-qa",
            "jobLocation": {
              "address": "Remote, India"
            },
            "description": "Senior QA position focusing on Cypress and Playwright."
          }
        ]
      }
      </script>
    `;

    const jobs = parseJobsFromHtml(html, "https://example.com/careers", "ExampleCorp");
    expect(jobs.length).toBe(2);
    expect(jobs.some((j) => j.title === "Lead QA Engineer")).toBe(true);
    expect(jobs.some((j) => j.title === "Senior QA Engineer")).toBe(true);
  });

  it("extracts jobs from preloaded Next.js / Nuxt / inline state blobs", () => {
    const html = `
      <script id="__NEXT_DATA__" type="application/json">
      {
        "props": {
          "pageProps": {
            "careerOpenings": [
              {
                "id": "role-99",
                "title": "QA Engineer (Automation)",
                "location": { "name": "Bengaluru" },
                "url": "https://example.com/careers/role-99",
                "description": "Automation QA role"
              },
              {
                "id": "role-100",
                "title": "Lead QA / SDET Lead",
                "location": { "name": "Remote" },
                "url": "https://example.com/careers/role-100",
                "description": "Lead SDET role"
              }
            ]
          }
        }
      }
      </script>
    `;

    const jobs = parseJobsFromHtml(html, "https://example.com/careers", "ExampleCorp");
    expect(jobs.length).toBe(2);
    expect(jobs.some((j) => j.title.includes("QA Engineer"))).toBe(true);
    expect(jobs.some((j) => j.title.includes("Lead QA"))).toBe(true);
  });

  it("filters out navigation, legal, and boilerplate links", () => {
    const html = `
      <nav>
        <a href="/careers">Careers</a>
        <a href="/about">About Us</a>
        <a href="/login">Sign In</a>
      </nav>
      <div class="job-card">
        <a href="/jobs/qa-engineer">QA Engineer</a>
      </div>
      <footer>
        <a href="/privacy">Privacy Policy</a>
        <a href="/terms">Terms of Service</a>
      </footer>
    `;

    const jobs = parseJobsFromHtml(html, "https://example.com/careers", "ExampleCorp");
    const titles = jobs.map((j) => j.title.toLowerCase());
    expect(titles).toContain("qa engineer");
    expect(titles).not.toContain("privacy policy");
    expect(titles).not.toContain("terms of service");
    expect(titles).not.toContain("sign in");
  });
});
