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
 * Matches job title categories precisely so specialized selections do not bleed into other roles
 * or omit genuine roles.
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
  const skillsText = (matchedSkills || []).join(" ").toLowerCase();
  const fullContext = `${t} ${desc} ${skillsText}`;

  // 1. All QA, SDET & Test Roles
  if (category === "all_qa") {
    return /\b(qa\b|sdet|tester|testing|test engineer|quality assurance|quality engineer|quality analyst|automation engineer|automation tester|test automation|qc\b|qe\b|software development engineer in test|software engineer in test)\b/i.test(
      t,
    );
  }

  // 2. SDET & Automation QA
  if (category === "sdet_qa") {
    const isExplicitAutomation =
      /\b(sdet|automation|qa automation|test automation|automation engineer|automation tester|qe\b|software development engineer in test|software engineer in test)\b/i.test(
        t,
      );
    if (isExplicitAutomation) return true;

    // QA/Test role that specifically includes test automation tools or framework responsibilities
    const isQaRole = /\b(qa\b|quality engineer|test engineer)\b/i.test(t);
    const hasAutomationContext =
      /automation|selenium|playwright|cypress|appium|restassured|testng|junit|cucumber|test framework/i.test(
        fullContext,
      );
    return isQaRole && hasAutomationContext;
  }

  // 3. QA Engineer & Quality Analyst (Functional / Core QA)
  if (category === "manual_qa") {
    const isCoreQa =
      /\b(qa engineer|quality engineer|quality analyst|qa analyst|test engineer|test analyst|manual qa|quality assurance|tester|testing|validation|qc\b)\b/i.test(
        t,
      ) || /\bqa\b/i.test(t);
    const isExecutiveOrDev =
      /\b(director of product|vp of product|head of product|backend|frontend)\b/i.test(t);
    return isCoreQa && !isExecutiveOrDev;
  }

  // 4. QA Lead & QA/Test Manager (CRITICAL: Must be a QA/Test Leadership role, NOT unrelated leads/managers)
  if (category === "lead_manager") {
    const isLeadOrManager = /\b(lead|manager|head|director|principal|staff|architect|vp)\b/i.test(
      t,
    );
    const isQaOrTest = /\b(qa\b|sdet|test|tester|testing|quality|qc\b|qe\b)\b/i.test(t);
    return isLeadOrManager && isQaOrTest;
  }

  // 5. Performance & Security QA
  if (category === "performance_security") {
    return /\b(performance|load|stress|jmeter|k6|locust|gatling|security qa|appsec|penetration|pen test)\b/i.test(
      t,
    );
  }

  // 6. Software Engineer (Backend / SDE)
  if (category === "swe_backend") {
    const isBackend =
      /\b(backend|software engineer|sde|developer|services|golang|java|python|platform)\b/i.test(t);
    const isQa = /\b(qa\b|sdet|tester|testing|test engineer|software engineer in test)\b/i.test(t);
    return isBackend && !isQa;
  }

  // 7. Frontend & Full Stack
  if (category === "frontend_fullstack") {
    const isFrontFull =
      /\b(frontend|front-end|full stack|fullstack|ui engineer|web developer|react|vue|angular)\b/i.test(
        t,
      );
    const isQa = /\b(qa\b|sdet|tester|testing|test engineer)\b/i.test(t);
    return isFrontFull && !isQa;
  }

  // 8. DevOps & Cloud SRE
  if (category === "devops_cloud") {
    return /\b(devops|sre|cloud|infrastructure|reliability)\b/i.test(t);
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
        /\b(qa\b|sdet|tester|testing|test engineer|test lead|qa lead|qa manager|quality assurance|quality engineer|quality analyst|automation engineer|automation tester|test automation|qc\b|qe\b|software development engineer in test|software engineer in test)\b/i.test(
          title,
        );
      const isQaSkill = skills.some((sk) =>
        /\bqa\b|quality assurance|sdet|test automation|testing/i.test(sk),
      );
      const isQaCompany = /\bqa\b/i.test(company);
      const isQaDesc =
        /\b(qa\b|quality assurance|quality engineer|test automation|test framework|regression testing|qa engineer)\b/i.test(
          desc,
        );
      return isQaTitle || isQaSkill || isQaCompany || isQaDesc;
    }

    // Semantic token: "sdet"
    if (tok === "sdet") {
      const isSdetTitle =
        /\b(sdet|software development engineer in test|software engineer in test|test automation|automation engineer)\b/i.test(
          title,
        );
      const isSdetSkill = skills.some((sk) => /\bsdet\b|test automation/i.test(sk));
      return isSdetTitle || isSdetSkill || desc.includes("sdet");
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
