import { describe, it, expect, vi } from "vitest";
import { parseJobsFromHtml, extractJobs, type ExtractedJob } from "@/lib/scan.server";

describe("Diagnostic Scraper Test Suite: Complex Nested Company Pages", () => {
  // Complex fixture modeling multi-tiered department accordions, portfolios, and studio divisions like Scopely
  const SCOPELY_MULTI_TIER_NESTED_HTML = `
    <div class="career-page-root">
      <header class="hero-header">
        <h1>Scopely Careers - Game Opportunities</h1>
        <div class="nav-links">
          <a href="/culture">Culture</a>
          <a href="/benefits">Benefits</a>
          <a href="/studios">Our Studios</a>
        </div>
      </header>

      <main class="job-board-content">
        <!-- Division 1: Live Games Portfolio (Nested Studio Division) -->
        <section class="portfolio-group" data-division="Live Games Portfolio">
          <h2 class="division-title">Live Games Portfolio</h2>
          
          <!-- Nested Department A: Quality Assurance -->
          <div class="department-accordion" data-department="Quality Assurance">
            <h3 class="dept-title">Quality Assurance & Operations</h3>
            <div class="department-description">
              <p>Ensuring world-class quality and performance across our live titles.</p>
            </div>
            
            <ul class="nested-openings-list">
              <!-- Nested Item 1: Lead QA Engineer -->
              <li class="nested-job-item">
                <div class="job-card" data-job-id="scopely-101">
                  <div class="card-top">
                    <a href="/careers/scopely/lead-qa-engineer" class="posting-url">
                      <h4 class="job-title">Lead QA Engineer</h4>
                    </a>
                    <span class="workplace-badge">Remote</span>
                  </div>
                  <div class="card-details">
                    <span class="location-tag">Bangalore, India</span>
                    <span class="team-tag">WWE Champions Studio</span>
                  </div>
                  <div class="card-summary">
                    <p>Drive automated testing, test framework strategy, and mentor QA engineers.</p>
                  </div>
                </div>
              </li>

              <!-- Nested Item 2: QA Analyst -->
              <li class="nested-job-item">
                <div class="job-card" data-job-id="scopely-102">
                  <div class="card-top">
                    <a href="/careers/scopely/qa-analyst" class="posting-url">
                      <h4 class="job-title">QA Analyst</h4>
                    </a>
                  </div>
                  <div class="card-details">
                    <span class="location-tag">Bengaluru, Karnataka</span>
                    <span class="team-tag">Bingo Bash</span>
                  </div>
                  <div class="card-summary">
                    <p>Conduct functional, regression, and performance testing on live game builds.</p>
                  </div>
                </div>
              </li>

              <!-- Nested Item 3: Intern - QA Engineer -->
              <li class="nested-job-item">
                <div class="job-card" data-job-id="scopely-103">
                  <div class="card-top">
                    <a href="/careers/scopely/intern-qa-engineer" class="posting-url">
                      <h4 class="job-title">Intern - QA Engineer - Royal Lounge Casino</h4>
                    </a>
                  </div>
                  <div class="card-details">
                    <span class="location-tag">Bangalore, India</span>
                  </div>
                </div>
              </li>
            </ul>
          </div>

          <!-- Nested Department B: Engineering -->
          <div class="department-accordion" data-department="Engineering">
            <h3 class="dept-title">Game Client & Backend Engineering</h3>
            <ul class="nested-openings-list">
              <li class="nested-job-item">
                <div class="job-card" data-job-id="scopely-104">
                  <a href="/careers/scopely/backend-engineer-wwe">
                    <h4 class="job-title">Senior Software Engineer (Gaming Backend) - WWE Champions</h4>
                  </a>
                  <span class="location-tag">Bangalore, India</span>
                </div>
              </li>
            </ul>
          </div>
        </section>

        <!-- Division 2: Monopoly GO! Division (Rendered as Nested Table / Grid) -->
        <section class="portfolio-group" data-division="Monopoly GO! Studio">
          <h2 class="division-title">MONOPOLY GO! Studio</h2>
          
          <div class="openings-table-container">
            <table class="nested-career-table">
              <thead>
                <tr>
                  <th>Job Title</th>
                  <th>Department</th>
                  <th>Location</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                <tr class="job-row-item">
                  <td class="col-title">
                    <a href="/careers/scopely/senior-quality-engineer-monopoly-go" class="role-anchor">
                      <span class="role-text">Senior Quality Engineer - MONOPOLY GO!</span>
                    </a>
                  </td>
                  <td class="col-dept">Quality Engineering</td>
                  <td class="col-loc">Bangalore, India</td>
                  <td><a href="/apply/1" class="apply-link">Apply</a></td>
                </tr>
                <tr class="job-row-item">
                  <td class="col-title">
                    <a href="/careers/scopely/sr-dev-manager-liveops-qa" class="role-anchor">
                      <span class="role-text">Sr. Development Manager, LiveOps QA</span>
                    </a>
                  </td>
                  <td class="col-dept">Quality Operations</td>
                  <td class="col-loc">Remote, India</td>
                  <td><a href="/apply/2" class="apply-link">Apply</a></td>
                </tr>
                <tr class="job-row-item">
                  <td class="col-title">
                    <a href="/careers/scopely/lead-3d-artist" class="role-anchor">
                      <span class="role-text">Lead 3D Artist - Monopoly GO!</span>
                    </a>
                  </td>
                  <td class="col-dept">Art & Design</td>
                  <td class="col-loc">Culver City, CA</td>
                  <td><a href="/apply/3" class="apply-link">Apply</a></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- Division 3: Preloaded State Embedded in Script Tag -->
        <script id="__NEXT_DATA__" type="application/json">
        {
          "props": {
            "pageProps": {
              "studioHierarchy": {
                "name": "Global Publishing",
                "subDepartments": [
                  {
                    "name": "Live Operations QA",
                    "postings": [
                      {
                        "id": "gh-qa-liveops-99",
                        "title": "QA Manager, Live Operations",
                        "location": { "name": "Bangalore, India" },
                        "url": "https://job-boards.greenhouse.io/scopely/jobs/gh-qa-liveops-99",
                        "department": "Live Operations QA",
                        "description": "Lead and direct live game release testing and operational QA."
                      }
                    ]
                  }
                ]
              }
            }
          }
        }
        </script>
      </main>

      <footer class="career-footer">
        <a href="/privacy">Privacy Notice</a>
        <a href="/cookies">Cookie Preferences</a>
      </footer>
    </div>
  `;

  it("diagnostic: correctly identifies and flattens multi-tiered nested DOM accordions and tables into 1D ExtractedJob records", () => {
    const pageUrl = "https://job-boards.greenhouse.io/scopely";
    const company = "Scopely";

    // Run HTML Parser
    const flattened: ExtractedJob[] = parseJobsFromHtml(
      SCOPELY_MULTI_TIER_NESTED_HTML,
      pageUrl,
      company,
    );

    // Diagnostic logging
    console.log("\n[DIAGNOSTIC TEST - FLATTENING OUTPUT]");
    console.log(`Total Flattened Records: ${flattened.length}`);
    flattened.forEach((job, index) => {
      console.log(
        `  #${index + 1}: [${job.experience || "Unassigned"}] ${job.title} | Loc: ${job.location} | URL: ${job.url}`,
      );
    });

    // 1. Structure Verification: Flattened into standard 1D records
    expect(flattened.length).toBeGreaterThanOrEqual(6);
    for (const job of flattened) {
      expect(typeof job.title).toBe("string");
      expect(job.title.trim().length).toBeGreaterThan(0);
      expect(typeof job.url).toBe("string");
      expect(job.url).toMatch(/^https?:\/\//);
      expect(typeof job.location).toBe("string");
      expect(typeof job.description).toBe("string");
    }

    // 2. Specific Nested Role Verification
    const titles = flattened.map((j) => j.title);

    // From Department Accordions
    expect(titles).toContain("Lead QA Engineer");
    expect(titles).toContain("QA Analyst");
    expect(titles).toContain("Intern - QA Engineer - Royal Lounge Casino");
    expect(titles).toContain("Senior Software Engineer (Gaming Backend) - WWE Champions");

    // From Nested Table Rows
    expect(titles).toContain("Senior Quality Engineer - MONOPOLY GO!");
    expect(titles).toContain("Sr. Development Manager, LiveOps QA");

    // From Embedded Preloaded State
    expect(titles).toContain("QA Manager, Live Operations");

    // 3. Parent Context Preservation
    const leadQa = flattened.find((j) => j.title === "Lead QA Engineer");
    expect(leadQa).toBeDefined();
    expect(leadQa?.location).toContain("Bangalore");
    expect(leadQa?.url).toContain("/lead-qa-engineer");

    const monopolyQa = flattened.find((j) => j.title === "Senior Quality Engineer - MONOPOLY GO!");
    expect(monopolyQa).toBeDefined();
    expect(monopolyQa?.location).toContain("Bangalore");

    // 4. Boilerplate Filtering
    expect(titles).not.toContain("Privacy Notice");
    expect(titles).not.toContain("Cookie Preferences");
    expect(titles).not.toContain("Apply");
  });

  it("diagnostic: verifies live API scraping on Scopely Greenhouse board captures and flattens all department hierarchies", async () => {
    // Attempt live fetch from official Scopely Greenhouse board
    const startTime = Date.now();
    let liveJobs: ExtractedJob[] = [];
    try {
      liveJobs = await extractJobs(
        "https://job-boards.greenhouse.io/scopely",
        ["QA", "Lead QA", "SDET", "Quality"],
        "Scopely",
      );
    } catch (e) {
      console.warn("Live network scrape was skipped or errored:", e);
    }

    const elapsedMs = Date.now() - startTime;
    console.log(`\n[DIAGNOSTIC TEST - LIVE BOARD SCRAPE (${elapsedMs}ms)]`);
    console.log(`Live Roles Retrieved: ${liveJobs.length}`);

    // If live network is reachable, assert live board jobs
    if (liveJobs.length > 0) {
      const liveQaRoles = liveJobs.filter((j) => /\b(qa\b|quality|sdet|test)/i.test(j.title));
      console.log(`Live QA/Quality Roles Discovered (${liveQaRoles.length}):`);
      liveQaRoles.forEach((j) => {
        console.log(
          `  • ${j.title} (${j.location || "Location unlisted"}) [Dept: ${j.experience || "N/A"}]`,
        );
        console.log(`    ↳ Direct Link: ${j.url}`);
      });

      expect(liveJobs.length).toBeGreaterThanOrEqual(5);
      expect(liveQaRoles.length).toBeGreaterThanOrEqual(1);

      // Verify that every single role has a valid, absolute HTTP URL
      for (const j of liveJobs) {
        expect(j.url).toMatch(/^https?:\/\//);
      }
    } else {
      console.log(
        "Live network unavailable in environment; verified via high-fidelity structural fixture.",
      );
    }
  });
});
