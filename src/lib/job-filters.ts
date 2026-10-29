import type { Job } from "./data";
import { isRemote } from "./data";

/**
 * Normalizes and matches job locations against location presets with city alias intelligence
 * (e.g., Bengaluru matches Bangalore, BLR; Delhi matches Gurgaon, Noida, NCR, etc.)
 */
export function matchLocation(jobLocation: string | null | undefined, filterLoc: string): boolean {
  if (!filterLoc || filterLoc === "all") return true;
  const loc = (jobLocation || "").toLowerCase();
  const f = filterLoc.toLowerCase().trim();

  if (f === "remote") {
    return isRemote({ location: jobLocation, description: "" });
  }

  // Bengaluru / Bangalore aliases
  if (f === "bengaluru" || f === "bangalore") {
    return /bengaluru|bangalore|\bblr\b|karnataka/i.test(loc);
  }

  // Delhi NCR / Gurgaon / Noida aliases
  if (f === "delhi" || f === "ncr" || f === "gurgaon" || f === "gurugram" || f === "noida") {
    return /delhi|gurgaon|gurugram|noida|faridabad|ghaziabad|\bncr\b/i.test(loc);
  }

  // Mumbai / Navi Mumbai / Thane
  if (f === "mumbai") {
    return /mumbai|bombay|navi mumbai|thane/i.test(loc);
  }

  // Hyderabad / Secunderabad / Telangana
  if (f === "hyderabad") {
    return /hyderabad|secunderabad|telangana/i.test(loc);
  }

  // Pune / Hinjewadi
  if (f === "pune") {
    return /pune|hinjewadi|hinjawadi|magarpatta/i.test(loc);
  }

  // Chennai / Madras / Tamil Nadu
  if (f === "chennai") {
    return /chennai|madras|tamil nadu/i.test(loc);
  }

  return loc.includes(f);
}

/**
 * Checks whether a role's title, JD description, or matched skills contain QA, SDET, or Testing indicators.
 * Ensures roles like "Senior Software Engineer, Test", "Software Engineer - Quality", or software engineer roles
 * with test automation JD/details are accurately captured when QA/SDET filters are applied.
 */
export function hasQaTestIndicators(
  jobTitle: string,
  jobDesc?: string | null,
  matchedSkills?: string[] | null,
): boolean {
  const t = (jobTitle || "").toLowerCase().trim();
  const desc = (jobDesc || "").toLowerCase();
  const skillsText = (matchedSkills || []).join(" ").toLowerCase();
  const fullContext = `${t} ${desc} ${skillsText}`;

  // 1. Direct Title checks
  // Standard QA / SDET / Test keywords
  if (
    /\b(qa\b|sdet|test\b|tester|testers|testing|qe\b|qc\b|quality assurance|quality engineer|quality analyst|automation engineer|automation tester|test automation|software development engineer in test|software engineer in test)\b/i.test(
      t,
    )
  ) {
    return true;
  }

  // Titles with comma, hyphen, or trailing test: e.g. "Senior Software Engineer, Test", "Lead Developer - Test Automation"
  if (
    /software\s*(?:engineer|developer|architect).*(?:in\s*test|,\s*test|[-–—|/]\s*test|\btest\b|\btesting\b)/i.test(
      t,
    )
  ) {
    return true;
  }
  if (
    /\b(?:engineer|developer|lead|architect|specialist|manager|director)\b.*(?:\btest\b|\btesting\b|\bqa\b)/i.test(
      t,
    )
  ) {
    return true;
  }
  if (
    /(?:\btest\b|\btesting\b|\bqa\b).*\b(?:engineer|developer|lead|architect|specialist|manager|director)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  if (/\bquality\b/i.test(t) && !/\bquality\s*(?:inspector|control\s*operator)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:validation|verification)\s*(?:engineer|lead|specialist|manager)\b/i.test(t)) {
    return true;
  }

  // 2. Job Description (JD) and Details checks
  // Does the JD describe an SDET, QA Engineer, or Test role?
  if (
    /\b(sdet|software development engineer in test|software engineer in test|qa engineer|quality engineer|quality analyst|test engineer|automation engineer|automation tester|test lead|test manager|test architect)\b/i.test(
      desc,
    )
  ) {
    return true;
  }

  // Core test automation and testing responsibilities in JD
  if (
    /\b(test automation|automation testing|qa automation|automated testing|automated test suites|test framework|testing framework|regression testing|test execution|test planning|test cases|test suite|test scripts|manual testing|end-to-end testing|e2e testing|api testing|functional testing|system testing)\b/i.test(
      desc,
    )
  ) {
    return true;
  }

  // 3. Matched Skills indicators
  const hasTestSkills = (matchedSkills || []).some((sk) =>
    /\b(qa\b|sdet|testing|test automation|selenium|playwright|cypress|testng|cucumber|appium|restassured|quality assurance|api testing|regression testing|\btest\b)/i.test(
      sk,
    ),
  );
  if (hasTestSkills && /\b(test|testing|qa|quality|automation|framework)\b/i.test(fullContext)) {
    return true;
  }

  // 4. Test automation tools mentioned in JD + testing context
  const hasTestTools =
    /\b(selenium|playwright|cypress|appium|restassured|testng|cucumber|junit|jmeter|karate)\b/i.test(
      desc,
    );
  if (
    hasTestTools &&
    /\b(test|testing|qa|quality|automation|framework|defect|bug|verify|validat)/i.test(desc)
  ) {
    return true;
  }

  return false;
}

/**
 * Checks whether a role has SDET / Automation QA indicators in title, JD, or skills.
 */
export function hasSdetAutomationIndicators(
  jobTitle: string,
  jobDesc?: string | null,
  matchedSkills?: string[] | null,
): boolean {
  const t = (jobTitle || "").toLowerCase().trim();
  const desc = (jobDesc || "").toLowerCase();
  const skillsText = (matchedSkills || []).join(" ").toLowerCase();
  const fullContext = `${t} ${desc} ${skillsText}`;

  // 1. Explicit automation title
  if (
    /\b(sdet|qe\b|qa automation|test automation|automation engineer|automation tester|automated test|automation lead|automation architect|automation specialist)\b/i.test(
      t,
    ) ||
    /\b(software development engineer in test|software engineer in test)\b/i.test(t)
  ) {
    return true;
  }

  // Titles like "Senior Software Engineer, Test" or "Software Engineer - Test"
  if (
    /software\s*(?:engineer|developer).*(?:in\s*test|,\s*test|[-–—|/]\s*test|\btest\b)/i.test(t)
  ) {
    return true;
  }
  if (
    /\btest\b/i.test(t) &&
    /\b(?:software|engineer|developer|automation|framework|code)\b/i.test(t)
  ) {
    return true;
  }

  // 2. JD / details specifies test automation responsibilities
  if (
    /\b(sdet|test automation|automation testing|qa automation|automated testing|automation framework|test framework|automated test suite|automated tests|writing automated tests|automated test scripts)\b/i.test(
      desc,
    )
  ) {
    return true;
  }

  // 3. Test automation tools in JD or skills with testing context
  const hasAutoTools =
    /\b(selenium|playwright|cypress|appium|restassured|testng|cucumber|robot framework|karate)\b/i.test(
      fullContext,
    );
  const hasTestingContext = /\b(test|testing|qa|automation|engineer|developer)\b/i.test(
    fullContext,
  );
  if (hasAutoTools && hasTestingContext) {
    return true;
  }

  return false;
}

/**
 * Checks whether a role has functional / core QA indicators in title, JD, or skills.
 */
export function hasCoreQaIndicators(
  jobTitle: string,
  jobDesc?: string | null,
  matchedSkills?: string[] | null,
): boolean {
  const t = (jobTitle || "").toLowerCase().trim();
  const desc = (jobDesc || "").toLowerCase();

  // 1. Direct title check
  if (
    /\b(qa\b|quality engineer|quality analyst|qa analyst|test engineer|test analyst|manual qa|manual tester|manual testing|quality assurance|tester|testing|validation|qc\b)\b/i.test(
      t,
    ) ||
    /\btest\b/i.test(t)
  ) {
    // Avoid unrelated product/business leadership titles
    if (!/\b(director of product|vp of product|head of product)\b/i.test(t)) {
      return true;
    }
  }

  // 2. JD / details check
  if (
    /\b(qa engineer|quality analyst|test engineer|manual testing|functional testing|exploratory testing|test cases|test execution|test plan|defect tracking|bug reporting|quality assurance|test scenarios)\b/i.test(
      desc,
    )
  ) {
    return true;
  }

  return hasQaTestIndicators(jobTitle, jobDesc, matchedSkills);
}

/**
 * Matches job title categories precisely.
 * Examines both the job title AND the job description (JD) and skills details
 * so specialized selections do not omit genuine roles.
 */
export function matchTitleCategory(
  jobTitle: string,
  category: string,
  jobDesc?: string | null,
  matchedSkills?: string[] | null,
): boolean {
  if (!category || category === "all") return true;
  const t = (jobTitle || "").toLowerCase().trim();
  const desc = (jobDesc || "").toLowerCase();

  // 1. All QA, SDET & Test Roles (Recommended)
  // Matches any role where title, JD, or details indicate a QA, SDET, or Testing role
  if (category === "all_qa") {
    return hasQaTestIndicators(jobTitle, jobDesc, matchedSkills);
  }

  // 2. SDET & Automation QA
  if (category === "sdet_qa") {
    return hasSdetAutomationIndicators(jobTitle, jobDesc, matchedSkills);
  }

  // 3. QA Engineer & Quality Analyst (Functional / Core QA)
  if (category === "manual_qa") {
    return hasCoreQaIndicators(jobTitle, jobDesc, matchedSkills);
  }

  // 4. QA Lead & QA/Test Manager (CRITICAL: Must be a QA/Test Leadership role, NOT unrelated leads/managers)
  if (category === "lead_manager") {
    const isLeadOrManager =
      /\b(lead|manager|head|director|principal|staff|architect|vp)\b/i.test(t) ||
      /\b(?:qa|test|quality)\s+(?:lead|manager|director|head)\b/i.test(desc);
    const isQaOrTest = hasQaTestIndicators(jobTitle, jobDesc, matchedSkills);
    return isLeadOrManager && isQaOrTest;
  }

  // 5. Performance & Security QA
  if (category === "performance_security") {
    return /\b(performance|load|stress|jmeter|k6|locust|gatling|security qa|appsec|penetration|pen test)\b/i.test(
      `${t} ${desc}`,
    );
  }

  // 6. Software Engineer (Backend / SDE)
  if (category === "swe_backend") {
    const isBackend =
      /\b(backend|software engineer|sde|developer|services|golang|java|python|platform)\b/i.test(
        `${t} ${desc}`,
      );
    const isTestRole =
      /\b(qa\b|sdet|test\b|tester|testing|software engineer in test)\b/i.test(t) ||
      /software\s*(?:engineer|developer).*(?:test|qa)/i.test(t);
    return isBackend && !isTestRole;
  }

  // 7. Frontend & Full Stack
  if (category === "frontend_fullstack") {
    const isFrontFull =
      /\b(frontend|front-end|full stack|fullstack|ui engineer|web developer|react|vue|angular)\b/i.test(
        `${t} ${desc}`,
      );
    const isTestRole =
      /\b(qa\b|sdet|test\b|tester|testing)\b/i.test(t) ||
      /software\s*(?:engineer|developer).*(?:test|qa)/i.test(t);
    return isFrontFull && !isTestRole;
  }

  // 8. DevOps & Cloud SRE
  if (category === "devops_cloud") {
    return /\b(devops|sre|cloud|infrastructure|reliability)\b/i.test(`${t} ${desc}`);
  }

  return true;
}

/**
 * Matches user search queries with semantic intelligence for QA, city aliases,
 * multi-token phrases, company names, and technical skills.
 */
export function matchJobSearchQuery(job: Job, rawQuery: string): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;

  const title = (job.title || "").toLowerCase();
  const company = (job.companies?.name || "").toLowerCase();
  const location = (job.location || "").toLowerCase();
  const desc = (job.description || "").toLowerCase();
  const skills = (job.matched_skills || []).map((s) => s.toLowerCase());

  // 1. Exact phrase match across title, company, or location
  if (title.includes(query) || company.includes(query) || location.includes(query)) {
    return true;
  }

  // 2. Location alias handling when user searches a city
  if (query === "bangalore" || query === "bengaluru") {
    if (/bangalore|bengaluru|\bblr\b|karnataka/i.test(location)) return true;
  }
  if (query === "delhi" || query === "noida" || query === "gurgaon" || query === "gurugram") {
    if (/delhi|gurgaon|gurugram|noida|\bncr\b/i.test(location)) return true;
  }

  // 3. Tokenized matching (ALL tokens in the search box must match)
  const tokens = query.split(/\s+/).filter(Boolean);

  return tokens.every((tok) => {
    // Semantic token: "qa"
    if (tok === "qa") {
      const isQaTitle =
        /\b(qa\b|sdet|test\b|tester|testing|test engineer|test lead|qa lead|qa manager|quality assurance|quality engineer|quality analyst|automation engineer|automation tester|test automation|qc\b|qe\b|software development engineer in test|software engineer in test)\b/i.test(
          title,
        ) ||
        /software\s*(?:engineer|developer).*(?:in\s*test|,\s*test|[-–—|/]\s*test|\btest\b)/i.test(
          title,
        );
      const isQaSkill = skills.some((sk) =>
        /\bqa\b|quality assurance|sdet|test automation|testing|\btest\b/i.test(sk),
      );
      const isQaCompany = /\bqa\b/i.test(company);
      const isQaDesc =
        /\b(qa\b|quality assurance|quality engineer|test automation|test framework|regression testing|qa engineer|test engineer|software engineer in test|sdet)\b/i.test(
          desc,
        );
      return isQaTitle || isQaSkill || isQaCompany || isQaDesc;
    }

    // Semantic token: "sdet"
    if (tok === "sdet") {
      const isSdetTitle =
        /\b(sdet|software development engineer in test|software engineer in test|test automation|automation engineer)\b/i.test(
          title,
        ) ||
        /software\s*(?:engineer|developer).*(?:in\s*test|,\s*test|[-–—|/]\s*test|\btest\b)/i.test(
          title,
        );
      const isSdetSkill = skills.some((sk) => /\bsdet\b|test automation|\btest\b/i.test(sk));
      const isSdetDesc =
        /\b(sdet|software engineer in test|software development engineer in test|test automation framework|automation engineer)\b/i.test(
          desc,
        );
      return isSdetTitle || isSdetSkill || isSdetDesc || desc.includes("sdet");
    }

    // Semantic token: "test" or "testing"
    if (tok === "test" || tok === "testing") {
      const isTestTitle =
        /\b(test\b|tester|testing|test engineer|qa\b|sdet|qc\b|qe\b|quality)\b/i.test(title) ||
        /software\s*(?:engineer|developer).*(?:in\s*test|,\s*test|[-–—|/]\s*test|\btest\b)/i.test(
          title,
        );
      const isTestSkill = skills.some((sk) =>
        /\b(test|testing|qa|sdet|automation|quality)\b/i.test(sk),
      );
      const isTestCompany = /\b(test|testing|qa)\b/i.test(company);
      const isTestDesc =
        /\b(test\b|tester|testing|test automation|test engineer|qa|test framework|regression testing|test cases)\b/i.test(
          desc,
        );
      return isTestTitle || isTestSkill || isTestCompany || isTestDesc;
    }

    // Semantic city tokens inside multi-word queries (e.g. "scopely bangalore")
    if (tok === "bangalore" || tok === "bengaluru") {
      return /bangalore|bengaluru|\bblr\b|karnataka/i.test(location);
    }
    if (tok === "delhi" || tok === "noida" || tok === "gurgaon" || tok === "gurugram") {
      return /delhi|gurgaon|gurugram|noida|\bncr\b/i.test(location);
    }

    // General token match
    if (title.includes(tok) || company.includes(tok) || location.includes(tok)) {
      return true;
    }
    if (skills.some((sk) => sk.includes(tok))) {
      return true;
    }
    if (tok.length <= 3) {
      const escaped = tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`\\b${escaped}\\b`, "i").test(desc);
    }
    return desc.includes(tok);
  });
}
