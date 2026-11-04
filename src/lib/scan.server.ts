import dns from "node:dns";
import * as cheerio from "cheerio";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { computeATSScore, DEFAULT_SDET_RESUME } from "./ats-score";
import {
  isGenericSearchUrl,
  isJobAggregatorUrl,
  VERIFIED_PORTAL_DIRECTORY,
  KNOWN_DEAD_PORTAL_REDIRECTS,
  getRedirectForDeadPortal,
  probeCareerUrlLive,
  resolveDirectCareerUrl,
} from "./validate-career-url.server";
import { getGeminiClient } from "./canonical-career-search.server";

// Force IPv4 first to prevent hanging on IPv6 in container environment
try {
  dns.setDefaultResultOrder("ipv4first");
} catch {
  // ignore in non-node envs
}

type DB = SupabaseClient<Database>;

export class PauseError extends Error {}

export type ExtractedJob = {
  title: string;
  url: string;
  location: string;
  experience: string;
  description: string;
};

/** Directory of verified portals for major/popular tech employers to avoid unnecessary AI requests */
const KNOWN_COMPANY_PORTALS: Record<string, string> = VERIFIED_PORTAL_DIRECTORY;

/**
 * Uses verified directory or Gemini AI to locate genuine official careers portals.
 * Never throws, always returns a clean direct URL or empty string. Never returns search queries.
 */
export async function findCareersUrl(name: string, hint?: string): Promise<string> {
  const norm = name.trim().toLowerCase();
  if (KNOWN_COMPANY_PORTALS[norm]) {
    return KNOWN_COMPANY_PORTALS[norm]!;
  }
  const cleanNoParens = norm.replace(/\s*\([^)]*\)/g, "").trim();
  if (cleanNoParens && KNOWN_COMPANY_PORTALS[cleanNoParens]) {
    return KNOWN_COMPANY_PORTALS[cleanNoParens]!;
  }
  const matchInParens = norm
    .match(/\(([^)]+)\)/)?.[1]
    ?.trim()
    .toLowerCase();
  if (matchInParens && KNOWN_COMPANY_PORTALS[matchInParens]) {
    return KNOWN_COMPANY_PORTALS[matchInParens]!;
  }

  // Try matching without punctuation
  const stripped = norm.replace(/[^a-z0-9]/g, "");
  for (const [key, val] of Object.entries(KNOWN_COMPANY_PORTALS)) {
    if (key.replace(/[^a-z0-9]/g, "") === stripped) {
      return val;
    }
  }
  if (cleanNoParens) {
    const strippedClean = cleanNoParens.replace(/[^a-z0-9]/g, "");
    for (const [key, val] of Object.entries(KNOWN_COMPANY_PORTALS)) {
      if (key.replace(/[^a-z0-9]/g, "") === strippedClean) {
        return val;
      }
    }
  }

  const geminiAi = getGeminiClient();
  if (geminiAi) {
    const models = ["gemini-3.1-flash-lite", "gemini-3.8-flash", "gemini-flash-latest"];
    const prompt = `You are a talent research specialist.
Find the exact official careers portal or ATS job board URL for company: "${name}"${hint ? ` (Hint: ${hint})` : ""}.
CRITICAL: Do NOT return a Google search link (e.g. google.com/search). Do NOT return job aggregators like indeed or glassdoor.
If they use an ATS like Greenhouse, Lever, Ashby, or Workday, return that exact ATS URL.
If not found with certainty, return null.

Return ONLY a valid JSON object:
{
  "careers_url": "https://..." or null
}`;

    for (const model of models) {
      try {
        const response = await geminiAi.models.generateContent({
          model,
          contents: prompt,
          config: { responseMimeType: "application/json" },
        });
        const text = response.text;
        if (text) {
          let clean = text.trim();
          if (clean.startsWith("```")) {
            clean = clean.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
          }
          const parsed = JSON.parse(clean);
          if (
            parsed.careers_url &&
            /^https?:\/\//i.test(parsed.careers_url) &&
            !isGenericSearchUrl(parsed.careers_url) &&
            !isJobAggregatorUrl(parsed.careers_url)
          ) {
            return parsed.careers_url.trim();
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (
          msg.includes("API key not valid") ||
          msg.includes("API_KEY_INVALID") ||
          msg.includes("400") ||
          msg.includes("403")
        ) {
          break; // Avoid spamming other models if the key is invalid
        }
      }
    }
  }

  if (
    hint &&
    /^https?:\/\//i.test(hint) &&
    !isGenericSearchUrl(hint) &&
    !isJobAggregatorUrl(hint)
  ) {
    return hint;
  }

  // Never return a Google search URL as a career portal
  return "";
}

/** Expands keywords like "SDET" to cover related job titles */
function expandKeywords(keywords: string[]): string[] {
  const expanded = new Set<string>();
  for (const raw of keywords) {
    const k = raw.trim().toLowerCase();
    if (!k) continue;
    expanded.add(k);

    const isQaKeyword =
      k === "qa" ||
      k.includes("sdet") ||
      k.includes("test") ||
      k.includes("quality") ||
      k.includes("automation") ||
      k === "manual";

    if (isQaKeyword) {
      for (const syn of [
        "sdet",
        "qa",
        "quality",
        "test",
        "tester",
        "testing",
        "automation",
        "software development engineer in test",
        "software engineer in test",
        "test engineer",
        "qa engineer",
        "quality assurance",
        "quality engineer",
        "qe",
        "validation",
        "qc",
      ]) {
        expanded.add(syn);
      }
    } else if (
      k.includes("software") ||
      k.includes("engineer") ||
      k.includes("developer") ||
      k === "sde"
    ) {
      for (const syn of [
        "software",
        "engineer",
        "developer",
        "sde",
        "swe",
        "frontend",
        "backend",
        "fullstack",
        "full stack",
        "platform",
      ]) {
        expanded.add(syn);
      }
    }

    if (k.includes("devops") || k.includes("sre")) {
      for (const syn of ["devops", "sre", "cloud", "reliability", "infrastructure"]) {
        expanded.add(syn);
      }
    }

    if (k.includes("data")) {
      for (const syn of ["data", "analytics", "pipeline", "etl", "machine learning", "ml", "ai"]) {
        expanded.add(syn);
      }
    }
  }
  return Array.from(expanded);
}

function cleanHtmlText(raw?: string): string {
  if (!raw) return "";
  return raw
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]*>?/gm, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1200);
}

/** Direct fetch from Greenhouse Board API with nested department support */
async function fetchGreenhouseJobs(boardToken: string): Promise<ExtractedJob[] | null> {
  const jobsMap = new Map<string, ExtractedJob>();

  // 1. Direct jobs endpoint with content
  try {
    const res = await fetch(
      `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs?content=true`,
      {
        headers: { "User-Agent": "Mozilla/5.0" },
      },
    );
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.jobs)) {
        for (const j of data.jobs) {
          const id = String(j.id || j.internal_job_id || j.absolute_url || j.title);
          jobsMap.set(id, {
            title: (j.title || "Open Role").trim(),
            url: j.absolute_url || `https://job-boards.greenhouse.io/${boardToken}/jobs/${j.id}`,
            location: j.location?.name ?? "",
            experience: "",
            description: cleanHtmlText(j.content),
          });
        }
      }
    }
  } catch (e) {
    console.warn("Greenhouse /jobs fetch error:", e);
  }

  // 2. Departments endpoint to capture all nested department and sub-department roles
  try {
    const res = await fetch(
      `https://boards-api.greenhouse.io/v1/boards/${boardToken}/departments`,
      {
        headers: { "User-Agent": "Mozilla/5.0" },
      },
    );
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.departments)) {
        function collectDepartmentJobs(dept: Record<string, unknown>, deptName: string) {
          if (!dept || typeof dept !== "object") return;
          const currentDeptName = (
            (typeof dept.name === "string" ? dept.name : deptName) || ""
          ).trim();
          if (Array.isArray(dept.jobs)) {
            for (const j of dept.jobs as Record<string, unknown>[]) {
              const id = String(j.id || j.internal_job_id || j.absolute_url || j.title);
              if (!jobsMap.has(id)) {
                jobsMap.set(id, {
                  title: String(j.title || "Open Role").trim(),
                  url:
                    (typeof j.absolute_url === "string" && j.absolute_url) ||
                    `https://job-boards.greenhouse.io/${boardToken}/jobs/${j.id}`,
                  location: (j.location as { name?: string } | undefined)?.name ?? "",
                  experience: currentDeptName,
                  description: `${String(j.title)} in ${currentDeptName}`,
                });
              } else {
                // Enrich existing job with department category if empty
                const existing = jobsMap.get(id)!;
                if (!existing.experience && currentDeptName) {
                  existing.experience = currentDeptName;
                }
              }
            }
          }
          if (Array.isArray(dept.departments)) {
            for (const sub of dept.departments as Record<string, unknown>[]) {
              collectDepartmentJobs(
                sub,
                currentDeptName || (typeof sub.name === "string" ? sub.name : ""),
              );
            }
          }
        }
        for (const dept of data.departments as Record<string, unknown>[]) {
          collectDepartmentJobs(dept, typeof dept.name === "string" ? dept.name : "");
        }
      }
    }
  } catch (e) {
    console.warn("Greenhouse /departments fetch error:", e);
  }

  if (jobsMap.size > 0) {
    return Array.from(jobsMap.values());
  }
  return null;
}

/** Direct fetch from Lever Postings API */
async function fetchLeverJobs(company: string): Promise<ExtractedJob[] | null> {
  try {
    const res = await fetch(`https://api.lever.co/v0/postings/${company}?mode=json`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return null;
    const postings = await res.json();
    if (Array.isArray(postings) && postings.length > 0) {
      return postings.map(
        (j: {
          text: string;
          hostedUrl: string;
          categories?: { location?: string; commitment?: string };
          descriptionPlain?: string;
        }) => ({
          title: j.text || "Open Role",
          url: j.hostedUrl || `https://jobs.lever.co/${company}`,
          location: j.categories?.location ?? "",
          experience: j.categories?.commitment ?? "",
          description: j.descriptionPlain?.slice(0, 1200) ?? "",
        }),
      );
    }
  } catch (e) {
    console.warn("Lever fetch error:", e);
  }
  return null;
}

/** Direct fetch from SmartRecruiters Postings API */
async function fetchSmartRecruitersJobs(company: string): Promise<ExtractedJob[] | null> {
  try {
    const res = await fetch(
      `https://api.smartrecruiters.com/v1/companies/${company}/postings?limit=100`,
      {
        headers: { "User-Agent": "Mozilla/5.0" },
      },
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data && Array.isArray(data.content) && data.content.length > 0) {
      return data.content.map(
        (j: {
          id: string;
          name: string;
          location?: { city?: string; country?: string };
          typeOfEmployment?: { label?: string };
        }) => {
          const loc = [j.location?.city, j.location?.country].filter(Boolean).join(", ");
          return {
            title: j.name || "Open Role",
            url: `https://jobs.smartrecruiters.com/${company}/${j.id}`,
            location: loc,
            experience: j.typeOfEmployment?.label ?? "",
            description: `${j.name} at ${company} in ${loc}`,
          };
        },
      );
    }
  } catch (e) {
    console.warn("SmartRecruiters fetch error:", e);
  }
  return null;
}

/** Direct fetch from Ashby API */
async function fetchAshbyJobs(company: string): Promise<ExtractedJob[] | null> {
  try {
    const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${company}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && Array.isArray(data.jobs) && data.jobs.length > 0) {
      return data.jobs.map(
        (j: {
          title: string;
          jobUrl?: string;
          location?: string;
          descriptionPlain?: string;
          employmentType?: string;
        }) => ({
          title: j.title || "Open Role",
          url: j.jobUrl || `https://jobs.ashbyhq.com/${company}`,
          location: j.location ?? "",
          experience: j.employmentType ?? "",
          description: j.descriptionPlain?.slice(0, 1200) ?? "",
        }),
      );
    }
  } catch (e) {
    console.warn("Ashby fetch error:", e);
  }
  return null;
}

/** Direct fetch from Workday CXS API with explicit tenant and site */
async function fetchWorkdayJobsExplicit(
  host: string,
  tenant: string,
  site: string,
  companyName: string = "",
): Promise<ExtractedJob[] | null> {
  const jobs: ExtractedJob[] = [];
  const offsets = [0, 20];
  for (const offset of offsets) {
    try {
      const res = await fetch(`https://${host}/wday/cxs/${tenant}/${site}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
        body: JSON.stringify({ appliedFacets: {}, limit: 20, offset, searchText: "" }),
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) break;
      const data = await res.json();
      if (data && Array.isArray(data.jobPostings)) {
        for (const j of data.jobPostings) {
          jobs.push({
            title: j.title || "Open Role",
            url: j.externalPath
              ? `https://${host}/en-US/${site}${j.externalPath}`
              : `https://${host}/${site}`,
            location: j.locationsText ?? "",
            experience: j.timeType ?? "",
            description: `${j.title} at ${companyName || tenant} (${j.locationsText ?? "Various locations"})`,
          });
        }
        if (data.jobPostings.length < 20) break;
      }
    } catch (e) {
      console.debug(
        `Workday explicit fetch notice (${tenant}, offset ${offset}):`,
        e instanceof Error ? e.message : e,
      );
      if (jobs.length > 0) break;
    }
  }
  return jobs.length > 0 ? jobs : null;
}

/** Direct fetch from Google Careers via embedded AF_initDataCallback */
async function fetchGoogleCareersJobs(urlObj: URL): Promise<ExtractedJob[] | null> {
  try {
    const vm = await import("node:vm");
    const targetUrl = urlObj.href.includes("location=")
      ? urlObj.href
      : "https://careers.google.com/jobs/results/?location=India";

    const res = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const $ = cheerio.load(html);
    const jobs: ExtractedJob[] = [];

    $("script").each((_, el) => {
      const text = $(el).html() || "";
      if (
        text.includes("AF_initDataCallback") &&
        (text.includes("ds:1") || text.includes("jobs"))
      ) {
        const sandbox = {
          AF_initDataCallback: (opts: { data?: unknown[] }) => {
            if (Array.isArray(opts?.data?.[0])) {
              for (const item of opts.data[0] as unknown[][]) {
                if (item && item[1]) {
                  const id = String(item[0] || "");
                  const title = String(item[1] || "").trim();
                  const desc = cleanHtmlText(String(item[2] || ""));
                  const locArr = Array.isArray(item[9]) ? (item[9] as (string | unknown[])[]) : [];
                  const loc = locArr
                    .map((l) => (Array.isArray(l) ? String(l[0] || "") : String(l || "")))
                    .filter(Boolean)
                    .join("; ");

                  if (title && id) {
                    jobs.push({
                      title,
                      url: `https://www.google.com/about/careers/applications/jobs/results/${id}`,
                      location: loc || "India",
                      experience: "",
                      description: desc || `${title} at Google (${loc})`,
                    });
                  }
                }
              }
            }
          },
        };
        vm.createContext(sandbox);
        try {
          vm.runInContext(text, sandbox);
        } catch {
          // ignore parsing error
        }
      }
    });

    if (jobs.length > 0) return jobs;
  } catch (e) {
    console.debug("Google Careers fetch error:", e);
  }
  return null;
}

/** Direct fetch from Applied Materials (Radancy / TalentBrew platform) */
async function fetchAppliedMaterialsJobs(): Promise<ExtractedJob[] | null> {
  try {
    const endpoints = [
      "https://jobs.appliedmaterials.com/search-jobs/India",
      "https://jobs.appliedmaterials.com/search-jobs",
    ];
    for (const ep of endpoints) {
      const res = await fetch(ep, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(9000),
      });
      if (!res.ok) continue;
      const html = await res.text();
      const $ = cheerio.load(html);
      const jobs: ExtractedJob[] = [];

      $("a[data-job-id], a.search-results-list__job-link, a[href*='/job/']").each((_, el) => {
        const title = $(el).text().trim().replace(/\s+/g, " ");
        let href = $(el).attr("href");
        if (title && href && href.includes("/job/")) {
          if (!href.startsWith("http")) {
            href = `https://jobs.appliedmaterials.com${href}`;
          }
          const parent = $(el).closest("li, tr, .search-results-list__item, [data-job-id]");
          const location =
            parent
              .find(".job-location, .search-results-list__job-location, .location")
              .text()
              .trim() || "Bengaluru, India";
          if (!jobs.some((j) => j.title === title || j.url === href)) {
            jobs.push({
              title,
              url: href,
              location,
              experience: "",
              description: `${title} at Applied Materials (${location})`,
            });
          }
        }
      });

      if (jobs.length > 0) return jobs;
    }
  } catch (e) {
    console.debug("Applied Materials fetch error:", e);
  }
  return null;
}

/** Direct fetch from Amazon Jobs API */
async function fetchAmazonJobs(urlObj: URL): Promise<ExtractedJob[] | null> {
  try {
    const res = await fetch(
      "https://www.amazon.jobs/en/search.json?base_query=India&result_limit=100",
      {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(9000),
      },
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data && Array.isArray(data.jobs) && data.jobs.length > 0) {
      return data.jobs.map(
        (j: {
          title: string;
          job_path?: string;
          city?: string;
          country_code?: string;
          description?: string;
        }) => {
          const loc = [j.city, j.country_code].filter(Boolean).join(", ");
          return {
            title: j.title || "Open Role",
            url: j.job_path ? `https://www.amazon.jobs${j.job_path}` : urlObj.href,
            location: loc || "India",
            experience: "",
            description: cleanHtmlText(j.description || `${j.title} at Amazon`),
          };
        },
      );
    }
  } catch (e) {
    console.debug("Amazon Jobs fetch error:", e);
  }
  return null;
}

/** Direct fetch from Workday CXS API */
async function fetchWorkdayJobs(urlObj: URL): Promise<ExtractedJob[] | null> {
  try {
    const parts = urlObj.pathname.split("/").filter(Boolean);
    const site = parts[0];
    const hostParts = urlObj.hostname.split(".");
    const tenant = hostParts[0];
    if (!site || !tenant) return null;

    const jobs: ExtractedJob[] = [];
    const offsets = [0, 20];
    for (const offset of offsets) {
      try {
        const res = await fetch(`https://${urlObj.host}/wday/cxs/${tenant}/${site}/jobs`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
          body: JSON.stringify({ appliedFacets: {}, limit: 20, offset, searchText: "" }),
          signal: AbortSignal.timeout(12000),
        });
        if (!res.ok) break;
        const data = await res.json();
        if (data && Array.isArray(data.jobPostings)) {
          for (const j of data.jobPostings) {
            jobs.push({
              title: j.title || "Open Role",
              url: j.externalPath
                ? `https://${urlObj.host}/en-US/${site}${j.externalPath}`
                : `https://${urlObj.host}/${site}`,
              location: j.locationsText ?? "",
              experience: j.timeType ?? "",
              description: `${j.title} position in ${j.locationsText ?? "Various locations"}`,
            });
          }
          if (data.jobPostings.length < 20) break;
        }
      } catch (e) {
        console.debug(
          `Workday fetch notice (${tenant}, offset ${offset}):`,
          e instanceof Error ? e.message : e,
        );
        if (jobs.length > 0) break;
      }
    }
    return jobs.length > 0 ? jobs : null;
  } catch (e) {
    console.debug("Workday fetch notice:", e instanceof Error ? e.message : e);
  }
  return null;
}

/** Tries to identify ATS type and fetch structured jobs */
async function tryDirectAtsFetch(
  careersUrl: string,
  companyName: string = "",
): Promise<ExtractedJob[] | null> {
  try {
    const urlObj = new URL(careersUrl);
    const normName = companyName.toLowerCase().trim();

    // 0a. Google Careers
    if (urlObj.hostname.includes("careers.google.com") || urlObj.hostname.includes("google.com")) {
      const jobs = await fetchGoogleCareersJobs(urlObj);
      if (jobs && jobs.length > 0) return jobs;
    }

    // 0b. Applied Materials
    if (
      urlObj.hostname.includes("appliedmaterials.com") ||
      normName.includes("applied materials")
    ) {
      const jobs = await fetchAppliedMaterialsJobs();
      if (jobs && jobs.length > 0) return jobs;
    }

    // 0c. Amazon Jobs
    if (urlObj.hostname.includes("amazon.jobs")) {
      const jobs = await fetchAmazonJobs(urlObj);
      if (jobs && jobs.length > 0) return jobs;
    }

    // 0d. GE Healthcare Workday ATS
    if (
      urlObj.hostname.includes("gehealthcare.com") ||
      urlObj.hostname.includes("gehc.wd5.myworkdayjobs.com") ||
      normName.includes("ge healthcare") ||
      normName === "ge"
    ) {
      const jobs = await fetchWorkdayJobsExplicit(
        "gehc.wd5.myworkdayjobs.com",
        "gehc",
        "GEHC_ExternalSite",
        "GE Healthcare",
      );
      if (jobs && jobs.length > 0) return jobs;
    }

    // 0e. Target Workday ATS
    if (
      urlObj.hostname.includes("target.com") ||
      urlObj.hostname.includes("target.wd5.myworkdayjobs.com") ||
      normName === "target"
    ) {
      const jobs = await fetchWorkdayJobsExplicit(
        "target.wd5.myworkdayjobs.com",
        "target",
        "targetcareers",
        "Target",
      );
      if (jobs && jobs.length > 0) return jobs;
    }

    // 1. Greenhouse
    if (urlObj.hostname.includes("greenhouse.io")) {
      const parts = urlObj.pathname.split("/").filter(Boolean);
      let boardToken = parts[0];
      if (boardToken === "embed" || boardToken === "v1" || !boardToken) {
        boardToken = urlObj.searchParams.get("for") || parts[1] || "";
      }
      if (boardToken) {
        const jobs = await fetchGreenhouseJobs(boardToken);
        if (jobs && jobs.length > 0) return jobs;
      }
    }

    // 2. Lever
    if (urlObj.hostname.includes("lever.co")) {
      const parts = urlObj.pathname.split("/").filter(Boolean);
      const company = parts[0];
      if (company) {
        const jobs = await fetchLeverJobs(company);
        if (jobs && jobs.length > 0) return jobs;
      }
    }

    // 3. SmartRecruiters
    if (urlObj.hostname.includes("smartrecruiters.com")) {
      const parts = urlObj.pathname.split("/").filter(Boolean);
      const company = parts[0];
      if (company) {
        const jobs = await fetchSmartRecruitersJobs(company);
        if (jobs && jobs.length > 0) return jobs;
      }
    }

    // 4. Ashby
    if (urlObj.hostname.includes("ashbyhq.com")) {
      const parts = urlObj.pathname.split("/").filter(Boolean);
      const company = parts[0];
      if (company) {
        const jobs = await fetchAshbyJobs(company);
        if (jobs && jobs.length > 0) return jobs;
      }
    }

    // 5. Workday
    if (urlObj.hostname.includes("myworkdayjobs.com")) {
      const jobs = await fetchWorkdayJobs(urlObj);
      if (jobs && jobs.length > 0) return jobs;
    }
  } catch (e) {
    console.warn("tryDirectAtsFetch error:", e);
  }
  return null;
}

/**
 * Builds an exact, direct posting URL for a role rather than returning a generic homepage or career profile.
 */
export function makeExactPostingUrl(
  companyName: string,
  title: string,
  careersUrl: string,
  location?: string,
): string {
  const cleanTitle = title.replace(new RegExp(`^${companyName}\\s*[—–-]\\s*`, "i"), "").trim();
  const rawUrl = (careersUrl || "").trim();

  // If already a direct ATS requisition URL
  if (
    /\/(jobs|job|posting|postings|requisition|requisitions|viewjob)\/[a-zA-Z0-9_\-.]{4,}/i.test(
      rawUrl,
    ) &&
    !rawUrl.includes("#job-")
  ) {
    return rawUrl;
  }

  // Workday: query parameter filters directly to the specific job
  if (rawUrl.includes(".myworkdayjobs.com")) {
    const base = rawUrl.split("#")[0].split("?")[0];
    return `${base}?q=${encodeURIComponent(cleanTitle)}`;
  }

  // Uber: query parameter filters directly to the specific job
  if (rawUrl.includes("uber.com/")) {
    return `https://www.uber.com/in/en/careers/list/?query=${encodeURIComponent(cleanTitle)}`;
  }

  // Amazon jobs: base_query
  if (rawUrl.includes("amazon.jobs")) {
    return `https://www.amazon.jobs/en/search?base_query=${encodeURIComponent(cleanTitle)}`;
  }

  // Google careers: q
  if (rawUrl.includes("careers.google.com")) {
    return `https://careers.google.com/jobs/results/?q=${encodeURIComponent(cleanTitle)}`;
  }

  // Microsoft careers: q
  if (rawUrl.includes("microsoft.com")) {
    return `https://jobs.careers.microsoft.com/global/en/search?q=${encodeURIComponent(cleanTitle)}`;
  }

  // TCS: keyword
  if (rawUrl.includes("tcs.com")) {
    return `https://www.tcs.com/careers/search-jobs?keyword=${encodeURIComponent(cleanTitle)}`;
  }

  // Infosys: keyword
  if (rawUrl.includes("infosys.com")) {
    return `https://career.infosys.com/joblist?keyword=${encodeURIComponent(cleanTitle)}`;
  }

  // Return the career home page where the job opening was found
  return rawUrl.replace(/#job-\d+/i, "").trim() || careersUrl;
}

/** Cleans and normalizes job titles extracted from HTML tags or JSON blobs */
function sanitizeTitle(raw: string, companyName: string): string {
  let title = raw
    .replace(/\s+/g, " ")
    .replace(/^[\s•\-–—|:]+/, "")
    .replace(/[\s•\-–—|:]+$/, "")
    .trim();
  // Strip company name prefix e.g. "Scopely - Lead QA Engineer" -> "Lead QA Engineer"
  const compPrefix = new RegExp(`^${companyName}\\s*[-–—|:]\\s*`, "i");
  title = title.replace(compPrefix, "").trim();
  return title;
}

/** Determines if a string is a genuine job title and not navigational or promotional boilerplate */
function isValidJobTitle(title: string): boolean {
  if (!title || title.length < 3 || title.length > 130) return false;
  if (/^https?:\/\//i.test(title)) return false;
  const boilerplateRegex =
    /^(careers?|jobs?|all jobs|all roles|open positions|explore roles|search|apply|apply now|home|about|about us|contact|contact us|privacy|privacy policy|terms|terms of service|login|sign in|sign up|cookie|cookies|menu|navigation|back to top|filter|filter jobs|read more|learn more|view details|submit|newsletter|share|see all openings|fraud\s*alert|scam\s*alert|fraud\s*notice|security\s*notice|disclaimer|terms\s*and\s*conditions)$/i;
  if (boilerplateRegex.test(title.trim())) return false;
  if (/\b(fraud\s*alert|scam\s*alert)\b/i.test(title.trim())) return false;
  if (!/[a-zA-Z]/.test(title)) return false;
  return true;
}

/**
 * Robust HTML parser extracting nested job listings, department accordions,
 * Schema.org JSON-LD, preloaded React/Next/Nuxt data, and table rows using Cheerio.
 */
export function parseJobsFromHtml(
  html: string,
  pageUrl: string,
  companyName: string,
): ExtractedJob[] {
  const jobsMap = new Map<string, ExtractedJob>();

  function addJob(job: ExtractedJob) {
    const cleanTitle = sanitizeTitle(job.title, companyName);
    if (!isValidJobTitle(cleanTitle)) return;

    let finalUrl = (job.url || "").trim();
    if (/\.pdf(?:$|\?)/i.test(finalUrl)) return;
    if (!finalUrl || finalUrl === "#" || finalUrl.startsWith("javascript:")) {
      finalUrl = makeExactPostingUrl(companyName, cleanTitle, pageUrl, job.location);
    } else {
      try {
        finalUrl = new URL(finalUrl, pageUrl).href;
      } catch {
        finalUrl = makeExactPostingUrl(companyName, cleanTitle, pageUrl, job.location);
      }
    }
    if (/\.pdf(?:$|\?)/i.test(finalUrl)) return;

    const cleanLocation = (job.location || "").trim();
    const cleanExperience = (job.experience || "").trim();
    const cleanDesc = cleanHtmlText(job.description);

    // Look for existing entry to enrich or deduplicate
    for (const [, existing] of jobsMap.entries()) {
      const sameUrl = Boolean(existing.url && finalUrl && existing.url === finalUrl);
      const sameTitle = existing.title.toLowerCase() === cleanTitle.toLowerCase();

      // If it's the exact same URL, or same title with compatible locations
      if (
        sameUrl ||
        (sameTitle &&
          (!existing.location ||
            !cleanLocation ||
            existing.location.toLowerCase() === cleanLocation.toLowerCase() ||
            /^(remote|hybrid|onsite|on-site)$/i.test(existing.location)))
      ) {
        if (
          (!existing.location || /^(remote|hybrid|onsite|on-site)$/i.test(existing.location)) &&
          cleanLocation
        ) {
          existing.location = cleanLocation;
        }
        if ((!existing.experience || existing.experience === "Technology") && cleanExperience) {
          existing.experience = cleanExperience;
        }
        if ((!existing.description || existing.description.length < 50) && cleanDesc) {
          existing.description = cleanDesc;
        }
        if (
          (!existing.url || existing.url.includes("google.com/search")) &&
          finalUrl &&
          !finalUrl.includes("google.com/search")
        ) {
          existing.url = finalUrl;
        }
        return;
      }
    }

    const normKey = `${cleanTitle.toLowerCase()}::${cleanLocation.toLowerCase().slice(0, 30)}::${finalUrl}`;
    jobsMap.set(normKey, {
      title: cleanTitle,
      url: finalUrl,
      location: cleanLocation,
      experience: cleanExperience,
      description: cleanDesc,
    });
  }

  // 1. Schema.org JSON-LD Extraction (Handles top-level, @graph, and itemListElement)
  const jsonLdRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let jsonMatch;
  while ((jsonMatch = jsonLdRegex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(jsonMatch[1] || "{}");
      function processJsonLdNode(node: unknown) {
        if (!node || typeof node !== "object") return;
        if (Array.isArray(node)) {
          node.forEach(processJsonLdNode);
          return;
        }
        const obj = node as Record<string, unknown>;
        if (obj["@type"] === "JobPosting") {
          const locObj = (obj.jobLocation as Record<string, unknown> | undefined)?.address;
          const locStr =
            typeof locObj === "string"
              ? locObj
              : [
                  (locObj as Record<string, string> | undefined)?.addressLocality,
                  (locObj as Record<string, string> | undefined)?.addressRegion,
                  (locObj as Record<string, string> | undefined)?.addressCountry,
                ]
                  .filter(Boolean)
                  .join(", ");
          addJob({
            title: typeof obj.title === "string" ? obj.title : "",
            url: typeof obj.url === "string" ? obj.url : "",
            location: locStr || "",
            experience:
              typeof obj.experienceRequirements === "string" ? obj.experienceRequirements : "",
            description: typeof obj.description === "string" ? obj.description : "",
          });
        }
        if (obj["@graph"]) processJsonLdNode(obj["@graph"]);
        if (obj.itemListElement && Array.isArray(obj.itemListElement)) {
          for (const elem of obj.itemListElement) {
            if (elem && typeof elem === "object" && "item" in elem) {
              processJsonLdNode((elem as Record<string, unknown>).item);
            } else {
              processJsonLdNode(elem);
            }
          }
        }
      }
      processJsonLdNode(parsed);
    } catch {
      // ignore JSON parse error in script tag
    }
  }

  // 2. Preloaded State Extraction (__NEXT_DATA__, __NUXT_DATA__, inline window state)
  const stateRegex =
    /<script[^>]*id=["'](?:__NEXT_DATA__|__NUXT_DATA__)["'][^>]*>([\s\S]*?)<\/script>|<script[^>]*>[\s\S]*?window\.(?:__INITIAL_STATE__|__PRELOADED_STATE__|careersData|jobsData)\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/gi;
  let stateMatch;
  while ((stateMatch = stateRegex.exec(html)) !== null) {
    try {
      const rawJson = stateMatch[1] || stateMatch[2];
      if (rawJson) {
        const parsed = JSON.parse(rawJson);
        function findJobsInObject(obj: unknown, depth = 0) {
          if (!obj || depth > 8 || typeof obj !== "object") return;
          if (Array.isArray(obj)) {
            for (const item of obj) {
              if (item && typeof item === "object") {
                const o = item as Record<string, unknown>;
                const title = (o.title ||
                  o.jobTitle ||
                  o.roleTitle ||
                  o.name ||
                  o.positionTitle) as string | undefined;
                const url = (o.url ||
                  o.jobUrl ||
                  o.absolute_url ||
                  o.hostedUrl ||
                  o.applyUrl ||
                  o.externalPath) as string | undefined;
                if (
                  typeof title === "string" &&
                  isValidJobTitle(title) &&
                  (typeof url === "string" || o.id || o.requisitionId)
                ) {
                  const loc =
                    (o.location as { name?: string } | undefined)?.name ||
                    (typeof o.location === "string" ? o.location : "") ||
                    (typeof o.city === "string" ? o.city : "") ||
                    "";
                  addJob({
                    title,
                    url: typeof url === "string" ? url : "",
                    location: loc,
                    experience: (o.department as string) || (o.category as string) || "",
                    description:
                      (o.description as string) || (o.snippet as string) || `${title} position`,
                  });
                  continue;
                }
                findJobsInObject(item, depth + 1);
              }
            }
          } else {
            for (const k of Object.keys(obj as Record<string, unknown>)) {
              findJobsInObject((obj as Record<string, unknown>)[k], depth + 1);
            }
          }
        }
        findJobsInObject(parsed);
      }
    } catch {
      // ignore
    }
  }

  // 3. Cheerio DOM Tree Traversal
  try {
    const $ = cheerio.load(html);

    // Remove noisy elements that interfere with text extraction
    $("script, style, noscript, svg, nav, footer, header").remove();

    // Helper: Extract location from element, table cells, or parent container
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function extractLocation($el: cheerio.Cheerio<any>): string {
      const primaryLocSelector =
        '[class*="location"], [class*="loc"], [class*="city"], [class*="office"], [class*="region"], [class*="country"], [class*="geo"], [data-location], [data-city], [data-office]';

      let foundLoc = "";
      let foundModality = "";

      $el.find(primaryLocSelector).each((_, el) => {
        const txt = $(el).text().trim();
        if (!txt || /apply|view details|learn more/i.test(txt) || txt.length > 120) return;
        if (/^(remote|hybrid|onsite|on-site)$/i.test(txt)) {
          if (!foundModality) foundModality = txt;
          return;
        }
        foundLoc = txt;
        return false;
      });

      if (foundLoc) return foundLoc;

      // Check table cells if inside a table row or containing cells
      const isTr = $el.is("tr");
      const tds = isTr ? $el.find("td") : $el.find("tr td");
      if (tds.length > 0) {
        const $table = $el.closest("table");
        if ($table.length) {
          let locIdx = -1;
          $table.find("thead th, tr th").each((idx, th) => {
            if (/loc|city|office|region|country/i.test($(th).text())) {
              locIdx = idx;
              return false;
            }
          });
          if (locIdx >= 0) {
            const td = tds.eq(locIdx);
            if (td.length) {
              const txt = td.text().trim();
              if (txt && !/apply/i.test(txt)) {
                if (/^(remote|hybrid|onsite|on-site)$/i.test(txt)) {
                  if (!foundModality) foundModality = txt;
                } else {
                  return txt;
                }
              }
            }
          }
        }

        let cellLoc = "";
        tds.each((_, td) => {
          const $td = $(td);
          const cls = ($td.attr("class") || "").toLowerCase();
          const txt = $td.text().trim();
          if (/loc|city|office|region|country/i.test(cls) && txt && !/apply/i.test(txt)) {
            if (/^(remote|hybrid|onsite|on-site)$/i.test(txt)) {
              if (!foundModality) foundModality = txt;
              return;
            }
            cellLoc = txt;
            return false;
          }
          if (
            !cellLoc &&
            txt &&
            txt.length < 80 &&
            /,|remote|hybrid|onsite|on-site|india|usa|us|united states|uk|spain|germany|singapore|canada|london|bangalore|bengaluru/i.test(
              txt,
            ) &&
            !$td.find("a").length
          ) {
            if (/^(remote|hybrid|onsite|on-site)$/i.test(txt)) {
              if (!foundModality) foundModality = txt;
            } else {
              cellLoc = txt;
            }
          }
        });
        if (cellLoc) return cellLoc;
      }

      // Check closest parent container for real location tag first
      const parentContainer = $el.closest(
        'tr, li, [class*="job-card"], [class*="job-item"], [class*="job_item"], [class*="job-row"], [class*="job"], [class*="opening"], [class*="card"], [class*="item"]',
      );
      if (parentContainer.length && parentContainer[0] !== $el[0]) {
        const parentLoc = extractLocation(parentContainer);
        if (parentLoc) return parentLoc;
      }

      // Secondary fallback: workplace badge (e.g. Remote / Hybrid)
      if (foundModality) return foundModality;
      const workplaceEl = $el.find('[class*="workplace"], [data-workplace]').first();
      if (workplaceEl.length) {
        const txt = workplaceEl.text().trim();
        if (txt && !/apply/i.test(txt) && txt.length < 120) {
          return txt;
        }
      }

      return "";
    }

    // Helper: Extract department from element or table cells
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function extractDepartment($el: cheerio.Cheerio<any>, fallbackDept: string): string {
      const deptSelector =
        '[class*="department"], [class*="dept"], [class*="team"], [class*="category"], [class*="group"], [data-department]';
      const directEl = $el.find(deptSelector).first();
      if (directEl.length) {
        const txt = directEl.text().trim();
        if (txt && txt.length < 100) return txt;
      }

      const isTr = $el.is("tr");
      const tds = isTr ? $el.find("td") : $el.find("tr td");
      if (tds.length > 0) {
        const $table = $el.closest("table");
        if ($table.length) {
          let deptIdx = -1;
          $table.find("thead th, tr th").each((idx, th) => {
            if (/dept|team|category|function|business/i.test($(th).text())) {
              deptIdx = idx;
              return false;
            }
          });
          if (deptIdx >= 0) {
            const td = tds.eq(deptIdx);
            if (td.length) {
              const txt = td.text().trim();
              if (txt && !/apply/i.test(txt)) return txt;
            }
          }
        }

        let cellDept = "";
        tds.each((_, td) => {
          const $td = $(td);
          const cls = ($td.attr("class") || "").toLowerCase();
          if (/dept|team|category|function/i.test(cls)) {
            cellDept = $td.text().trim();
            return false;
          }
        });
        if (cellDept) return cellDept;
      }

      return fallbackDept;
    }

    // Strategy A: Nested Department / Team Accordions
    const deptContainers = $(
      'section, div[class*="department"], div[class*="team"], div[class*="category"], div[class*="group"], [data-department]',
    );
    deptContainers.each((_, deptEl) => {
      const $dept = $(deptEl);
      const deptName = $dept
        .find('h1, h2, h3, h4, [class*="dept-title"], [class*="category-title"]')
        .first()
        .text()
        .trim();

      let nestedItems = $dept.find(
        'li, tr, [class*="job-card"], [class*="job-item"], [class*="job_item"], [class*="job-row"], [class*="job-listing"], [class*="job-opening"], [class*="career-card"], [class*="career-item"], [class*="opening-card"], [class*="position-card"]',
      );
      if (nestedItems.length === 0) {
        nestedItems = $dept.find(
          'li, tr, [class*="job"], [class*="opening"], [class*="card"], [class*="role"], [class*="position"]',
        );
      }
      if (nestedItems.length === 0) {
        nestedItems = $dept.find("a[href]");
      }

      nestedItems.each((_, itemEl) => {
        const $item = $(itemEl);
        const $link = $item.is("a")
          ? $item
          : $item.find("a[href]").not('[class*="apply"], [href*="apply"]').first();
        const effectiveLink = $link.length ? $link : $item.find("a[href]").first();
        const titleEl = $item
          .find('h1, h2, h3, h4, h5, h6, [class*="title"], [class*="role"], [class*="name"]')
          .first();
        const rawTitle = titleEl.length ? titleEl.text().trim() : effectiveLink.text().trim();

        if (isValidJobTitle(rawTitle)) {
          const href = effectiveLink.attr("href") || "";
          const loc = extractLocation($item);
          const dept = extractDepartment($item, deptName);
          addJob({
            title: rawTitle,
            url: href,
            location: loc,
            experience: dept,
            description: `${rawTitle}${dept ? ` in ${dept}` : ""}${loc ? ` - ${loc}` : ""}`,
          });
        }
      });
    });

    // Strategy B: General Job Card / Row Selectors
    const cardSelectors = [
      '[class*="job-item"]',
      '[class*="job-card"]',
      '[class*="job_item"]',
      '[class*="job-row"]',
      '[class*="job-listing"]',
      '[class*="job_listing"]',
      '[class*="job-post"]',
      '[class*="job-opening"]',
      '[class*="jobCard"]',
      '[class*="jobItem"]',
      '[class*="jobListing"]',
      '[class*="career-item"]',
      '[class*="career-card"]',
      '[class*="career-opening"]',
      '[class*="career-post"]',
      '[class*="careerCard"]',
      '[class*="opening-card"]',
      '[class*="opening-item"]',
      '[class*="position-card"]',
      '[class*="position-item"]',
      '[class*="position-row"]',
      "[data-job-id]",
      '[data-qa="job-card"]',
      '[data-testid*="job"]',
      '[role="listitem"]',
      "table tbody tr",
    ];

    $(cardSelectors.join(", ")).each((_, el) => {
      const $card = $(el);
      const $link = $card.is("a")
        ? $card
        : $card.find("a[href]").not('[class*="apply"], [href*="apply"]').first();
      const effectiveLink = $link.length ? $link : $card.find("a[href]").first();
      const titleEl = $card
        .find(
          'h1, h2, h3, h4, h5, h6, [class*="title"], [class*="role"], [class*="name"], [class*="position"]',
        )
        .first();
      const rawTitle = titleEl.length ? titleEl.text().trim() : effectiveLink.text().trim();

      if (isValidJobTitle(rawTitle)) {
        const href = effectiveLink.attr("href") || "";
        const loc = extractLocation($card);
        const dept = extractDepartment($card, "");
        const snippet = $card.text().slice(0, 300);

        addJob({
          title: rawTitle,
          url: href,
          location: loc,
          experience: dept,
          description: snippet,
        });
      }
    });

    // Strategy C: Anchor scanning for job-specific links (Fallback if cards were few)
    if (jobsMap.size < 5) {
      $("a[href]").each((_, aEl) => {
        const $a = $(aEl);
        const href = $a.attr("href") || "";
        const isJobUrl =
          /\/(jobs?|careers?|positions?|openings?|requisitions?|posting|viewjob|gh_jid)\/[a-zA-Z0-9_\-.~%]+/i.test(
            href,
          );

        if (isJobUrl) {
          const heading = $a.find("h1, h2, h3, h4, h5, h6").first();
          const rawTitle = heading.length ? heading.text().trim() : $a.text().trim();

          if (isValidJobTitle(rawTitle)) {
            const parentText = $a.parent().text().replace(rawTitle, "").trim();
            addJob({
              title: rawTitle,
              url: href,
              location: parentText.slice(0, 80),
              experience: "",
              description: `${rawTitle} position`,
            });
          }
        }
      });
    }
  } catch (e) {
    console.warn("Cheerio parse error:", e);
  }

  return Array.from(jobsMap.values());
}

/** Fallback to Gemini AI when webpage is heavily JS-rendered or non-standard */
async function extractJobsWithAiFallback(
  html: string,
  careersUrl: string,
  companyName: string,
): Promise<ExtractedJob[] | null> {
  const geminiAi = getGeminiClient();
  if (!geminiAi) return null;

  try {
    const $ = cheerio.load(html);
    $("script, style, noscript, svg, nav, footer, header").remove();
    const cleanText = $("body").text().replace(/\s+/g, " ").trim().slice(0, 8000);
    if (!cleanText || cleanText.length < 150) return null;

    const prompt = `You are an expert talent scraper.
Extract all open job opportunities from this career page text for company "${companyName}".
Ensure all roles, especially QA, SDET, Lead QA, QA Engineer, Tester, Quality Assurance, and Engineering roles are captured.

Webpage Careers URL: ${careersUrl}
Page text snippet:
${cleanText}

Return ONLY a valid JSON array of objects:
[
  {
    "title": "Exact Role Title",
    "url": "Direct link or posting URL if present, otherwise ${careersUrl}",
    "location": "Location if mentioned",
    "experience": "Experience/department if mentioned",
    "description": "Short 1-2 sentence description"
  }
]`;

    const response = await geminiAi.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: prompt,
      config: { responseMimeType: "application/json" },
    });

    const text = response.text;
    if (text) {
      let clean = text.trim();
      if (clean.startsWith("```")) {
        clean = clean.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      }
      const parsed = JSON.parse(clean);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
          .filter((j) => j && typeof j.title === "string" && isValidJobTitle(j.title))
          .map((j) => ({
            title: sanitizeTitle(j.title, companyName),
            url:
              j.url && /^https?:\/\//i.test(j.url)
                ? j.url
                : makeExactPostingUrl(companyName, j.title, careersUrl, j.location),
            location: j.location || "",
            experience: j.experience || "",
            description: cleanHtmlText(j.description) || `${j.title} at ${companyName}`,
          }));
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (
      msg.includes("API key not valid") ||
      msg.includes("API_KEY_INVALID") ||
      msg.includes("400") ||
      msg.includes("403")
    ) {
      console.warn(
        `AI extraction skipped for "${companyName}": Gemini API key is missing or invalid. Check Settings > Secrets.`,
      );
    } else {
      console.warn(`AI extraction fallback notice for "${companyName}":`, msg);
    }
  }
  return null;
}

/** Fetches webpage HTML, follows redirects, checks embedded ATS links, runs Cheerio HTML parser and AI fallback */
async function tryWebAndHtmlExtraction(
  careersUrl: string,
  companyName: string,
  keywords: string[],
): Promise<ExtractedJob[] | null> {
  // Reject search engines and aggregators before issuing HTTP requests
  if (isGenericSearchUrl(careersUrl) || isJobAggregatorUrl(careersUrl)) {
    return null;
  }

  // Automatic translation of known dead or broken subdomains
  let targetUrl = careersUrl;
  for (const [deadPattern, canonicalUrl] of Object.entries(KNOWN_DEAD_PORTAL_REDIRECTS)) {
    if (targetUrl.includes(deadPattern)) {
      targetUrl = canonicalUrl;
      break;
    }
  }

  try {
    const res = await fetch(targetUrl, {
      signal: AbortSignal.timeout(8000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
    });

    if (!res.ok) return null;

    if (res.url && res.url !== targetUrl) {
      const redirectedAtsJobs = await tryDirectAtsFetch(res.url);
      if (redirectedAtsJobs && redirectedAtsJobs.length > 0) {
        return redirectedAtsJobs;
      }
    }

    const html = await res.text();
    if (!html || html.length < 100) return null;

    // Check for ATS links or iframes in the page HTML
    const linkMatches = html.match(/https?:\/\/[^"'\s<>]+/gi) || [];
    for (const link of linkMatches) {
      if (
        link.includes("boards.greenhouse.io") ||
        link.includes("job-boards.greenhouse.io") ||
        link.includes("jobs.lever.co") ||
        link.includes("careers.smartrecruiters.com") ||
        link.includes("jobs.ashbyhq.com")
      ) {
        const atsJobs = await tryDirectAtsFetch(link);
        if (atsJobs && atsJobs.length > 0) return atsJobs;
      }
    }

    // Run Cheerio-powered robust HTML parser (handles nested accordions, cards, JSON-LD, preloaded state)
    const domJobs = parseJobsFromHtml(html, res.url || targetUrl, companyName);
    if (domJobs && domJobs.length > 0) {
      return domJobs;
    }

    // If static DOM extraction found nothing, fallback to AI extraction over text content
    const aiJobs = await extractJobsWithAiFallback(html, res.url || targetUrl, companyName);
    if (aiJobs && aiJobs.length > 0) {
      return aiJobs;
    }
  } catch (e) {
    // If the provided careersUrl failed (e.g. outdated host like jobs.amd.com or careers.sw.siemens.com),
    // attempt to fallback to the curated verified portal for this company if one exists and differs
    const verifiedPortal = await findCareersUrl(companyName).catch(() => null);
    if (verifiedPortal && verifiedPortal !== targetUrl) {
      try {
        const retryRes = await fetch(verifiedPortal, {
          signal: AbortSignal.timeout(8000),
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
          redirect: "follow",
        });
        if (retryRes.ok) {
          const retryHtml = await retryRes.text();
          if (retryHtml && retryHtml.length >= 100) {
            const domJobs = parseJobsFromHtml(
              retryHtml,
              retryRes.url || verifiedPortal,
              companyName,
            );
            if (domJobs && domJobs.length > 0) return domJobs;
            const aiJobs = await extractJobsWithAiFallback(
              retryHtml,
              retryRes.url || verifiedPortal,
              companyName,
            );
            if (aiJobs && aiJobs.length > 0) return aiJobs;
          }
        }
      } catch {
        // ignore retry errors
      }
    }

    console.debug(
      `[JobScanner] Careers page for "${companyName}" (${careersUrl}) requires browser rendering or is unreachable`,
    );
  }
  return null;
}

function computeJobRelevance(job: ExtractedJob, keywords: string[], expanded: string[]): number {
  let score = 0;
  const title = job.title.toLowerCase();
  const desc = (job.description || "").toLowerCase();

  // 1. Direct user keywords matching title (Highest Priority)
  for (const kw of keywords) {
    const k = kw.trim().toLowerCase();
    if (!k) continue;
    const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const wordRegex = new RegExp(`(?:^|[\\s,;:.()/-])${escaped}(?:$|[\\s,;:.()/-])`, "i");
    if (wordRegex.test(title)) {
      score += 150;
    } else if (title.includes(k)) {
      score += 70;
    }
  }

  // 2. Specialized QA / SDET title detection (Guarantees QA roles always surface first)
  const isQaTitle =
    /\b(qa\b|sdet|test\b|tester|testing|test engineer|test lead|lead qa|qa lead|qa manager|quality assurance|quality engineer|quality analyst|automation engineer|automation tester|test automation|qc\b|qe\b|software development engineer in test|software engineer in test)\b/i.test(
      title,
    ) ||
    /software\s*(?:engineer|developer).*(?:in\s*test|,\s*test|[-–—|/]\s*test|\btest\b)/i.test(
      title,
    );
  if (isQaTitle) {
    score += 200;
  }

  // 2b. Explicit high-priority boost for 'lead qa' and 'qa engineer'
  if (/\b(lead\s*qa|qa\s*lead|test\s*lead|lead\s*test|lead\s*quality)\b/i.test(title)) {
    score += 150;
  }
  if (
    /\b(qa\s*engineer|quality\s*engineer|sdet|automation\s*engineer|test\s*engineer)\b/i.test(title)
  ) {
    score += 120;
  }

  // 3. Expanded keywords in title
  for (const exp of expanded) {
    const escaped = exp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const wordRegex = new RegExp(`(?:^|[\\s,;:.()/-])${escaped}(?:$|[\\s,;:.()/-])`, "i");
    if (wordRegex.test(title)) {
      score += 40;
    }
  }

  // 4. Core technical test automation tools in description
  const coreTools = [
    "selenium",
    "playwright",
    "cypress",
    "restassured",
    "postman",
    "appium",
    "junit",
    "testng",
    "cucumber",
    "automation framework",
    "test automation",
    "regression testing",
  ];
  for (const tool of coreTools) {
    if (desc.includes(tool)) {
      score += 20;
    }
  }

  // 5. Keyword presence in description with word boundaries
  for (const kw of keywords) {
    const k = kw.trim().toLowerCase();
    if (!k) continue;
    const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const wordRegex = new RegExp(`(?:^|[\\s,;:.()/-])${escaped}(?:$|[\\s,;:.()/-])`, "i");
    if (wordRegex.test(desc)) {
      score += 10;
    }
  }

  return score;
}

export async function extractJobs(
  careersUrl: string,
  keywords: string[],
  companyName: string = "Company",
): Promise<ExtractedJob[]> {
  try {
    // Step 1: Direct public ATS API
    let candidateJobs = await tryDirectAtsFetch(careersUrl, companyName);

    // Step 2: Web fetch + link inspection + Schema.org + page text
    if (!candidateJobs || candidateJobs.length === 0) {
      candidateJobs = await tryWebAndHtmlExtraction(careersUrl, companyName, keywords);
    }

    // Step 3: If jobs were retrieved from ATS or HTML, filter and rank by relevance
    if (candidateJobs && candidateJobs.length > 0) {
      const expanded = expandKeywords(keywords);

      const scoredJobs = candidateJobs.map((j) => ({
        job: j,
        relevance: computeJobRelevance(j, keywords, expanded),
      }));

      // Sort by relevance score descending so direct QA/SDET/Target matches are ALWAYS first
      scoredJobs.sort((a, b) => b.relevance - a.relevance);

      const topMatches = scoredJobs.filter((s) => s.relevance > 0);
      if (topMatches.length > 0) {
        return topMatches.slice(0, 100).map((s) => s.job);
      }

      // If no explicit keyword matches, return candidate jobs
      return candidateJobs.slice(0, 60);
    }
  } catch (e) {
    console.warn(`Extraction error for ${companyName}:`, e);
  }

  // When no authentic openings exist, return empty array so stale or closed roles do not display
  return [];
}

type Score = {
  index: number;
  score: number;
  summary: string;
  matched: string[];
  missing: string[];
};

export async function scoreJobs(
  resume: string,
  jobs: { title: string; description: string | null }[],
): Promise<Score[]> {
  const resumeText = resume.trim() || DEFAULT_SDET_RESUME;
  if (jobs.length === 0) return [];

  // Compute baseline using enterprise ATS rubric immediately
  const scores: Score[] = jobs.map((j, i) => {
    const res = computeATSScore(resumeText, j.title, j.description);
    return {
      index: i,
      score: res.score,
      summary: res.summary,
      matched: res.matched,
      missing: res.missing,
    };
  });

  return scores;
}

/** Scans one tracked company for a user using verified database schema. */
export async function scanTrackedCompany(db: DB, userId: string, trackedId: string) {
  const { data: tracked, error } = await db
    .from("tracked_companies")
    .select("id, company_id, companies(id, name, careers_url)")
    .eq("id", trackedId)
    .eq("user_id", userId)
    .single();
  if (error || !tracked) throw new Error("Company not found");
  const company = tracked.companies as unknown as {
    id: string;
    name: string;
    careers_url: string | null;
  };

  const { data: settings } = await db
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  const keywords = settings?.role_keywords?.length
    ? settings.role_keywords
    : ["SDET", "Software Engineer"];
  const resume = settings?.resume_text?.trim() || DEFAULT_SDET_RESUME;

  try {
    let careersUrl = company.careers_url;
    const normName = company.name.trim().toLowerCase();
    const hasKnownPortal = Boolean(KNOWN_COMPANY_PORTALS[normName]);

    // 1. Check if the URL is known to be dead and has a direct canonical replacement
    const deadRedirect = getRedirectForDeadPortal(careersUrl);
    if (deadRedirect && deadRedirect !== careersUrl) {
      careersUrl = deadRedirect;
      await db.from("companies").update({ careers_url: deadRedirect }).eq("id", company.id);
    }

    // 2. Check if known verified portal exists and differs from current
    if (hasKnownPortal && KNOWN_COMPANY_PORTALS[normName] !== careersUrl) {
      careersUrl = KNOWN_COMPANY_PORTALS[normName];
      await db.from("companies").update({ careers_url: careersUrl }).eq("id", company.id);
    }

    // 3. Fast probe to verify URL is reachable and not returning 404 Not Found
    const isSearchUrl = Boolean(careersUrl && isGenericSearchUrl(careersUrl));
    let isDead404 = false;
    if (careersUrl && !isSearchUrl) {
      const probe = await probeCareerUrlLive(careersUrl);
      if (!probe.isAlive && probe.statusCode === 404) {
        isDead404 = true;
      }
    }

    const isSuspiciousUrl =
      !careersUrl ||
      isSearchUrl ||
      isDead404 ||
      careersUrl.endsWith("/careers") ||
      careersUrl.endsWith("/career") ||
      careersUrl.endsWith("/carrer") ||
      !/^https?:\/\//i.test(careersUrl);

    if (isSuspiciousUrl) {
      const { updateCompanyWithCanonicalUrl } = await import("./canonical-career-search.server");
      const updated = await updateCompanyWithCanonicalUrl(db, company.id, company.name);
      if (updated.updated && updated.newUrl && !isGenericSearchUrl(updated.newUrl)) {
        careersUrl = updated.newUrl;
      } else {
        const verifiedResult = await resolveDirectCareerUrl(company.name, careersUrl || undefined);
        if (
          verifiedResult.isValid &&
          verifiedResult.url &&
          !isGenericSearchUrl(verifiedResult.url)
        ) {
          careersUrl = verifiedResult.url;
          await db
            .from("companies")
            .update({ careers_url: verifiedResult.url })
            .eq("id", company.id);
        } else if (isSearchUrl || isDead404) {
          // Clear corrupted search or dead 404 URL so database stays clean
          careersUrl = null;
          await db.from("companies").update({ careers_url: null }).eq("id", company.id);
        }
      }
    }

    if (!careersUrl || isGenericSearchUrl(careersUrl)) {
      await db
        .from("tracked_companies")
        .update({
          last_checked_at: new Date().toISOString(),
          last_error:
            "Missing authentic direct careers portal link. Generic search results cannot be scanned for jobs.",
        })
        .eq("id", trackedId);
      return { added: 0, checked: company.name, status: "needs_direct_careers_url" };
    }

    let found = await extractJobs(careersUrl, keywords, company.name);

    // Self-healing retry: If 0 jobs found and the URL was a suspected dead or outdated board,
    // re-query canonical career search to discover the authentic career portal.
    if (found.length === 0 && (careersUrl.includes("greenhouse.io") || isSuspiciousUrl)) {
      const resolved = await resolveDirectCareerUrl(company.name, null);
      if (resolved.isValid && resolved.url && resolved.url !== careersUrl) {
        const retryJobs = await extractJobs(resolved.url, keywords, company.name);
        if (retryJobs.length > 0) {
          careersUrl = resolved.url;
          found = retryJobs;
          await db.from("companies").update({ careers_url: resolved.url }).eq("id", company.id);
        }
      }
    }
    const now = new Date().toISOString();
    let added = 0;

    // Always remove previous unapplied jobs for this company so stale/closed roles are purged
    await db.from("jobs").delete().eq("company_id", company.id).neq("status", "applied");

    if (found.length) {
      let scores: Score[] = [];
      try {
        scores = await scoreJobs(resume, found);
      } catch {
        // scoring is non-fatal
      }

      const rows = found.map((f, i) => {
        const s = scores.find((x) => x.index === i);
        return {
          company_id: company.id,
          title: f.title,
          url: f.url,
          location: f.location || null,
          description: f.description || null,
          score: s ? Math.max(0, Math.min(100, s.score)) : null,
          score_summary: s?.summary ?? null,
          matched_skills: s?.matched ?? null,
          missing_skills: s?.missing ?? null,
          status: "open",
          applied: false,
          first_seen_at: now,
          last_seen_at: now,
        };
      });

      const { error: insErr } = await db.from("jobs").insert(rows);
      if (insErr) {
        console.warn("Error inserting jobs:", insErr.message);
      } else {
        added = rows.length;
      }
    }

    await db
      .from("tracked_companies")
      .update({ last_checked_at: now, last_error: null })
      .eq("id", trackedId);

    return { found: found.length, added };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.info(`Scan notice for ${company.name}:`, msg);
    await db
      .from("tracked_companies")
      .update({ last_checked_at: new Date().toISOString(), last_error: msg.slice(0, 300) })
      .eq("id", trackedId);
    return { found: 0, added: 0 };
  }
}
