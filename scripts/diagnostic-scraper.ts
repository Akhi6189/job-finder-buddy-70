/**
 * Diagnostic Scraper Tool for Complex Nested Company Career Pages
 *
 * Simulates and tests scraping against known complex portals (e.g. Scopely, Greenhouse multi-level departments,
 * deeply nested DOM accordions, preloaded state, tables) and logs parser outputs to verify correct identification
 * and flattening into standard ExtractedJob objects.
 *
 * Usage:
 *   npx tsx scripts/diagnostic-scraper.ts
 *   npm run diagnostic:scraper
 */

import { extractJobs, parseJobsFromHtml, type ExtractedJob } from "../src/lib/scan.server";

// Sample fixture representing Scopely's multi-level nested studio & department DOM hierarchy
const SCOPELY_NESTED_HTML_FIXTURE = `
<div class="career-portal scopely-careers">
  <header>
    <h1>Careers at Scopely</h1>
    <nav><a href="/about">About Us</a><a href="/games">Our Games</a></nav>
  </header>

  <div class="portfolio-container" data-portfolio="Live Games Portfolio">
    <h2 class="portfolio-title">Live Games Portfolio</h2>
    
    <div class="department-accordion" data-department="Quality Assurance & Testing">
      <h3 class="dept-title">Quality Assurance & Release Operations</h3>
      <div class="openings-list">
        <!-- Nested Card 1: Lead QA -->
        <div class="job-card" data-job-id="scopely-qa-01">
          <div class="job-header">
            <a href="/careers/scopely/lead-qa-engineer" class="job-title-link">
              <h4 class="role-title">Lead QA Engineer</h4>
            </a>
            <span class="badge badge-remote">Remote, India</span>
          </div>
          <div class="job-meta">
            <span class="location">Bangalore, India</span>
            <span class="employment-type">Full-time</span>
          </div>
          <p class="job-summary">Drive automated testing frameworks and lead our global QA engineers.</p>
        </div>

        <!-- Nested Card 2: QA Analyst -->
        <div class="job-card" data-job-id="scopely-qa-02">
          <div class="job-header">
            <a href="/careers/scopely/qa-analyst" class="job-title-link">
              <h4 class="role-title">QA Analyst</h4>
            </a>
          </div>
          <div class="job-meta">
            <span class="location">Bengaluru, Karnataka</span>
            <span class="employment-type">Full-time</span>
          </div>
          <p class="job-summary">Manual and automation testing for mobile live operations.</p>
        </div>
      </div>
    </div>

    <!-- Nested Department 2: Engineering -->
    <div class="department-accordion" data-department="Engineering">
      <h3 class="dept-title">Game Engineering</h3>
      <div class="openings-list">
        <div class="job-card" data-job-id="scopely-eng-01">
          <a href="/careers/scopely/backend-engineer-wwe">
            <h4 class="role-title">Senior Software Engineer (Gaming Backend) - WWE Champions</h4>
          </a>
          <span class="location">Bangalore, India</span>
        </div>
      </div>
    </div>
  </div>

  <!-- Studio 2: Monopoly GO! Division with Nested Table Structure -->
  <div class="portfolio-container" data-portfolio="Monopoly GO! Studio">
    <h2 class="portfolio-title">Monopoly GO! Studio</h2>
    <div class="studio-subsections">
      <table class="jobs-table">
        <thead>
          <tr>
            <th>Position</th>
            <th>Department</th>
            <th>Location</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          <tr class="job-row">
            <td>
              <a href="/careers/scopely/senior-quality-engineer-monopoly-go">
                <strong>Senior Quality Engineer - MONOPOLY GO!</strong>
              </a>
            </td>
            <td>Quality Assurance</td>
            <td>Bangalore, India</td>
            <td><a href="/apply/monopoly-qa" class="apply-btn">Apply Now</a></td>
          </tr>
          <tr class="job-row">
            <td>
              <a href="/careers/scopely/sr-dev-manager-liveops-qa">
                <strong>Sr. Development Manager, LiveOps QA</strong>
              </a>
            </td>
            <td>Quality Operations</td>
            <td>Remote, India</td>
            <td><a href="/apply/liveops-mgr" class="apply-btn">Apply Now</a></td>
          </tr>
          <tr class="job-row">
            <td>
              <a href="/careers/scopely/lead-3d-artist">
                <strong>Lead 3D Artist</strong>
              </a>
            </td>
            <td>Art & Creative</td>
            <td>Remote, US</td>
            <td><a href="/apply/artist" class="apply-btn">Apply Now</a></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</div>
`;

interface DiagnosticResult {
  source: string;
  totalFlattened: number;
  departmentsCaptured: string[];
  qaRolesFound: string[];
  sampleJobs: { title: string; location: string; department: string; url: string }[];
  passed: boolean;
  errors: string[];
}

function runDiagnosticOnHtml(html: string, pageUrl: string, companyName: string): DiagnosticResult {
  const errors: string[] = [];
  const jobs: ExtractedJob[] = parseJobsFromHtml(html, pageUrl, companyName);

  const departments = Array.from(new Set(jobs.map((j) => j.experience).filter(Boolean)));
  const qaRoles = jobs
    .filter((j) =>
      /\b(qa\b|sdet|test|tester|testing|quality assurance|quality engineer|quality analyst)\b/i.test(
        j.title,
      ),
    )
    .map((j) => j.title);

  // Assertions for flattening & identification
  if (jobs.length === 0) {
    errors.push("No jobs were extracted from the nested HTML structure.");
  }

  // Ensure nested elements were flattened into 1D array
  const hasNestedObjects = jobs.some(
    (j) => typeof j !== "object" || !j.title || typeof j.title !== "string",
  );
  if (hasNestedObjects) {
    errors.push("Extracted records contain invalid non-flattened elements.");
  }

  // Verify critical nested QA roles were flattened and captured
  const expectedRoles = [
    "Lead QA Engineer",
    "QA Analyst",
    "Senior Quality Engineer - MONOPOLY GO!",
  ];
  for (const expected of expectedRoles) {
    const found = jobs.some((j) => j.title.toLowerCase().includes(expected.toLowerCase()));
    if (!found) {
      errors.push(`Expected nested role "${expected}" was not extracted.`);
    }
  }

  return {
    source: companyName,
    totalFlattened: jobs.length,
    departmentsCaptured: departments,
    qaRolesFound: qaRoles,
    sampleJobs: jobs.slice(0, 5).map((j) => ({
      title: j.title,
      location: j.location || "N/A",
      department: j.experience || "General",
      url: j.url,
    })),
    passed: errors.length === 0,
    errors,
  };
}

async function runLiveDiagnostic(
  companyName: string,
  careersUrl: string,
  keywords: string[],
): Promise<DiagnosticResult> {
  const errors: string[] = [];
  let jobs: ExtractedJob[] = [];

  try {
    jobs = await extractJobs(careersUrl, keywords, companyName);
  } catch (err) {
    errors.push(`Live fetch failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const departments = Array.from(new Set(jobs.map((j) => j.experience).filter(Boolean)));
  const qaRoles = jobs
    .filter((j) =>
      /\b(qa\b|sdet|test|tester|testing|quality assurance|quality engineer|quality analyst)\b/i.test(
        j.title,
      ),
    )
    .map((j) => j.title);

  return {
    source: `${companyName} (Live API/Board: ${careersUrl})`,
    totalFlattened: jobs.length,
    departmentsCaptured: departments,
    qaRolesFound: qaRoles,
    sampleJobs: jobs.slice(0, 6).map((j) => ({
      title: j.title,
      location: j.location || "N/A",
      department: j.experience || "General",
      url: j.url,
    })),
    passed: jobs.length > 0 && qaRoles.length > 0,
    errors,
  };
}

export async function runScraperDiagnostics() {
  console.log("================================================================================");
  console.log("             ROBOTIC DIAGNOSTIC SUITE: COMPLEX NESTED SCRAPER                  ");
  console.log("================================================================================\n");

  // 1. Diagnostic test on Scopely multi-tiered HTML fixture
  console.log("▶ [Test 1/2] Evaluating Multi-Level Nested HTML Tree (Accordions + Tables)...");
  const fixtureResult = runDiagnosticOnHtml(
    SCOPELY_NESTED_HTML_FIXTURE,
    "https://job-boards.greenhouse.io/scopely",
    "Scopely",
  );

  console.log(`  Source:               ${fixtureResult.source}`);
  console.log(`  Total Roles Flattened:${fixtureResult.totalFlattened}`);
  console.log(`  Departments Preserved:${fixtureResult.departmentsCaptured.join(", ") || "None"}`);
  console.log(`  Nested QA Roles:      ${fixtureResult.qaRolesFound.join(" | ") || "None"}`);
  console.log("  Flattened Sample Records:");
  for (const j of fixtureResult.sampleJobs) {
    console.log(`    • [${j.department}] ${j.title} (${j.location})`);
    console.log(`      ↳ URL: ${j.url}`);
  }

  if (fixtureResult.passed) {
    console.log("  ✔ RESULT: PASSED (All nested levels flattened cleanly)\n");
  } else {
    console.log(`  ✖ RESULT: FAILED (${fixtureResult.errors.join("; ")})\n`);
  }

  // 2. Diagnostic test on Live Scopely Greenhouse Board API with nested departments
  console.log("▶ [Test 2/2] Evaluating Live Scopely Multi-Department Greenhouse Board...");
  const liveResult = await runLiveDiagnostic(
    "Scopely",
    "https://job-boards.greenhouse.io/scopely",
    ["QA", "Lead QA", "SDET", "Quality"],
  );

  console.log(`  Source:               ${liveResult.source}`);
  console.log(`  Total Roles Flattened:${liveResult.totalFlattened}`);
  console.log(
    `  Departments Captured: ${liveResult.departmentsCaptured.length} distinct departments`,
  );
  console.log(`  Top QA Roles Found (${liveResult.qaRolesFound.length}):`);
  for (const qa of liveResult.qaRolesFound.slice(0, 8)) {
    console.log(`    • ${qa}`);
  }
  console.log("  Flattened Sample Records:");
  for (const j of liveResult.sampleJobs) {
    console.log(`    • [${j.department}] ${j.title} (${j.location})`);
    console.log(`      ↳ URL: ${j.url}`);
  }

  if (liveResult.passed) {
    console.log("  ✔ RESULT: PASSED (Live nested listings flattened and ranked successfully)\n");
  } else {
    console.log(`  ✖ RESULT: FAILED (${liveResult.errors.join("; ")})\n`);
  }

  console.log("================================================================================");
  const overallPassed = fixtureResult.passed && liveResult.passed;
  console.log(
    `DIAGNOSTIC SUMMARY: ${overallPassed ? "ALL CHECKS PASSED ✔" : "ISSUES ENCOUNTERED ✖"}`,
  );
  console.log("================================================================================\n");

  return { fixtureResult, liveResult, overallPassed };
}

// When executed directly via `tsx scripts/diagnostic-scraper.ts`
if (import.meta.url.endsWith(process.argv[1] || "")) {
  runScraperDiagnostics().then((res) => {
    if (!res.overallPassed) {
      process.exit(1);
    }
  });
}
